// Estado de la suscripción de la empresa. Va DESPUÉS de agregarTenantId en las rutas de negocio:
//
//   router.use(verificarToken, agregarTenantId, verificarSuscripcion)
//
// Suscripción bloqueada = SOLO LECTURA: GET, HEAD y OPTIONS pasan (la empresa siempre puede consultar y descargar sus
// datos); cualquier escritura responde 403 con `suscripcion_bloqueada: true`. En período de gracia todo funciona y la
// petición lleva el aviso en `req.suscripcion.aviso`. Nunca se borran ni se ocultan datos por falta de pago.

import pool from '../config/database.js'
import { obtenerSuscripcion } from '../services/suscripcion/consulta.js'
import { usoActual, resumenDeUso, esRecursoLimitado } from '../services/suscripcion/limites.js'

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

/**
 * Impide crear un registro cuando la empresa ya usa todo lo que su plan permite de ese recurso.
 * Va en las rutas que CREAN (POST), después de verificarSuscripcion:
 *
 *   router.post('/', verificarLimite('clientes'), ...)
 *
 * Al llegar al máximo responde 403 con `limite_alcanzado: true`. Con el 80 % de uso o más deja `req.limiteAviso`.
 */
export function verificarLimite(recurso) {
  if (!esRecursoLimitado(recurso)) throw new Error(`Recurso desconocido: ${recurso}`)
  return async (req, res, next) => {
    try {
      const max = req.suscripcion.plan[`max_${recurso}`]
      if (max === -1) return next()

      const resumen = resumenDeUso(await usoActual(pool, req.tenant_id, recurso), max)
      if (resumen.al_limite) {
        return res.status(403).json({
          ok: false,
          limite_alcanzado: true,
          recurso,
          actual: resumen.actual,
          max,
          plan: req.suscripcion.plan.nombre,
          mensaje: `Llegaste al límite de ${max} ${recurso} de tu plan ${req.suscripcion.plan.nombre}. Cambia a un plan superior para agregar más.`,
        })
      }
      if (resumen.cerca_del_limite) req.limiteAviso = { recurso, ...resumen }
      next()
    } catch (err) {
      console.error('Error al verificar el límite:', err)
      res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
    }
  }
}
