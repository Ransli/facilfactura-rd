import { Router } from 'express'
import { crearEmpresa, ErrorDeRegistro } from '../services/tenants/registro.js'

// Alta de empresas. Son rutas PÚBLICAS (no hay sesión todavía): la seguridad está en el token de registro que entrega
// el paso 1 y que exigen los pasos siguientes. Ver services/tenants/registro.js.
const router = Router()

// Convierte los errores de negocio del alta en su respuesta HTTP; el resto sigue al manejador global
function manejar(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof ErrorDeRegistro) return res.status(err.estado).json({ ok: false, mensaje: err.message })
      next(err)
    }
  }
}

// POST /api/registro/empresa — paso 1: datos de la empresa
router.post('/empresa', manejar(async (req, res) => {
  const resultado = await crearEmpresa(req.body ?? {}, { ip: req.ip })
  res.status(201).json({ ok: true, ...resultado })
}))

export default router
