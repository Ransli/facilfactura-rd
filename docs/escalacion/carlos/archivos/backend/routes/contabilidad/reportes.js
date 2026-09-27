// Descarga de los formatos 606 a 609 y borrador del IT-1.
//
// DÓNDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import reportesRoutes from './routes/contabilidad/reportes.js'
//   app.use('/api/contabilidad/reportes', reportesRoutes)
//
// Mismas reglas que gastos.js (tenant_id en toda consulta, sin leerlo de la petición).
import { Router } from 'express'
import pool from '../../config/database.js'
import { verificarToken } from '../../middleware/auth.js'
import { periodoValido, rangoDelPeriodo } from '../../services/contabilidad/formatoDGII.js'
import { generar606 } from '../../services/contabilidad/formato606.js'

const router = Router()
router.use(verificarToken)

router.use((req, res, next) => {
  if (!req.tenant_id) {
    return res.status(501).json({ ok: false, mensaje: 'Pendiente: requiere el módulo de multi-empresa (tenancy)' })
  }
  next()
})

// RNC de la empresa del tenant (sale de la tabla `tenants`, que crea `tenancy`)
async function rncDeLaEmpresa(tenantId) {
  const [rows] = await pool.query('SELECT rnc FROM tenants WHERE id = ?', [tenantId])
  return rows[0]?.rnc
}

function descargar(res, nombre, contenido) {
  res.set('Content-Type', 'text/plain; charset=utf-8')
  res.set('Content-Disposition', `attachment; filename="${nombre}"`)
  res.send(contenido)
}

// GET /api/contabilidad/reportes/606?periodo=AAAAMM
router.get('/606', async (req, res) => {
  const { periodo } = req.query
  if (!periodoValido(periodo)) return res.status(400).json({ ok: false, mensaje: 'periodo debe tener el formato AAAAMM' })
  try {
    const { desde, hasta } = rangoDelPeriodo(periodo)
    const [gastos] = await pool.query(
      `SELECT g.*, c.codigo AS categoria_606_codigo
       FROM gastos g JOIN categorias_606 c ON c.id = g.categoria_606_id
       WHERE g.tenant_id = ? AND g.estado = 'registrado' AND g.fecha_comprobante BETWEEN ? AND ?
       ORDER BY g.fecha_comprobante, g.id`,
      [req.tenant_id, desde, hasta]
    )
    descargar(res, `DGII_F_606_${periodo}.TXT`, generar606({ rncEmpresa: await rncDeLaEmpresa(req.tenant_id), periodo, gastos }))
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// TODO (5 oct): GET /607?periodo=  → facturas del tenant en el período (JOIN clientes para cliente_rnc) + generar607
// TODO (6 oct): GET /608?periodo=  → facturas anuladas del período + generar608
//               GET /609?periodo=  → pagos al exterior + generar609
// TODO (8 oct): GET /it1?periodo=  → borrador del IT-1: ITBIS facturado en ventas (facturas emitidas) menos ITBIS
//               adelantado en compras (gastos) y retenciones, por período. Solo lectura, en JSON.

export default router
