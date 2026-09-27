// Cola de envío de e-CF a la DGII, con reintentos y retroceso exponencial.
//
// Qué se procesa (estado → acción):
//   generado  → se envía; si la DGII lo recibe (TrackID) pasa a «enviado» y se consulta de inmediato
//   enviado / en_proceso → solo se CONSULTA el resultado con su TrackID; nunca se reenvía
//   aceptado, aceptado_condicional, rechazado → terminales: la cola no los toca más
//   error → se agotaron los intentos; solo se retoma a mano (programarReintento)
//
// Cada falla de comunicación (sin conexión, demora, 5xx) suma un intento y espera 1, 2, 4, 8, 16, 32 y 60 minutos; al
// octavo intento queda en «error». Que la DGII diga «en proceso» NO es una falla: se vuelve a consultar en 1 minuto.
//
// Varios procesos pueden correr a la vez: cada e-CF se «reclama» moviendo su próximo intento antes de trabajarlo, así
// dos trabajadores nunca envían el mismo comprobante.

import { crearClienteDgii, ErrorDeDgii } from './clienteDgii.js'
import { credencialesDeLaEmpresa } from './emision.js'

export const ESPERAS_MINUTOS = [1, 2, 4, 8, 16, 32, 60]
export const MAX_INTENTOS = 8
const ESPERA_CONSULTA_MINUTOS = 1
const RECLAMO_MINUTOS = 5              // tiempo que se reserva un e-CF mientras se trabaja
const ESTADOS_PENDIENTES = ['generado', 'enviado', 'en_proceso']

const enMinutos = (fecha, minutos) => new Date(fecha.getTime() + minutos * 60 * 1000)

/** Cliente de la DGII de una empresa (su ambiente y su certificado), o el motivo por el que no se puede armar. */
async function contextoDeLaEmpresa(db, tenantId, baseUrl) {
  try {
    const credenciales = await credencialesDeLaEmpresa(db, tenantId)
    const [[cfg]] = await db.query('SELECT ambiente FROM ecf_configuracion WHERE tenant_id = ?', [tenantId])
    return { cliente: crearClienteDgii({ ambiente: cfg?.ambiente || 'TesteCF', credenciales, baseUrl }) }
  } catch (err) {
    return { error: err.message }
  }
}

async function guardar(db, id, cambios) {
  const columnas = Object.keys(cambios)
  await db.query(`UPDATE ecf_emitidos SET ${columnas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...columnas.map((c) => cambios[c]), id])
}

const textoDeMensajes = (mensajes) => (mensajes.length ? mensajes.join('; ') : null)

/** Suma un intento fallido y programa el siguiente, o lo deja en «error» al llegar al máximo. */
async function registrarFalla(db, fila, motivo, ahora, resumen) {
  const intentos = fila.intentos + 1
  if (intentos >= MAX_INTENTOS) {
    await guardar(db, fila.id, {
      estado: 'error', intentos, proximo_intento: null, ultimo_intento: ahora,
      mensaje_dgii: `No se pudo completar tras ${MAX_INTENTOS} intentos. Último motivo: ${motivo}`,
    })
    resumen.errores += 1
    return
  }
  await guardar(db, fila.id, {
    intentos, proximo_intento: enMinutos(ahora, ESPERAS_MINUTOS[intentos - 1]), ultimo_intento: ahora, mensaje_dgii: motivo,
  })
  resumen.reintentos += 1
}

async function procesarFila(db, fila, contexto, ahora, resumen) {
  let enviando = !fila.track_id
  try {
    if (contexto.error) throw new ErrorDeDgii(contexto.error, { transitorio: true })
    let trackId = fila.track_id

    if (!trackId) {
      const enviado = await contexto.cliente.enviarEcf(fila.xml_firmado, `${fila.rnc_emisor}${fila.encf}.xml`)
      trackId = enviado.trackId
      // Se guarda YA el TrackID: si algo falla después, la próxima pasada consulta en lugar de reenviar
      await guardar(db, fila.id, {
        estado: 'enviado', track_id: trackId, intentos: 0, mensaje_dgii: null, ultimo_intento: ahora,
        proximo_intento: enMinutos(ahora, ESPERA_CONSULTA_MINUTOS),
      })
      fila.intentos = 0
      resumen.enviados += 1
      enviando = false
    }

    const resultado = await contexto.cliente.consultarEstado(trackId)
    if (resultado.estado === 'en_proceso') {
      await guardar(db, fila.id, {
        estado: 'en_proceso', intentos: 0, mensaje_dgii: null, ultimo_intento: ahora,
        proximo_intento: enMinutos(ahora, ESPERA_CONSULTA_MINUTOS),
      })
      return
    }
    await guardar(db, fila.id, {
      estado: resultado.estado, intentos: 0, proximo_intento: null, ultimo_intento: ahora, mensaje_dgii: textoDeMensajes(resultado.mensajes),
    })
    if (resultado.estado === 'rechazado') resumen.rechazados += 1
    else resumen.aceptados += 1
  } catch (err) {
    if (err instanceof ErrorDeDgii && !err.transitorio && enviando) {
      // La DGII rechazó el envío en sí (firma inválida, e-NCF repetido…): reintentar no lo arregla
      await guardar(db, fila.id, { estado: 'rechazado', proximo_intento: null, ultimo_intento: ahora, mensaje_dgii: err.message })
      resumen.rechazados += 1
      return
    }
    if (!(err instanceof ErrorDeDgii)) console.error('[ecf] error inesperado en la cola:', err)
    await registrarFalla(db, fila, err.message, ahora, resumen)
  }
}

/**
 * Procesa los e-CF que ya les toca (su `proximo_intento` llegó), de todas las empresas.
 * @param db     pool de mysql2
 * @param opts   { tenantId?, limite?, ahora?, baseUrl? }  tenantId limita el trabajo a una empresa; ahora y baseUrl existen para las pruebas
 * @returns      { procesados, enviados, aceptados, rechazados, reintentos, errores }
 */
export async function procesarCola(db, { tenantId, ahora = new Date(), baseUrl, limite = 25 } = {}) {
  const resumen = { procesados: 0, enviados: 0, aceptados: 0, rechazados: 0, reintentos: 0, errores: 0 }
  const [pendientes] = await db.query(
    `SELECT id, tenant_id, estado, track_id, intentos, encf, rnc_emisor, xml_firmado
     FROM ecf_emitidos
     WHERE estado IN (${ESTADOS_PENDIENTES.map(() => '?').join(', ')}) AND proximo_intento IS NOT NULL AND proximo_intento <= ?
       ${tenantId ? 'AND tenant_id = ?' : ''}
     ORDER BY proximo_intento, id LIMIT ?`,
    [...ESTADOS_PENDIENTES, ahora, ...(tenantId ? [tenantId] : []), limite])

  const contextos = new Map()
  for (const fila of pendientes) {
    // Reclamo: solo un trabajador consigue mover el próximo intento de esta fila
    const [reclamo] = await db.query(
      `UPDATE ecf_emitidos SET proximo_intento = ?
       WHERE id = ? AND estado IN (${ESTADOS_PENDIENTES.map(() => '?').join(', ')}) AND proximo_intento IS NOT NULL AND proximo_intento <= ?`,
      [enMinutos(ahora, RECLAMO_MINUTOS), fila.id, ...ESTADOS_PENDIENTES, ahora])
    if (reclamo.affectedRows === 0) continue

    if (!contextos.has(fila.tenant_id)) contextos.set(fila.tenant_id, await contextoDeLaEmpresa(db, fila.tenant_id, baseUrl))
    resumen.procesados += 1
    await procesarFila(db, fila, contextos.get(fila.tenant_id), ahora, resumen)
  }
  return resumen
}

/**
 * Vuelve a poner en la cola un e-CF de la empresa (el administrador pulsó «reintentar»). Sirve para los que quedaron en
 * «error» y para adelantar uno pendiente; un e-CF aceptado o rechazado no se toca. Un e-CF que ya tiene TrackID solo se consulta.
 * @returns true si se reprogramó
 */
export async function programarReintento(db, tenantId, id, ahora = new Date()) {
  const [r] = await db.query(
    `UPDATE ecf_emitidos
     SET estado = IF(track_id IS NULL, 'generado', 'enviado'), intentos = 0, proximo_intento = ?, mensaje_dgii = NULL
     WHERE id = ? AND tenant_id = ? AND estado IN ('error', 'generado', 'enviado', 'en_proceso')`,
    [ahora, id, tenantId])
  return r.affectedRows > 0
}

/**
 * Trabajador de fondo: procesa la cola cada `intervaloMs`. Una pasada no arranca si la anterior sigue en curso.
 * @returns { detener() }
 */
export function iniciarTrabajador(db, { intervaloMs = 30_000, alTerminar } = {}) {
  let enCurso = false
  const temporizador = setInterval(async () => {
    if (enCurso) return
    enCurso = true
    try {
      const r = await procesarCola(db)
      if (r.procesados > 0) alTerminar?.(r) ?? console.log('[ecf] cola:', JSON.stringify(r))
    } catch (err) {
      console.error('[ecf] la cola falló:', err.message)
    } finally {
      enCurso = false
    }
  }, intervaloMs)
  temporizador.unref?.()
  return { detener: () => clearInterval(temporizador) }
}
