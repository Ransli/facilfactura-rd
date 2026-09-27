import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'

const router = Router()
router.use(verificarToken, agregarTenantId, verificarSuscripcion)

const CAMPOS_USO = `*,
        ROUND((ultimo_usado / hasta) * 100, 1) AS porcentaje_usado,
        (hasta - ultimo_usado) AS disponibles`

// GET /api/nfc — lista todas las secuencias de la empresa
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${CAMPOS_USO}
       FROM nfc_secuencias
       WHERE tenant_id = ?
       ORDER BY activo DESC, id DESC`,
      [req.tenant_id]
    )
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/nfc/activas — todas las secuencias vigentes de la empresa, una por tipo
router.get('/activas', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${CAMPOS_USO}
       FROM nfc_secuencias
       WHERE tenant_id = ? AND activo = 1
       ORDER BY tipo_ncf`,
      [req.tenant_id]
    )
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/nfc/activa?tipo=B01 — secuencia activa de un tipo, con estado de alerta.
// Sin `tipo` devuelve la primera vigente, para no romper a quien ya la consumía así.
router.get('/activa', async (req, res) => {
  const { tipo } = req.query
  try {
    const [rows] = await pool.query(
      `SELECT ${CAMPOS_USO}
       FROM nfc_secuencias
       WHERE tenant_id = ? AND activo = 1 ${tipo ? 'AND tipo_ncf = ?' : ''}
       ORDER BY tipo_ncf
       LIMIT 1`,
      tipo ? [req.tenant_id, tipo] : [req.tenant_id]
    )

    if (!rows[0]) {
      return res.status(404).json({
        ok: false,
        mensaje: tipo
          ? `No hay secuencia NCF activa del tipo ${tipo}. Registra una en la sección NCF.`
          : 'No hay secuencia NCF activa. Registra una en la sección NCF.',
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

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    // Solo una secuencia vigente por tipo y por empresa: registrar un B01 nuevo jubila el B01
    // anterior de ESTA empresa, pero deja intactos el B02, el B15 y los de las demás empresas.
    await conn.query(
      `UPDATE nfc_secuencias SET activo = 0 WHERE tenant_id = ? AND activo = 1 AND tipo_ncf = ?`,
      [req.tenant_id, tipo_ncf]
    )

    const [result] = await conn.query(
      `INSERT INTO nfc_secuencias (tenant_id, tipo_ncf, descripcion, desde, hasta, ultimo_usado, alerta_desde, fecha_vencimiento, activo)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 1)`,
      [req.tenant_id, tipo_ncf, descripcion || null, Number(desde), Number(hasta), alerta_desde, fecha_vencimiento || null]
    )
    await conn.commit()

    const [rows] = await pool.query('SELECT * FROM nfc_secuencias WHERE id = ? AND tenant_id = ?', [result.insertId, req.tenant_id])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    await conn.rollback()
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conn.release()
  }
})

// PUT /api/nfc/:id
router.put('/:id', soloAdmin, async (req, res) => {
  const { tipo_ncf, descripcion, desde, hasta, alerta_desde, fecha_vencimiento, activo } = req.body

  try {
    const [existe] = await pool.query('SELECT id FROM nfc_secuencias WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!existe[0]) return res.status(404).json({ ok: false, mensaje: 'Secuencia no encontrada' })

    await pool.query(
      `UPDATE nfc_secuencias SET tipo_ncf=?, descripcion=?, desde=?, hasta=?,
       alerta_desde=?, fecha_vencimiento=?, activo=?, updated_at=NOW() WHERE id=? AND tenant_id=?`,
      [tipo_ncf, descripcion || null, desde, hasta,
       alerta_desde || Math.floor(Number(hasta) * 0.8),
       fecha_vencimiento || null, activo ?? 1, req.params.id, req.tenant_id]
    )
    const [rows] = await pool.query('SELECT * FROM nfc_secuencias WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
