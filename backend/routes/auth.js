import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pool from '../config/database.js'
import { verificarToken } from '../middleware/auth.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ ok: false, mensaje: 'Email y contraseña requeridos' })
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.*, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.email = ? AND u.activo = 1`,
      [email]
    )

    const usuario = rows[0]

    if (!usuario) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' })
    }

    const valido = await bcrypt.compare(password, usuario.password_hash)
    if (!valido) {
      return res.status(401).json({ ok: false, mensaje: 'Credenciales incorrectas' })
    }

    await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [usuario.id])

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    )

    res.json({
      ok: true,
      token,
      usuario: {
        id:     usuario.id,
        nombre: usuario.nombre,
        email:  usuario.email,
        rol:    usuario.rol,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/auth/me
router.get('/me', verificarToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.email, r.nombre AS rol, u.ultimo_acceso
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE u.id = ? AND u.activo = 1`,
      [req.usuario.id]
    )

    if (!rows[0]) {
      return res.status(401).json({ ok: false, mensaje: 'Usuario no encontrado' })
    }

    res.json({ ok: true, usuario: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
