import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

// GET /api/tipos-servicio?buscar=texto
router.get('/', async (req, res) => {
  const { buscar } = req.query
  try {
    let sql = `SELECT * FROM tipos_servicio WHERE tenant_id = ? AND activo = 1`
    const params = [req.tenant_id]
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
      `INSERT INTO tipos_servicio (tenant_id, nombre, descripcion) VALUES (?, ?, ?)`,
      [req.tenant_id, nombre, descripcion || null]
    )
    const [rows] = await pool.query('SELECT * FROM tipos_servicio WHERE id = ? AND tenant_id = ?', [result.insertId, req.tenant_id])
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
    const [existe] = await pool.query('SELECT id FROM tipos_servicio WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Tipo de servicio no encontrado' })

    await pool.query(
      `UPDATE tipos_servicio SET nombre=?, descripcion=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
      [nombre, descripcion || null, req.params.id, req.tenant_id]
    )
    const [rows] = await pool.query('SELECT * FROM tipos_servicio WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/tipos-servicio/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    const [existe] = await pool.query('SELECT id FROM tipos_servicio WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Tipo de servicio no encontrado' })

    await pool.query('UPDATE tipos_servicio SET activo = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Tipo de servicio eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
