// Bandeja de e-CF recibidos de proveedores: subir el XML, revisarlo y, si corresponde, aprobarlo para
// precargar un gasto (asÃ­ no se vuelve a escribir a mano lo que ya viene en el XML del proveedor).
//
// DÃ“NDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import ecfRecibidosRoutes from './routes/contabilidad/ecf-recibidos.js'
//   app.use('/api/contabilidad/ecf-recibidos', ecfRecibidosRoutes)
//
// Mismas reglas que gastos.js: `tenant_id = req.tenant_id` en toda consulta, aislamiento probado entre empresas.
import { Router } from 'express'
import pool from '../../config/database.js'
import { verificarToken, soloFacturador } from '../../middleware/auth.js'
import { agregarTenantId } from '../../middleware/tenant.js'
import { leerEcfRecibido, XmlEcfInvalido } from '../../services/contabilidad/receptorEcf.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

// GET /api/contabilidad/ecf-recibidos?estado=pendiente
router.get('/', async (req, res) => {
  const { estado } = req.query
  try {
    let sql = 'SELECT id, encf, tipo_ecf, rnc_emisor, razon_social_emisor, fecha_emision, monto_total, total_itbis, estado, gasto_id FROM ecf_recibidos WHERE tenant_id = ?'
    const params = [req.tenant_id]
    if (estado) { sql += ' AND estado = ?'; params.push(estado) }
    sql += ' ORDER BY created_at DESC'
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/contabilidad/ecf-recibidos/:id  (incluye el XML original, para revisarlo)
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ecf_recibidos WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'e-CF recibido no encontrado' })
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/contabilidad/ecf-recibidos  { xml: '<ECF>...</ECF>' }
router.post('/', soloFacturador, async (req, res) => {
  const { xml } = req.body
  let datos
  try {
    datos = leerEcfRecibido(xml)
  } catch (err) {
    if (err instanceof XmlEcfInvalido) return res.status(400).json({ ok: false, mensaje: err.message })
    throw err
  }

  try {
    const [r] = await pool.query(
      `INSERT INTO ecf_recibidos (tenant_id, encf, tipo_ecf, rnc_emisor, razon_social_emisor, fecha_emision,
         monto_total, total_itbis, codigo_seguridad, xml_original, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant_id, datos.encf, datos.tipo_ecf, datos.rnc_emisor, datos.razon_social_emisor, datos.fecha_emision,
       datos.monto_total, datos.total_itbis, datos.codigo_seguridad, xml, req.usuario?.id || null]
    )
    const [rows] = await pool.query('SELECT * FROM ecf_recibidos WHERE id = ? AND tenant_id = ?', [r.insertId, req.tenant_id])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ese e-CF de ese proveedor ya estÃ¡ en la bandeja' })
    }
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/contabilidad/ecf-recibidos/:id/aprobar  { categoria_606_id }
// Crea un gasto precargado con los datos del e-CF y enlaza ambos registros.
router.post('/:id/aprobar', soloFacturador, async (req, res) => {
  const { categoria_606_id } = req.body
  if (!categoria_606_id) return res.status(400).json({ ok: false, mensaje: 'categoria_606_id es requerido para precargar el gasto' })

  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()
    const [recibidos] = await conexion.query("SELECT * FROM ecf_recibidos WHERE id = ? AND tenant_id = ? AND estado = 'pendiente' FOR UPDATE", [req.params.id, req.tenant_id])
    const recibido = recibidos[0]
    if (!recibido) {
      await conexion.rollback()
      return res.status(404).json({ ok: false, mensaje: 'e-CF recibido no encontrado o ya resuelto' })
    }

    const [g] = await conexion.query(
      `INSERT INTO gastos (tenant_id, proveedor_rnc, proveedor_nombre, categoria_606_id, ncf, fecha_comprobante,
         monto_servicios, monto_bienes, itbis_facturado, origen, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'xml', ?)`,
      [req.tenant_id, recibido.rnc_emisor, recibido.razon_social_emisor || recibido.rnc_emisor, categoria_606_id,
       recibido.encf, recibido.fecha_emision || new Date(), recibido.monto_total - recibido.total_itbis,
       recibido.total_itbis, req.usuario?.id || null]
    )
    await conexion.query("UPDATE ecf_recibidos SET estado = 'aprobado', gasto_id = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?", [g.insertId, req.params.id, req.tenant_id])

    await conexion.commit()
    const [rows] = await pool.query('SELECT * FROM gastos WHERE id = ? AND tenant_id = ?', [g.insertId, req.tenant_id])
    res.json({ ok: true, data: { gasto: rows[0], ecf_recibido_id: Number(req.params.id) } })
  } catch (err) {
    await conexion.rollback()
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ya existe un gasto con ese NCF para ese proveedor' })
    }
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conexion.release()
  }
})

// POST /api/contabilidad/ecf-recibidos/:id/rechazar  { motivo }
router.post('/:id/rechazar', soloFacturador, async (req, res) => {
  try {
    const [existe] = await pool.query("SELECT id FROM ecf_recibidos WHERE id = ? AND tenant_id = ? AND estado = 'pendiente'", [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'e-CF recibido no encontrado o ya resuelto' })

    await pool.query("UPDATE ecf_recibidos SET estado = 'rechazado', motivo_rechazo = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?", [req.body.motivo || null, req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'e-CF recibido rechazado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router


