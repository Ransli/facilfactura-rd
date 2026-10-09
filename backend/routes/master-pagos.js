import { Router } from 'express'
import pool from '../config/database.js'
import { verificarTokenMaster } from '../middleware/master.js'
import * as pagos from '../services/master/pagos.js'

const router = Router()
router.use(verificarTokenMaster)

// GET /api/master/pagos?tenant_id=
router.get('/', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : undefined
    res.json({ ok: true, data: await pagos.listarPagos(pool, { tenantId }) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/master/pagos/cambios-plan?tenant_id=
router.get('/cambios-plan', async (req, res) => {
  try {
    const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : undefined
    res.json({ ok: true, data: await pagos.listarCambiosDePlan(pool, { tenantId }) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
