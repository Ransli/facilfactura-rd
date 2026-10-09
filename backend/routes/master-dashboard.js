import { Router } from 'express'
import pool from '../config/database.js'
import { verificarTokenMaster } from '../middleware/master.js'
import * as dashboard from '../services/master/dashboard.js'

const router = Router()
router.use(verificarTokenMaster)

// GET /api/master/dashboard
router.get('/', async (req, res) => {
  try {
    res.json({ ok: true, data: await dashboard.obtener(pool) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
