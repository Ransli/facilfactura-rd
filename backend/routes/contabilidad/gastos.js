// Gastos de la empresa (base del formato 606 y, cuando estÃ¡n marcados como pago al exterior, del 609).
//
// DÃ“NDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import gastosRoutes from './routes/contabilidad/gastos.js'
//   app.use('/api/contabilidad/gastos', gastosRoutes)
//
// REGLA DE ORO (multi-tenant): TODA consulta lleva `tenant_id = req.tenant_id`. Nunca se lee el tenant del cuerpo,
// de la URL ni de los parÃ¡metros; lo fija `agregarTenantId` (middleware/tenant.js), igual que en el resto del sistema.
import { Router } from 'express'
import pool from '../../config/database.js'
import { verificarToken, soloFacturador } from '../../middleware/auth.js'
import { agregarTenantId } from '../../middleware/tenant.js'
import { esReferenciaInexistente, mensajeReferencia } from '../../utils/referencias.js'
import { soloDigitos } from '../../services/contabilidad/formatoDGII.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

// GET /api/contabilidad/gastos/categorias-606 â€” catÃ¡logo global, igual para todas las empresas (va ANTES de
// /:id para que Express no lo confunda con un id).
router.get('/categorias-606', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, codigo, nombre FROM categorias_606 ORDER BY codigo')
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

function errores(g) {
  const problemas = []
  // Un beneficiario en el exterior (formato 609) normalmente no tiene RNC ni cÃ©dula dominicana: solo se exige
  // el formato 9/11 dÃ­gitos para proveedores locales.
  if (!g.es_pago_exterior) {
    const rnc = soloDigitos(g.proveedor_rnc)
    if (!g.proveedor_rnc || ![9, 11].includes(rnc.length)) problemas.push('proveedor_rnc debe tener 9 (RNC) u 11 (cÃ©dula) dÃ­gitos')
  }
  if (!g.proveedor_nombre) problemas.push('proveedor_nombre es requerido')
  if (!g.categoria_606_id) problemas.push('categoria_606_id es requerido')
  if (!g.ncf || ![11, 13].includes(String(g.ncf).length)) problemas.push('ncf debe tener 11 (NCF) o 13 (e-NCF) caracteres')
  if (!g.fecha_comprobante || Number.isNaN(Date.parse(g.fecha_comprobante))) problemas.push('fecha_comprobante es requerida y debe ser una fecha vÃ¡lida')
  if (g.fecha_pago && Number.isNaN(Date.parse(g.fecha_pago))) problemas.push('fecha_pago no es una fecha vÃ¡lida')
  for (const campo of ['monto_servicios', 'monto_bienes', 'itbis_facturado', 'itbis_retenido', 'itbis_llevado_al_costo', 'itbis_por_adelantar', 'monto_retencion_renta', 'propina_legal']) {
    if (g[campo] !== undefined && Number(g[campo]) < 0) problemas.push(`${campo} no puede ser negativo`)
  }
  if (g.es_pago_exterior && !g.pais_beneficiario) problemas.push('pais_beneficiario es requerido cuando es_pago_exterior es verdadero')
  return problemas
}

// GET /api/contabilidad/gastos?desde=&hasta=&buscar=
router.get('/', async (req, res) => {
  const { desde, hasta, buscar } = req.query
  try {
    let sql = `SELECT g.*, c.codigo AS categoria_606_codigo, c.nombre AS categoria_606_nombre
               FROM gastos g JOIN categorias_606 c ON c.id = g.categoria_606_id
               WHERE g.tenant_id = ? AND g.estado = 'registrado'`
    const params = [req.tenant_id]
    if (desde)  { sql += ' AND g.fecha_comprobante >= ?'; params.push(desde) }
    if (hasta)  { sql += ' AND g.fecha_comprobante <= ?'; params.push(hasta) }
    if (buscar) { sql += ' AND (g.proveedor_nombre LIKE ? OR g.proveedor_rnc LIKE ? OR g.ncf LIKE ?)'; params.push(`%${buscar}%`, `%${buscar}%`, `%${buscar}%`) }
    sql += ' ORDER BY g.fecha_comprobante DESC, g.id DESC'
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/contabilidad/gastos/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.*, c.codigo AS categoria_606_codigo, c.nombre AS categoria_606_nombre
       FROM gastos g JOIN categorias_606 c ON c.id = g.categoria_606_id
       WHERE g.id = ? AND g.tenant_id = ?`,
      [req.params.id, req.tenant_id]
    )
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Gasto no encontrado' })
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/contabilidad/gastos
router.post('/', soloFacturador, async (req, res) => {
  const g = req.body
  const problemas = errores(g)
  if (problemas.length) return res.status(400).json({ ok: false, mensaje: problemas[0], errores: problemas })

  try {
    // categorias_606 es un catÃ¡logo global (sin tenant_id): si categoria_606_id no existe, la FK de la propia
    // base lo rechaza y cae en esReferenciaInexistente mÃ¡s abajo; no hace falta comprobarlo aparte.
    const [r] = await pool.query(
      `INSERT INTO gastos (tenant_id, proveedor_rnc, proveedor_nombre, categoria_606_id, ncf, ncf_modificado,
         fecha_comprobante, fecha_pago, monto_servicios, monto_bienes, itbis_facturado, itbis_retenido,
         itbis_llevado_al_costo, itbis_por_adelantar, monto_retencion_renta, propina_legal, forma_pago,
         es_pago_exterior, pais_beneficiario, tipo_renta_exterior, origen, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant_id, g.proveedor_rnc, g.proveedor_nombre, g.categoria_606_id, g.ncf, g.ncf_modificado || null,
       g.fecha_comprobante, g.fecha_pago || null, g.monto_servicios || 0, g.monto_bienes || 0, g.itbis_facturado || 0,
       g.itbis_retenido || 0, g.itbis_llevado_al_costo || 0, g.itbis_por_adelantar || 0, g.monto_retencion_renta || 0,
       g.propina_legal || 0, g.forma_pago || 1, !!g.es_pago_exterior, g.pais_beneficiario || null,
       g.tipo_renta_exterior || null, g.origen || 'manual', req.usuario?.id || null]
    )
    const [rows] = await pool.query('SELECT * FROM gastos WHERE id = ? AND tenant_id = ?', [r.insertId, req.tenant_id])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ese comprobante ya estÃ¡ registrado para el proveedor' })
    }
    if (esReferenciaInexistente(err)) return res.status(400).json({ ok: false, mensaje: mensajeReferencia(err) })
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/contabilidad/gastos/:id
router.put('/:id', soloFacturador, async (req, res) => {
  const g = req.body
  const problemas = errores(g)
  if (problemas.length) return res.status(400).json({ ok: false, mensaje: problemas[0], errores: problemas })

  try {
    const [existe] = await pool.query("SELECT id FROM gastos WHERE id = ? AND tenant_id = ? AND estado = 'registrado'", [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Gasto no encontrado' })

    await pool.query(
      `UPDATE gastos SET proveedor_rnc=?, proveedor_nombre=?, categoria_606_id=?, ncf=?, ncf_modificado=?,
         fecha_comprobante=?, fecha_pago=?, monto_servicios=?, monto_bienes=?, itbis_facturado=?, itbis_retenido=?,
         itbis_llevado_al_costo=?, itbis_por_adelantar=?, monto_retencion_renta=?, propina_legal=?, forma_pago=?,
         es_pago_exterior=?, pais_beneficiario=?, tipo_renta_exterior=?, updated_at=NOW()
       WHERE id=? AND tenant_id=?`,
      [g.proveedor_rnc, g.proveedor_nombre, g.categoria_606_id, g.ncf, g.ncf_modificado || null,
       g.fecha_comprobante, g.fecha_pago || null, g.monto_servicios || 0, g.monto_bienes || 0, g.itbis_facturado || 0,
       g.itbis_retenido || 0, g.itbis_llevado_al_costo || 0, g.itbis_por_adelantar || 0, g.monto_retencion_renta || 0,
       g.propina_legal || 0, g.forma_pago || 1, !!g.es_pago_exterior, g.pais_beneficiario || null,
       g.tipo_renta_exterior || null, req.params.id, req.tenant_id]
    )
    const [rows] = await pool.query('SELECT * FROM gastos WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ese comprobante ya estÃ¡ registrado para el proveedor' })
    }
    if (esReferenciaInexistente(err)) return res.status(400).json({ ok: false, mensaje: mensajeReferencia(err) })
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/contabilidad/gastos/:id â€” anula, no borra (los formatos DGII deben poder explicar un gasto que
// existiÃ³ y se anulÃ³, igual que una factura anulada).
router.delete('/:id', soloFacturador, async (req, res) => {
  try {
    const [existe] = await pool.query('SELECT id FROM gastos WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Gasto no encontrado' })

    await pool.query("UPDATE gastos SET estado = 'anulado', updated_at = NOW() WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Gasto anulado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router


