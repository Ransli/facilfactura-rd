// Estado de la suscripción de la empresa. Va DESPUÉS de agregarTenantId en las rutas de negocio:
//
//   router.use(verificarToken, agregarTenantId, verificarSuscripcion)
//
// Suscripción bloqueada = SOLO LECTURA: GET, HEAD y OPTIONS pasan (la empresa siempre puede consultar y descargar sus
// datos); cualquier escritura responde 403 con `suscripcion_bloqueada: true`. En período de gracia todo funciona y la
// petición lleva el aviso en `req.suscripcion.aviso`. Nunca se borran ni se ocultan datos por falta de pago.

import pool from '../config/database.js'
import { obtenerSuscripcion } from '../services/suscripcion/consulta.js'

const METODOS_DE_LECTURA = new Set(['GET', 'HEAD', 'OPTIONS'])

export async function verificarSuscripcion(req, res, next) {
  try {
    const suscripcion = await obtenerSuscripcion(pool, req.tenant_id)
    if (!suscripcion) {
      return res.status(403).json({ ok: false, mensaje: 'No se encontró la empresa de tu sesión' })
    }
    req.suscripcion = suscripcion

    if (suscripcion.bloqueado && !METODOS_DE_LECTURA.has(req.method)) {
      return res.status(403).json({
        ok: false,
        suscripcion_bloqueada: true,
        motivo: suscripcion.motivo,
        mensaje: suscripcion.aviso,
      })
    }
    next()
  } catch (err) {
    console.error('Error al verificar la suscripción:', err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
}
