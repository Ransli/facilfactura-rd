// Retenciones de ITBIS e ISR asociadas a un gasto.
//
// DÃ“NDE VA: backend/routes/contabilidad/
// CONECTAR en backend/app.js:
//   import retencionesRoutes from './routes/contabilidad/retenciones.js'
//   app.use('/api/contabilidad/retenciones', retencionesRoutes)
//
// Mismas reglas que gastos.js: `tenant_id = req.tenant_id` en TODA consulta y aislamiento entre empresas probado.
import { Router } from 'express'
import pool from '../../config/database.js'
import { verificarToken, soloFacturador } from '../../middleware/auth.js'
import { agregarTenantId } from '../../middleware/tenant.js'

const router = Router()
router.use(verificarToken, agregarTenantId)

const COLUMNA_GASTO = { itbis: 'itbis_retenido', isr: 'monto_retencion_renta' }

// Redondeo a 2 decimales, igual que en facturas.
const redondear = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// GET /api/contabilidad/retenciones?gasto_id=
router.get('/', async (req, res) => {
  const { gasto_id } = req.query
  try {
    let sql = `SELECT r.* FROM retenciones r WHERE r.tenant_id = ?`
    const params = [req.tenant_id]
    if (gasto_id) { sql += ' AND r.gasto_id = ?'; params.push(gasto_id) }
    sql += ' ORDER BY r.created_at DESC'
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/contabilidad/retenciones  { gasto_id, tipo: 'itbis' | 'isr', porcentaje }
router.post('/', soloFacturador, async (req, res) => {
  const { gasto_id, tipo, porcentaje } = req.body
  if (!gasto_id || !['itbis', 'isr'].includes(tipo) || porcentaje === undefined) {
    return res.status(400).json({ ok: false, mensaje: 'gasto_id, tipo (itbis|isr) y porcentaje son requeridos' })
  }
  if (Number(porcentaje) <= 0 || Number(porcentaje) > 100) {
    return res.status(400).json({ ok: false, mensaje: 'porcentaje debe estar entre 0 y 100' })
  }

  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()

    const [gastos] = await conexion.query("SELECT * FROM gastos WHERE id = ? AND tenant_id = ? AND estado = 'registrado' FOR UPDATE", [gasto_id, req.tenant_id])
    const gasto = gastos[0]
    if (!gasto) {
      await conexion.rollback()
      return res.status(404).json({ ok: false, mensaje: 'Gasto no encontrado' })
    }

    // ITBIS se retiene sobre el ITBIS facturado; ISR sobre el total del gasto (servicios + bienes).
    const base = tipo === 'itbis' ? Number(gasto.itbis_facturado) : Number(gasto.monto_servicios) + Number(gasto.monto_bienes)
    const monto = redondear(base * Number(porcentaje) / 100)

    const [r] = await conexion.query(
      'INSERT INTO retenciones (tenant_id, gasto_id, tipo, porcentaje, monto) VALUES (?, ?, ?, ?, ?)',
      [req.tenant_id, gasto_id, tipo, porcentaje, monto]
    )
    const columna = COLUMNA_GASTO[tipo]
    await conexion.query(`UPDATE gastos SET ${columna} = ${columna} + ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?`, [monto, gasto_id, req.tenant_id])

    await conexion.commit()
    const [rows] = await pool.query('SELECT * FROM retenciones WHERE id = ? AND tenant_id = ?', [r.insertId, req.tenant_id])
    res.status(201).json({ ok: true, data: rows[0] })
  } catch (err) {
    await conexion.rollback()
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conexion.release()
  }
})

// DELETE /api/contabilidad/retenciones/:id â€” revierte la retenciÃ³n y recalcula el gasto
router.delete('/:id', soloFacturador, async (req, res) => {
  const conexion = await pool.getConnection()
  try {
    await conexion.beginTransaction()

    const [retenciones] = await conexion.query('SELECT * FROM retenciones WHERE id = ? AND tenant_id = ? FOR UPDATE', [req.params.id, req.tenant_id])
    const retencion = retenciones[0]
    if (!retencion) {
      await conexion.rollback()
      return res.status(404).json({ ok: false, mensaje: 'RetenciÃ³n no encontrada' })
    }

    const columna = COLUMNA_GASTO[retencion.tipo]
    await conexion.query(`UPDATE gastos SET ${columna} = GREATEST(${columna} - ?, 0), updated_at = NOW() WHERE id = ? AND tenant_id = ?`, [retencion.monto, retencion.gasto_id, req.tenant_id])
    await conexion.query('DELETE FROM retenciones WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])

    await conexion.commit()
    res.json({ ok: true, mensaje: 'RetenciÃ³n revertida' })
  } catch (err) {
    await conexion.rollback()
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conexion.release()
  }
})

export default router


