import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { primeraReferenciaAjena } from '../utils/referencias.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

// GET /api/metodos-pago — métodos de pago de la empresa
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM metodos_pago WHERE tenant_id = ? AND activo = 1 ORDER BY orden, id`, [req.tenant_id]
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
    const ajena = await primeraReferenciaAjena(pool, req.tenant_id, [{ columna: 'empresa_id', id: empresa_id }])
    if (ajena) return res.status(400).json({ ok: false, mensaje: ajena })

    const [result] = await pool.query(
      `INSERT INTO metodos_pago (tenant_id, empresa_id, tipo, banco, numero_cuenta, tipo_cuenta, titular, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.tenant_id, empresa_id, tipo, banco || null, numero_cuenta || null,
       tipo_cuenta || 'corriente', titular || null, orden || 1]
    )
    const [rows] = await pool.query('SELECT * FROM metodos_pago WHERE id = ? AND tenant_id = ?', [result.insertId, req.tenant_id])
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
    const [existe] = await pool.query('SELECT id FROM metodos_pago WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Método de pago no encontrado' })

    await pool.query(
      `UPDATE metodos_pago SET tipo=?, banco=?, numero_cuenta=?, tipo_cuenta=?, titular=?, orden=?, updated_at=NOW()
       WHERE id=? AND tenant_id=?`,
      [tipo, banco || null, numero_cuenta || null, tipo_cuenta || 'corriente',
       titular || null, orden || 1, req.params.id, req.tenant_id]
    )
    const [rows] = await pool.query('SELECT * FROM metodos_pago WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// DELETE /api/metodos-pago/:id (soft delete)
router.delete('/:id', soloAdmin, async (req, res) => {
  try {
    const [existe] = await pool.query('SELECT id FROM metodos_pago WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Método de pago no encontrado' })

    await pool.query('UPDATE metodos_pago SET activo = 0 WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Método de pago eliminado' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
