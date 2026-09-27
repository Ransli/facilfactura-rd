// Retenciones de ITBIS e ISR asociadas a un gasto.
//
// DÓNDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import retencionesRoutes from './routes/contabilidad/retenciones.js'
//   app.use('/api/contabilidad/retenciones', retencionesRoutes)
//
// Mismas reglas que gastos.js: `tenant_id = req.tenant_id` en TODA consulta y aislamiento entre empresas probado.
import { Router } from 'express'
import { verificarToken } from '../../middleware/auth.js'

const router = Router()
router.use(verificarToken)

router.use((req, res, next) => {
  if (!req.tenant_id) {
    return res.status(501).json({ ok: false, mensaje: 'Pendiente: requiere el módulo de multi-empresa (tenancy)' })
  }
  next()
})

// TODO (3 oct):
//  GET  /?gasto_id=   → retenciones de un gasto de esta empresa (verifica que el gasto sea del tenant)
//  POST /             → { gasto_id, tipo: 'itbis' | 'isr', porcentaje } calcula `monto` sobre el gasto:
//                       ITBIS: itbis_facturado × porcentaje / 100   ·   ISR: (monto_servicios + monto_bienes) × porcentaje / 100
//                       y actualiza gastos.itbis_retenido / gastos.monto_retencion_renta en la misma transacción
//  DELETE /:id        → revierte la retención y recalcula el gasto
// Redondeo a 2 decimales igual que en facturas (Math.round((n + Number.EPSILON) * 100) / 100).

export default router
