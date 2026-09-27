import { Router } from 'express'
import { verificarToken } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'

const router = Router()

// GET /api/suscripcion/mi-suscripcion — plan, estado y avisos de la empresa (también con la empresa bloqueada).
// Es solo lectura: cambiar el plan o el estado de una empresa es tarea de la consola master, no de la propia empresa.
router.get('/mi-suscripcion', verificarToken, agregarTenantId, verificarSuscripcion, (req, res) => {
  res.json({ ok: true, data: req.suscripcion })
})

export default router
