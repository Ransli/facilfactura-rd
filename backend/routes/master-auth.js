import { Router } from 'express'
import pool from '../config/database.js'
import { autenticarMaster, ErrorDeAutenticacion } from '../services/master/autenticacion.js'
import { verificarTokenMaster } from '../middleware/master.js'

const router = Router()

// POST /api/master/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ ok: false, mensaje: 'Email y contraseña son requeridos' })
  }
  try {
    const { token, master } = await autenticarMaster(pool, { email, password })
    res.json({ ok: true, token, master })
  } catch (err) {
    if (err instanceof ErrorDeAutenticacion) return res.status(err.estado).json({ ok: false, mensaje: err.message })
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/master/auth/me — confirma la sesión y refresca los datos del master
router.get('/me', verificarTokenMaster, async (req, res) => {
  const [[fila]] = await pool.query('SELECT id, nombre, email FROM usuarios_plataforma WHERE id = ?', [req.master.id])
  if (!fila) return res.status(401).json({ ok: false, mensaje: 'Sesión no válida' })
  res.json({ ok: true, master: fila })
})

export default router
