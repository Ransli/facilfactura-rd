import { Router } from 'express'
import { verificarToken } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import pool from '../config/database.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'
import { obtenerLimites } from '../services/suscripcion/limites.js'

const router = Router()

// GET /api/suscripcion/mi-suscripcion — plan, estado y avisos de la empresa (también con la empresa bloqueada).
// Es solo lectura: cambiar el plan o el estado de una empresa es tarea de la consola master, no de la propia empresa.
router.get('/mi-suscripcion', verificarToken, agregarTenantId, verificarSuscripcion, (req, res) => {
  res.json({ ok: true, data: req.suscripcion })
})

// GET /api/suscripcion/limites — uso frente al máximo del plan (usuarios, clientes y e-CF del mes)
router.get('/limites', verificarToken, agregarTenantId, verificarSuscripcion, async (req, res) => {
  try {
    res.json({ ok: true, data: await obtenerLimites(pool, req.tenant_id, req.suscripcion.plan) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
