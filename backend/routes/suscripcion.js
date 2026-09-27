import { Router } from 'express'
import { verificarToken } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import pool from '../config/database.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'
import { obtenerLimites } from '../services/suscripcion/limites.js'

const router = Router()

// GET /api/suscripcion/planes — planes disponibles. Público: lo necesita la pantalla de registro de empresas.
router.get('/planes', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nombre, slug, descripcion, precio_mensual, moneda, max_usuarios, max_clientes, max_ecf_mes,
              es_plan_prueba, dias_prueba, orden
       FROM planes WHERE activo = 1 ORDER BY orden, id`)
    res.json({ ok: true, data: rows.map((p) => ({ ...p, precio_mensual: Number(p.precio_mensual), es_plan_prueba: !!p.es_plan_prueba })) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

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
