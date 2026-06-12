import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// GET /api/unidades-medida
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM unidades_medida WHERE activo = 1 ORDER BY nombre')
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
