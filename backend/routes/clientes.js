import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloFacturador } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'

const router = Router()
router.use(verificarToken, agregarTenantId, verificarSuscripcion)

// GET /api/clientes?buscar=nombre
router.get('/', async (req, res) => {
  const { buscar } = req.query
  try {
    let sql = `SELECT * FROM clientes WHERE tenant_id = ? AND activo = 1`
    const params = [req.tenant_id]

    if (buscar) {
      sql += ` AND (nombre LIKE ? OR rnc LIKE ?)`
      params.push(`%${buscar}%`, `%${buscar}%`)
    }

    sql += ` ORDER BY nombre`
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND tenant_id = ? AND activo = 1', [req.params.id, req.tenant_id])
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' })
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/clientes
router.post('/', soloFacturador, async (req, res) => {
  const { nombre, rnc, telefono, celular, email, direccion, ciudad, tipo } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    const [result] = await pool.query(
      `INSERT INTO clientes (tenant_id, nombre, rnc, telefono, celular, email, direccion, ciudad, tipo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant_id, nombre, rnc || null, telefono || null, celular || null,
       email || null, direccion || null, ciudad || null, tipo || 'empresa']
    )
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND tenant_id = ?', [result.insertId, req.tenant_id])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/clientes/:id
router.put('/:id', soloFacturador, async (req, res) => {
  const { nombre, rnc, telefono, celular, email, direccion, ciudad, tipo } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    const [existe] = await pool.query('SELECT id FROM clientes WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' })

    await pool.query(
      `UPDATE clientes SET nombre=?, rnc=?, telefono=?, celular=?, email=?,
       direccion=?, ciudad=?, tipo=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
      [nombre, rnc || null, telefono || null, celular || null,
       email || null, direccion || null, ciudad || null, tipo || 'empresa', req.params.id, req.tenant_id]
    )
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/clientes/:id (soft delete)
router.delete('/:id', soloFacturador, async (req, res) => {
  try {
    const [existe] = await pool.query('SELECT id FROM clientes WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' })

    await pool.query('UPDATE clientes SET activo = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Cliente eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
