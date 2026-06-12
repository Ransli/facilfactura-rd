import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// GET /api/nfc — lista todas las secuencias
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *,
        ROUND((ultimo_usado / hasta) * 100, 1) AS porcentaje_usado,
        (hasta - ultimo_usado) AS disponibles
       FROM nfc_secuencias
       ORDER BY activo DESC, id DESC`
    )
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/nfc/activa — devuelve la secuencia activa con estado de alerta
router.get('/activa', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT *,
        ROUND((ultimo_usado / hasta) * 100, 1) AS porcentaje_usado,
        (hasta - ultimo_usado) AS disponibles
       FROM nfc_secuencias
       WHERE activo = 1
       LIMIT 1`
    )

    if (!rows[0]) {
      return res.status(404).json({
        ok: false,
        mensaje: 'No hay secuencia NCF activa. Registra una en la sección NCF.',
      })
    }

    const seq = rows[0]
    const porcentajeUsado = (seq.ultimo_usado / seq.hasta) * 100
    const alerta = seq.ultimo_usado >= seq.alerta_desde

    res.json({
      ok: true,
      data: seq,
      alerta,
      alerta_mensaje: alerta
        ? `⚠️ Te quedan ${seq.disponibles} comprobantes fiscales. Solicita una nueva secuencia NCF a la DGII.`
        : null,
      porcentaje_usado: porcentajeUsado.toFixed(1),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/nfc — registrar nueva secuencia
router.post('/', soloAdmin, async (req, res) => {
  const { tipo_ncf, descripcion, desde, hasta, fecha_vencimiento } = req.body

  if (!tipo_ncf || !desde || !hasta) {
    return res.status(400).json({ ok: false, mensaje: 'tipo_ncf, desde y hasta son requeridos' })
  }
  if (Number(desde) >= Number(hasta)) {
    return res.status(400).json({ ok: false, mensaje: 'desde debe ser menor que hasta' })
  }

  const alerta_desde = Math.floor(Number(hasta) * 0.8)

  try {
    await pool.query(`UPDATE nfc_secuencias SET activo = 0 WHERE activo = 1`)

    const [result] = await pool.query(
      `INSERT INTO nfc_secuencias (tipo_ncf, descripcion, desde, hasta, ultimo_usado, alerta_desde, fecha_vencimiento, activo)
       VALUES (?, ?, ?, ?, 0, ?, ?, 1)`,
      [tipo_ncf, descripcion || null, Number(desde), Number(hasta), alerta_desde, fecha_vencimiento || null]
    )

    const [rows] = await pool.query('SELECT * FROM nfc_secuencias WHERE id = ?', [result.insertId])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/nfc/:id
router.put('/:id', soloAdmin, async (req, res) => {
  const { tipo_ncf, descripcion, desde, hasta, alerta_desde, fecha_vencimiento, activo } = req.body

  try {
    await pool.query(
      `UPDATE nfc_secuencias SET tipo_ncf=?, descripcion=?, desde=?, hasta=?,
       alerta_desde=?, fecha_vencimiento=?, activo=?, updated_at=NOW() WHERE id=?`,
      [tipo_ncf, descripcion || null, desde, hasta,
       alerta_desde || Math.floor(Number(hasta) * 0.8),
       fecha_vencimiento || null, activo ?? 1, req.params.id]
    )
    const [rows] = await pool.query('SELECT * FROM nfc_secuencias WHERE id = ?', [req.params.id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
