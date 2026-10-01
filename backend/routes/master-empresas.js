import { Router } from 'express'
import pool from '../config/database.js'
import { verificarTokenMaster } from '../middleware/master.js'
import * as empresas from '../services/master/empresas.js'
import { ErrorDeSuscripcion } from '../services/suscripcion/gestion.js'
import { ErrorDeMaster } from '../services/master/empresas.js'

const router = Router()
router.use(verificarTokenMaster)

const actorDe = (req) => `master:${req.master.id}`

function responderError(res, err) {
  if (err instanceof ErrorDeSuscripcion || err instanceof ErrorDeMaster) {
    return res.status(err.estado).json({ ok: false, mensaje: err.message })
  }
  console.error(err)
  res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
}

// GET /api/master/empresas
router.get('/', async (req, res) => {
  try {
    res.json({ ok: true, data: await empresas.listar(pool) })
  } catch (err) { responderError(res, err) }
})

// GET /api/master/empresas/:id
router.get('/:id', async (req, res) => {
  try {
    const d = await empresas.detalle(pool, Number(req.params.id))
    if (!d) return res.status(404).json({ ok: false, mensaje: 'Empresa no encontrada' })
    res.json({ ok: true, data: d })
  } catch (err) { responderError(res, err) }
})

// PUT /api/master/empresas/:id/plan  { plan_id }
router.put('/:id/plan', async (req, res) => {
  const planId = Number(req.body.plan_id)
  if (!planId) return res.status(400).json({ ok: false, mensaje: 'plan_id es requerido' })
  try {
    await empresas.cambiarPlan(pool, Number(req.params.id), planId, { actor: actorDe(req) })
    res.json({ ok: true, mensaje: 'Plan actualizado', data: await empresas.detalle(pool, Number(req.params.id)) })
  } catch (err) { responderError(res, err) }
})

// POST /api/master/empresas/:id/pagos  { monto, metodo, referencia }
router.post('/:id/pagos', async (req, res) => {
  try {
    const r = await empresas.registrarPago(pool, Number(req.params.id), req.body, { actor: actorDe(req) })
    res.status(201).json({ ok: true, mensaje: 'Pago registrado', data: r })
  } catch (err) { responderError(res, err) }
})

// POST /api/master/empresas/:id/estado  { accion: 'suspender'|'reactivar'|'cancelar'|'exentar'|'quitar_exencion', motivo }
router.post('/:id/estado', async (req, res) => {
  try {
    await empresas.cambiarEstado(pool, Number(req.params.id), req.body.accion, { motivo: req.body.motivo, actor: actorDe(req) })
    res.json({ ok: true, mensaje: 'Estado actualizado', data: await empresas.detalle(pool, Number(req.params.id)) })
  } catch (err) { responderError(res, err) }
})

// POST /api/master/empresas/:id/impersonar  { modo: 'ver'|'editar' }
router.post('/:id/impersonar', async (req, res) => {
  const modo = req.body?.modo === 'editar' ? 'editar' : 'ver'
  try {
    const r = await empresas.tokenDeImpersonacion(pool, Number(req.params.id), { modo, masterId: req.master.id })
    if (!r) return res.status(404).json({ ok: false, mensaje: 'Empresa no encontrada' })
    res.json({ ok: true, data: r })
  } catch (err) { responderError(res, err) }
})

export default router
