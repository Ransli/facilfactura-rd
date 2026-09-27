import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

// GET /api/categorias?tipo=producto|servicio|ambos
router.get('/', async (req, res) => {
  const { tipo } = req.query
  try {
    let sql = `SELECT * FROM categorias WHERE tenant_id = ? AND activo = 1`
    const params = [req.tenant_id]
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
    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
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
      `INSERT INTO categorias (tenant_id, nombre, tipo, descripcion, orden) VALUES (?, ?, ?, ?, ?)`,
      [req.tenant_id, nombre, tipo || 'ambos', descripcion || null, orden || 1]
    )
    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ? AND tenant_id = ?', [result.insertId, req.tenant_id])
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
    const [existe] = await pool.query('SELECT id FROM categorias WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' })

    await pool.query(
      `UPDATE categorias SET nombre=?, tipo=?, descripcion=?, orden=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
      [nombre, tipo || 'ambos', descripcion || null, orden || 1, req.params.id, req.tenant_id]
    )
    const [rows] = await pool.query('SELECT * FROM categorias WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/categorias/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    const [existe] = await pool.query('SELECT id FROM categorias WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Categoría no encontrada' })

    await pool.query('UPDATE categorias SET activo = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Categoría eliminada' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
