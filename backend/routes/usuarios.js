import { Router } from 'express'
import bcrypt from 'bcryptjs'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'

const router = Router()

// La gestión de usuarios es exclusiva del administrador
router.use(verificarToken, soloAdmin)

// GET /api/usuarios/roles — roles disponibles para el selector
router.get('/roles', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre, descripcion FROM roles ORDER BY id')
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/usuarios?buscar=texto
router.get('/', async (req, res) => {
  const { buscar } = req.query
  try {
    let sql = `
      SELECT u.id, u.nombre, u.email, u.rol_id, r.nombre AS rol, u.activo, u.ultimo_acceso, u.created_at
      FROM usuarios u
      JOIN roles r ON r.id = u.rol_id
      WHERE 1 = 1`
    const params = []
    if (buscar) {
      sql += ` AND (u.nombre LIKE ? OR u.email LIKE ?)`
      params.push(`%${buscar}%`, `%${buscar}%`)
    }
    sql += ` ORDER BY u.activo DESC, u.nombre`
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/usuarios — crear empleado
router.post('/', async (req, res) => {
  const { nombre, email, password, rol_id } = req.body

  if (!nombre || !email || !password || !rol_id) {
    return res.status(400).json({ ok: false, mensaje: 'nombre, email, password y rol_id son requeridos' })
  }
  if (String(password).length < 6) {
    return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres' })
  }

  try {
    const password_hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)`,
      [nombre, email, password_hash, rol_id]
    )
    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol_id, r.nombre AS rol, u.activo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?`,
      [result.insertId]
    )
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ya existe un usuario con ese email' })
    }
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/usuarios/:id — editar (la contraseña solo se cambia si se envía)
router.put('/:id', async (req, res) => {
  const { nombre, email, rol_id, activo, password } = req.body
  if (!nombre || !email || !rol_id) {
    return res.status(400).json({ ok: false, mensaje: 'nombre, email y rol_id son requeridos' })
  }

  try {
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ ok: false, mensaje: 'La contraseña debe tener al menos 6 caracteres' })
      }
      const password_hash = await bcrypt.hash(password, 10)
      await pool.query(
        `UPDATE usuarios SET nombre=?, email=?, rol_id=?, activo=?, password_hash=?, updated_at=NOW() WHERE id=?`,
        [nombre, email, rol_id, activo ?? 1, password_hash, req.params.id]
      )
    } else {
      await pool.query(
        `UPDATE usuarios SET nombre=?, email=?, rol_id=?, activo=?, updated_at=NOW() WHERE id=?`,
        [nombre, email, rol_id, activo ?? 1, req.params.id]
      )
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.rol_id, r.nombre AS rol, u.activo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = ?`,
      [req.params.id]
    )
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ ok: false, mensaje: 'Ya existe un usuario con ese email' })
    }
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/usuarios/:id — desactivar (soft delete). No permite auto-desactivarse.
router.delete('/:id', async (req, res) => {
  if (String(req.usuario.id) === String(req.params.id)) {
    return res.status(400).json({ ok: false, mensaje: 'No puedes desactivar tu propia cuenta' })
  }
  try {
    await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true, mensaje: 'Usuario desactivado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
