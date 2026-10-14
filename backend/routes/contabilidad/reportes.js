// Descarga de los formatos 606 a 609 y borrador del IT-1.
//
// DÃ“NDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import reportesRoutes from './routes/contabilidad/reportes.js'
//   app.use('/api/contabilidad/reportes', reportesRoutes)
//
// Mismas reglas que gastos.js (tenant_id en toda consulta, sin leerlo de la peticiÃ³n).
import { Router } from 'express'
import pool from '../../config/database.js'
import { verificarToken } from '../../middleware/auth.js'
import { agregarTenantId } from '../../middleware/tenant.js'
import { periodoValido, rangoDelPeriodo } from '../../services/contabilidad/formatoDGII.js'
import { generar606 } from '../../services/contabilidad/formato606.js'
import { generar607 } from '../../services/contabilidad/formato607.js'
import { generar608 } from '../../services/contabilidad/formato608.js'
import { generar609 } from '../../services/contabilidad/formato609.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

// RNC de la empresa del tenant
async function rncDeLaEmpresa(tenantId) {
  const [rows] = await pool.query('SELECT rnc FROM tenants WHERE id = ?', [tenantId])
  return rows[0]?.rnc
}

function descargar(res, nombre, contenido) {
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.set('Content-Disposition', `attachment; filename="${nombre}"`)
  res.send(contenido)
}

function validarPeriodo(req, res) {
  const { periodo } = req.query
  if (!periodoValido(periodo)) {
    res.status(400).json({ ok: false, mensaje: 'periodo debe tener el formato AAAAMM' })
    return null
  }
  return periodo
}

// GET /api/contabilidad/reportes/606?periodo=AAAAMM
router.get('/606', async (req, res) => {
  const periodo = validarPeriodo(req, res)
  if (!periodo) return
  try {
    const { desde, hasta } = rangoDelPeriodo(periodo)
    const [gastos] = await pool.query(
      `SELECT g.*, c.codigo AS categoria_606_codigo
       FROM gastos g JOIN categorias_606 c ON c.id = g.categoria_606_id
       WHERE g.tenant_id = ? AND g.estado = 'registrado' AND g.es_pago_exterior = 0 AND g.fecha_comprobante BETWEEN ? AND ?
       ORDER BY g.fecha_comprobante, g.id`,
      [req.tenant_id, desde, hasta]
    )
    descargar(res, `DGII_F_606_${periodo}.TXT`, generar606({ rncEmpresa: await rncDeLaEmpresa(req.tenant_id), periodo, gastos }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/contabilidad/reportes/607?periodo=AAAAMM
router.get('/607', async (req, res) => {
  const periodo = validarPeriodo(req, res)
  if (!periodo) return
  try {
    const { desde, hasta } = rangoDelPeriodo(periodo)
    const [facturas] = await pool.query(
      `SELECT f.*, c.rnc AS cliente_rnc
       FROM facturas f JOIN clientes c ON c.id = f.cliente_id
       WHERE f.tenant_id = ? AND f.fecha BETWEEN ? AND ? AND f.estado IN ('emitida', 'anulada')
       ORDER BY f.fecha, f.id`,
      [req.tenant_id, desde, hasta]
    )
    descargar(res, `DGII_F_607_${periodo}.TXT`, generar607({ rncEmpresa: await rncDeLaEmpresa(req.tenant_id), periodo, facturas }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/contabilidad/reportes/608?periodo=AAAAMM
router.get('/608', async (req, res) => {
  const periodo = validarPeriodo(req, res)
  if (!periodo) return
  try {
    const { desde, hasta } = rangoDelPeriodo(periodo)
    const [facturas] = await pool.query(
      `SELECT * FROM facturas WHERE tenant_id = ? AND estado = 'anulada' AND fecha BETWEEN ? AND ? ORDER BY fecha, id`,
      [req.tenant_id, desde, hasta]
    )
    descargar(res, `DGII_F_608_${periodo}.TXT`, generar608({ rncEmpresa: await rncDeLaEmpresa(req.tenant_id), periodo, facturas }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/contabilidad/reportes/609?periodo=AAAAMM
router.get('/609', async (req, res) => {
  const periodo = validarPeriodo(req, res)
  if (!periodo) return
  try {
    const { desde, hasta } = rangoDelPeriodo(periodo)
    const [gastos] = await pool.query(
      `SELECT * FROM gastos WHERE tenant_id = ? AND es_pago_exterior = 1 AND fecha_comprobante BETWEEN ? AND ? ORDER BY fecha_comprobante, id`,
      [req.tenant_id, desde, hasta]
    )
    descargar(res, `DGII_F_609_${periodo}.TXT`, generar609({ rncEmpresa: await rncDeLaEmpresa(req.tenant_id), periodo, gastos }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/contabilidad/reportes/it1?periodo=AAAAMM â€” borrador del IT-1, solo lectura, en JSON.
// ITBIS a pagar = ITBIS facturado en ventas (facturas emitidas) âˆ’ ITBIS adelantado en compras (gastos) âˆ’
// retenciones de ITBIS que le hicieron a la empresa. Es un borrador orientativo, no un envÃ­o formal.
router.get('/it1', async (req, res) => {
  const periodo = validarPeriodo(req, res)
  if (!periodo) return
  try {
    const { desde, hasta } = rangoDelPeriodo(periodo)

    const [[ventas]] = await pool.query(
      `SELECT COALESCE(SUM(itbis), 0) AS itbis_facturado, COALESCE(SUM(ret_itbis), 0) AS itbis_retenido_por_terceros,
              COALESCE(SUM(total), 0) AS total_facturado, COUNT(*) AS cantidad_facturas
       FROM facturas WHERE tenant_id = ? AND estado = 'emitida' AND fecha BETWEEN ? AND ?`,
      [req.tenant_id, desde, hasta]
    )
    const [[compras]] = await pool.query(
      `SELECT COALESCE(SUM(itbis_facturado), 0) AS itbis_adelantado, COALESCE(SUM(itbis_retenido), 0) AS itbis_retenido_a_terceros,
              COALESCE(SUM(monto_retencion_renta), 0) AS isr_retenido, COUNT(*) AS cantidad_gastos
       FROM gastos WHERE tenant_id = ? AND estado = 'registrado' AND fecha_comprobante BETWEEN ? AND ?`,
      [req.tenant_id, desde, hasta]
    )

    const itbisAPagar = Number(ventas.itbis_facturado) - Number(compras.itbis_adelantado) - Number(ventas.itbis_retenido_por_terceros)

    res.json({
      ok: true,
      data: {
        periodo,
        ventas: {
          cantidad_facturas: Number(ventas.cantidad_facturas),
          total_facturado: Number(ventas.total_facturado),
          itbis_facturado: Number(ventas.itbis_facturado),
          itbis_retenido_por_terceros: Number(ventas.itbis_retenido_por_terceros),
        },
        compras: {
          cantidad_gastos: Number(compras.cantidad_gastos),
          itbis_adelantado: Number(compras.itbis_adelantado),
          itbis_retenido_a_terceros: Number(compras.itbis_retenido_a_terceros),
          isr_retenido: Number(compras.isr_retenido),
        },
        itbis_a_pagar: Math.round((itbisAPagar + Number.EPSILON) * 100) / 100,
        nota: 'Borrador orientativo. No sustituye la presentaciÃ³n formal del IT-1 ante la DGII.',
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router


