// Gastos de la empresa (base del formato 606).
//
// DÓNDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import gastosRoutes from './routes/contabilidad/gastos.js'
//   app.use('/api/contabilidad/gastos', gastosRoutes)
//
// REGLA DE ORO (multi-tenant): TODA consulta lleva `tenant_id = req.tenant_id`. Nunca leas el tenant del cuerpo,
// de la URL ni de los parámetros. `req.tenant_id` lo fija el middleware de aislamiento de Ransli (`tenancy`,
// previsto para el 1 de octubre); hasta entonces este archivo responde 501.
import { Router } from 'express'
import pool from '../../config/database.js'
import { verificarToken, soloFacturador } from '../../middleware/auth.js'
import { esReferenciaInexistente, mensajeReferencia } from '../../utils/referencias.js'

const router = Router()
router.use(verificarToken)

// Mientras `tenancy` no esté publicada no existe req.tenant_id: se responde 501 en vez de mezclar empresas.
router.use((req, res, next) => {
  if (!req.tenant_id) {
    return res.status(501).json({ ok: false, mensaje: 'Pendiente: requiere el módulo de multi-empresa (tenancy)' })
  }
  next()
})

// GET /api/contabilidad/gastos?desde=&hasta=&buscar=
router.get('/', async (req, res) => {
  const { desde, hasta, buscar } = req.query
  try {
    let sql = `SELECT g.*, c.codigo AS categoria_606_codigo, c.nombre AS categoria_606_nombre
               FROM gastos g JOIN categorias_606 c ON c.id = g.categoria_606_id
               WHERE g.tenant_id = ?`
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

// POST /api/contabilidad/gastos
router.post('/', soloFacturador, async (req, res) => {
  const g = req.body
  // TODO: validar formato del NCF (11 o 13 caracteres), RNC del proveedor (9 u 11 dígitos), fechas y montos >= 0
  if (!g.proveedor_rnc || !g.proveedor_nombre || !g.categoria_606_id || !g.ncf || !g.fecha_comprobante) {
    return res.status(400).json({ ok: false, mensaje: 'proveedor_rnc, proveedor_nombre, categoria_606_id, ncf y fecha_comprobante son requeridos' })
  }
  try {
    const [r] = await pool.query(
      `INSERT INTO gastos (tenant_id, proveedor_rnc, proveedor_nombre, categoria_606_id, ncf, ncf_modificado,
         fecha_comprobante, fecha_pago, monto_servicios, monto_bienes, itbis_facturado, itbis_retenido,
         itbis_llevado_al_costo, itbis_por_adelantar, monto_retencion_renta, propina_legal, forma_pago, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant_id, g.proveedor_rnc, g.proveedor_nombre, g.categoria_606_id, g.ncf, g.ncf_modificado || null,
       g.fecha_comprobante, g.fecha_pago || null, g.monto_servicios || 0, g.monto_bienes || 0, g.itbis_facturado || 0,
       g.itbis_retenido || 0, g.itbis_llevado_al_costo || 0, g.itbis_por_adelantar || 0, g.monto_retencion_renta || 0,
       g.propina_legal || 0, g.forma_pago || 1, req.usuario?.id || null]
    )
    const [rows] = await pool.query('SELECT * FROM gastos WHERE id = ? AND tenant_id = ?', [r.insertId, req.tenant_id])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ese comprobante ya está registrado para el proveedor' })
    }
    if (esReferenciaInexistente(err)) return res.status(400).json({ ok: false, mensaje: mensajeReferencia(err) })
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// TODO (2 oct): GET /:id, PUT /:id y DELETE /:id (marcar como 'anulado', no borrar), todos con
// `AND tenant_id = ?`. Cada uno con su prueba, incluida la de aislamiento entre empresas.

export default router
