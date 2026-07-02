import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// GET /api/metodos-pago — métodos de la empresa configurada
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM metodos_pago WHERE activo = 1 ORDER BY orden, id`
    )
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/metodos-pago
router.post('/', soloAdmin, async (req, res) => {
  const { empresa_id, tipo, banco, numero_cuenta, tipo_cuenta, titular, orden } = req.body
  if (!empresa_id || !tipo) {
    return res.status(400).json({ ok: false, mensaje: 'empresa_id y tipo son requeridos' })
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO metodos_pago (empresa_id, tipo, banco, numero_cuenta, tipo_cuenta, titular, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [empresa_id, tipo, banco || null, numero_cuenta || null,
       tipo_cuenta || 'corriente', titular || null, orden || 1]
    )
    const [rows] = await pool.query('SELECT * FROM metodos_pago WHERE id = ?', [result.insertId])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/metodos-pago/:id
router.put('/:id', soloAdmin, async (req, res) => {
  const { tipo, banco, numero_cuenta, tipo_cuenta, titular, orden } = req.body

  try {
    await pool.query(
      `UPDATE metodos_pago SET tipo=?, banco=?, numero_cuenta=?, tipo_cuenta=?, titular=?, orden=?, updated_at=NOW()
       WHERE id=?`,
      [tipo, banco || null, numero_cuenta || null, tipo_cuenta || 'corriente',
       titular || null, orden || 1, req.params.id]
    )
    const [rows] = await pool.query('SELECT * FROM metodos_pago WHERE id = ?', [req.params.id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/metodos-pago/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE metodos_pago SET activo = 0 WHERE id = ?', [req.params.id])
    res.json({ ok: true, mensaje: 'Método de pago eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
