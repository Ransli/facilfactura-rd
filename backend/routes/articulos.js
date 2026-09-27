import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { primeraReferenciaAjena, esReferenciaInexistente, mensajeReferencia } from '../utils/referencias.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

const SQL_PRECIOS = `
  SELECT ap.*, u.nombre AS unidad_nombre, u.abreviatura
  FROM articulo_precios ap
  JOIN unidades_medida u ON u.id = ap.unidad_medida_id
  WHERE ap.articulo_id = ? AND ap.tenant_id = ?
  ORDER BY ap.es_precio_default DESC`

// Referencias del cuerpo (categoría, unidad y unidades de los precios) que no pertenecen a la empresa
function referenciasDelArticulo({ categoria_id, unidad_medida_id, precios }) {
  return [
    { columna: 'categoria_id', id: categoria_id },
    { columna: 'unidad_medida_id', id: unidad_medida_id },
    ...(Array.isArray(precios) ? precios.map((p) => ({ columna: 'unidad_medida_id', id: p.unidad_medida_id })) : []),
  ]
}

async function guardarPrecios(conn, tenantId, articuloId, precios) {
  for (const p of precios) {
    await conn.query(
      `INSERT INTO articulo_precios (tenant_id, articulo_id, unidad_medida_id, precio_unitario, precio_detalle, precio_mayoreo, es_precio_default)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, articuloId, p.unidad_medida_id, p.precio_unitario || 0,
       p.precio_detalle || null, p.precio_mayoreo || null, p.es_precio_default ? 1 : 0]
    )
  }
}

// GET /api/articulos?tipo=producto|servicio&categoria=1&buscar=texto
router.get('/', async (req, res) => {
  const { tipo, categoria, buscar } = req.query
  try {
    let sql = `
      SELECT a.*,
             c.nombre       AS categoria_nombre,
             c.orden        AS categoria_orden,
             u.nombre       AS unidad_nombre,
             u.abreviatura  AS unidad_abreviatura
      FROM articulos a
      JOIN categorias c ON c.id = a.categoria_id
      JOIN unidades_medida u ON u.id = a.unidad_medida_id
      WHERE a.tenant_id = ? AND a.activo = 1`
    const params = [req.tenant_id]

    if (tipo)      { sql += ` AND a.tipo = ?`;         params.push(tipo) }
    if (categoria) { sql += ` AND a.categoria_id = ?`; params.push(categoria) }
    if (buscar)    { sql += ` AND (a.nombre LIKE ? OR a.codigo LIKE ?)`; params.push(`%${buscar}%`, `%${buscar}%`) }

    sql += ` ORDER BY c.orden, c.nombre, a.nombre`
    const [rows] = await pool.query(sql, params)

    for (const art of rows) {
      const [precios] = await pool.query(SQL_PRECIOS, [art.id, req.tenant_id])
      art.precios = precios
    }

    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/articulos/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*,
              c.nombre AS categoria_nombre,
              u.nombre AS unidad_nombre, u.abreviatura AS unidad_abreviatura
       FROM articulos a
       JOIN categorias c ON c.id = a.categoria_id
       JOIN unidades_medida u ON u.id = a.unidad_medida_id
       WHERE a.id = ? AND a.tenant_id = ?`,
      [req.params.id, req.tenant_id]
    )
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Artículo no encontrado' })

    const [precios] = await pool.query(SQL_PRECIOS, [rows[0].id, req.tenant_id])
    rows[0].precios = precios

    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/articulos
router.post('/', soloAdmin, async (req, res) => {
  const { categoria_id, tipo, codigo, nombre, descripcion,
          unidad_medida_id, tiene_dimensiones, precios } = req.body

  if (!nombre || !categoria_id || !unidad_medida_id) {
    return res.status(400).json({ ok: false, mensaje: 'nombre, categoria_id y unidad_medida_id son requeridos' })
  }

  const conn = await pool.getConnection()
  try {
    const ajena = await primeraReferenciaAjena(conn, req.tenant_id, referenciasDelArticulo(req.body))
    if (ajena) return res.status(400).json({ ok: false, mensaje: ajena })

    await conn.beginTransaction()

    const [result] = await conn.query(
      `INSERT INTO articulos (tenant_id, categoria_id, tipo, codigo, nombre, descripcion, unidad_medida_id, tiene_dimensiones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant_id, categoria_id, tipo || 'producto', codigo || null, nombre,
       descripcion || null, unidad_medida_id, tiene_dimensiones ? 1 : 0]
    )

    const articuloId = result.insertId
    if (Array.isArray(precios) && precios.length > 0) await guardarPrecios(conn, req.tenant_id, articuloId, precios)

    await conn.commit()

    const [rows] = await pool.query('SELECT * FROM articulos WHERE id = ? AND tenant_id = ?', [articuloId, req.tenant_id])
    const [preciosGuardados] = await pool.query(SQL_PRECIOS, [articuloId, req.tenant_id])
    rows[0].precios = preciosGuardados

    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ ok: false, mensaje: 'Ya existe un artículo con ese código' })
    if (esReferenciaInexistente(err)) return res.status(400).json({ ok: false, mensaje: mensajeReferencia(err) })
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conn.release()
  }
})

// PUT /api/articulos/:id
router.put('/:id', soloAdmin, async (req, res) => {
  const { categoria_id, tipo, codigo, nombre, descripcion,
          unidad_medida_id, tiene_dimensiones, precios } = req.body

  if (!nombre || !categoria_id || !unidad_medida_id) {
    return res.status(400).json({ ok: false, mensaje: 'nombre, categoria_id y unidad_medida_id son requeridos' })
  }

  const conn = await pool.getConnection()
  try {
    const [existe] = await conn.query('SELECT id FROM articulos WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Artículo no encontrado' })

    const ajena = await primeraReferenciaAjena(conn, req.tenant_id, referenciasDelArticulo(req.body))
    if (ajena) return res.status(400).json({ ok: false, mensaje: ajena })

    await conn.beginTransaction()

    await conn.query(
      `UPDATE articulos SET categoria_id=?, tipo=?, codigo=?, nombre=?, descripcion=?,
       unidad_medida_id=?, tiene_dimensiones=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
      [categoria_id, tipo || 'producto', codigo || null, nombre,
       descripcion || null, unidad_medida_id, tiene_dimensiones ? 1 : 0, req.params.id, req.tenant_id]
    )

    if (Array.isArray(precios)) {
      await conn.query('DELETE FROM articulo_precios WHERE articulo_id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
      await guardarPrecios(conn, req.tenant_id, req.params.id, precios)
    }

    await conn.commit()

    const [rows] = await pool.query('SELECT * FROM articulos WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    const [preciosGuardados] = await pool.query(SQL_PRECIOS, [req.params.id, req.tenant_id])
    rows[0].precios = preciosGuardados

    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    await conn.rollback()
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ ok: false, mensaje: 'Ya existe un artículo con ese código' })
    if (esReferenciaInexistente(err)) return res.status(400).json({ ok: false, mensaje: mensajeReferencia(err) })
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conn.release()
  }
})

// DELETE /api/articulos/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    const [existe] = await pool.query('SELECT id FROM articulos WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Artículo no encontrado' })

    await pool.query('UPDATE articulos SET activo = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Artículo eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
