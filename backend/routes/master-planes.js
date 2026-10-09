import { Router } from 'express'
import pool from '../config/database.js'
import { verificarTokenMaster } from '../middleware/master.js'
import * as planes from '../services/master/planes.js'
import { ErrorDePlan } from '../services/master/planes.js'

const router = Router()
router.use(verificarTokenMaster)

function responderError(res, err) {
  if (err instanceof ErrorDePlan) return res.status(err.estado).json({ ok: false, mensaje: err.message })
  console.error(err)
  res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
}

// GET /api/master/planes
router.get('/', async (req, res) => {
  try { res.json({ ok: true, data: await planes.listar(pool) }) } catch (err) { responderError(res, err) }
})

// POST /api/master/planes
router.post('/', async (req, res) => {
  try { res.status(201).json({ ok: true, mensaje: 'Plan creado', data: await planes.crear(pool, req.body) }) }
  catch (err) { responderError(res, err) }
})

// PUT /api/master/planes/:id
router.put('/:id', async (req, res) => {
  try { res.json({ ok: true, mensaje: 'Plan actualizado', data: await planes.editar(pool, Number(req.params.id), req.body) }) }
  catch (err) { responderError(res, err) }
})

// POST /api/master/planes/:id/activo  { activo: true|false }
router.post('/:id/activo', async (req, res) => {
  try {
    const d = await planes.cambiarActivo(pool, Number(req.params.id), !!req.body.activo)
    res.json({ ok: true, mensaje: d.activo ? 'Plan activado' : 'Plan desactivado', data: d })
  } catch (err) { responderError(res, err) }
})

export default router
