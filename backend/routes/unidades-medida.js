import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'

const router = Router()
router.use(verificarToken, agregarTenantId, verificarSuscripcion)

// GET /api/unidades-medida — las unidades de la empresa (cada empresa recibe las suyas al crearse)
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM unidades_medida WHERE tenant_id = ? AND activo = 1 ORDER BY nombre', [req.tenant_id])
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
