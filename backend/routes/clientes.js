import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// GET /api/clientes?buscar=nombre
router.get('/', async (req, res) => {
  const { buscar } = req.query
  try {
    let sql = `SELECT * FROM clientes WHERE activo = 1`
    const params = []

    if (buscar) {
      sql += ` AND (nombre LIKE ? OR rnc LIKE ?)`
      params.push(`%${buscar}%`, `%${buscar}%`)
    }

    sql += ` ORDER BY nombre`
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/clientes/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ? AND activo = 1', [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' })
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/clientes
router.post('/', async (req, res) => {
  const { nombre, rnc, telefono, celular, email, direccion, ciudad, tipo } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    const [result] = await pool.query(
      `INSERT INTO clientes (nombre, rnc, telefono, celular, email, direccion, ciudad, tipo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nombre, rnc || null, telefono || null, celular || null,
       email || null, direccion || null, ciudad || null, tipo || 'empresa']
    )
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [result.insertId])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/clientes/:id
router.put('/:id', async (req, res) => {
  const { nombre, rnc, telefono, celular, email, direccion, ciudad, tipo } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    await pool.query(
      `UPDATE clientes SET nombre=?, rnc=?, telefono=?, celular=?, email=?,
       direccion=?, ciudad=?, tipo=?, updated_at=NOW() WHERE id=?`,
      [nombre, rnc || null, telefono || null, celular || null,
       email || null, direccion || null, ciudad || null, tipo || 'empresa', req.params.id]
    )
    const [rows] = await pool.query('SELECT * FROM clientes WHERE id = ?', [req.params.id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/clientes/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('UPDATE clientes SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true, mensaje: 'Cliente eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
