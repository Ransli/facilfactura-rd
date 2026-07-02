import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// GET /api/tipos-servicio?buscar=texto
router.get('/', async (req, res) => {
  const { buscar } = req.query
  try {
    let sql = `SELECT * FROM tipos_servicio WHERE activo = 1`
    const params = []
    if (buscar) {
      sql += ` AND nombre LIKE ?`
      params.push(`%${buscar}%`)
    }
    sql += ` ORDER BY nombre`
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/tipos-servicio
router.post('/', soloAdmin, async (req, res) => {
  const { nombre, descripcion } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    const [result] = await pool.query(
      `INSERT INTO tipos_servicio (nombre, descripcion) VALUES (?, ?)`,
      [nombre, descripcion || null]
    )
    const [rows] = await pool.query('SELECT * FROM tipos_servicio WHERE id = ?', [result.insertId])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/tipos-servicio/:id
router.put('/:id', soloAdmin, async (req, res) => {
  const { nombre, descripcion } = req.body
  if (!nombre) return res.status(400).json({ ok: false, mensaje: 'El nombre es requerido' })

  try {
    await pool.query(
      `UPDATE tipos_servicio SET nombre=?, descripcion=?, updated_at=NOW() WHERE id=?`,
      [nombre, descripcion || null, req.params.id]
    )
    const [rows] = await pool.query('SELECT * FROM tipos_servicio WHERE id = ?', [req.params.id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/tipos-servicio/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE tipos_servicio SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true, mensaje: 'Tipo de servicio eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
