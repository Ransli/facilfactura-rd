import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// GET /api/categorias?tipo=producto|servicio|ambos
router.get('/', async (req, res) => {
  const { tipo } = req.query
  try {
    let sql = `SELECT * FROM categorias WHERE activo = 1`
    const params = []
    if (tipo) { sql += ` AND tipo = ?`; params.push(tipo) }
    sql += ` ORDER BY orden, nombre`
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/categorias/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' })
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/categorias
router.post('/', soloAdmin, async (req, res) => {
  const { nombre, tipo, descripcion, orden } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    const [result] = await pool.query(
      `INSERT INTO categorias (nombre, tipo, descripcion, orden) VALUES (?, ?, ?, ?)`,
      [nombre, tipo || 'ambos', descripcion || null, orden || 1]
    )
    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [result.insertId])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/categorias/:id
router.put('/:id', soloAdmin, async (req, res) => {
  const { nombre, tipo, descripcion, orden } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    await pool.query(
      `UPDATE categorias SET nombre=?, tipo=?, descripcion=?, orden=?, updated_at=NOW() WHERE id=?`,
      [nombre, tipo || 'ambos', descripcion || null, orden || 1, req.params.id]
    )
    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ?', [req.params.id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/categorias/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE categorias SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true, mensaje: 'Categoría eliminada' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
