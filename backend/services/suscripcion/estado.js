// Estado de la suscripción de una empresa. Función PURA: no toca la base de datos, así se prueba con fechas fijas.
//
// Reglas (propuesta de la Unidad II, V.3, y el patrón de FinanceCore):
//  - exento            → nunca se bloquea.
//  - cancelado / suspendido, o suscripción marcada expirada/suspendida/cancelada → bloqueada.
//  - prueba / activo   → vence en `fecha_fin_prueba` / `sub_fecha_fin`. Pasado el vencimiento hay 2 días de gracia
//                        (se trabaja con aviso); después queda bloqueada. Sin fecha de vencimiento no vence.
//  - pendiente_pago    → tiene hasta `fecha_fin_prueba` (fecha límite de pago); después queda bloqueada, sin gracia extra.
//
// «Bloqueada» significa SOLO LECTURA (lo aplica el middleware): los datos nunca se ocultan ni se borran.

export const DIAS_GRACIA = 2

const MS_DIA = 86_400_000

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de República Dominicana. */
export function hoyRD(ahora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo' }).format(ahora)
}

/** Días enteros de `desde` a `hasta` (ambas AAAA-MM-DD). Positivo si `hasta` es posterior. */
export function diasEntre(desde, hasta) {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA)
}

const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`

const MOTIVOS_BLOQUEO = {
  suspendida: 'Tu suscripción está suspendida. Puedes consultar tus datos, pero no crear ni modificar hasta que se reactive.',
  cancelada: 'Tu suscripción fue cancelada. Puedes consultar tus datos, pero no crear ni modificar.',
  vencida: 'Tu suscripción venció y terminó el período de gracia. Renueva para volver a crear y modificar.',
  prueba_vencida: 'Tu período de prueba terminó. Elige un plan para volver a crear y modificar.',
  pago_requerido: 'Se venció el plazo para pagar tu suscripción. Realiza el pago para volver a crear y modificar.',
}

function bloqueada(motivo) {
  return { bloqueado: true, enGracia: false, diasRestantes: 0, motivo, vence: null, aviso: MOTIVOS_BLOQUEO[motivo] }
}

/**
 * @param datos  { estado, fecha_fin_prueba, sub_fecha_fin, sub_status }  (fechas AAAA-MM-DD o null)
 * @param hoy    AAAA-MM-DD (por defecto, hoy en República Dominicana)
 * @returns      { bloqueado, enGracia, diasRestantes, motivo, vence, aviso }
 */
export function evaluarEstado({ estado, fecha_fin_prueba = null, sub_fecha_fin = null, sub_status = null }, hoy = hoyRD(), diasGracia = DIAS_GRACIA) {
  const libre = { bloqueado: false, enGracia: false, diasRestantes: null, motivo: null, vence: null, aviso: null }

  if (estado === 'exento') return libre
  if (estado === 'cancelado') return bloqueada('cancelada')
  if (estado === 'suspendido') return bloqueada('suspendida')
  if (sub_status === 'cancelado') return bloqueada('cancelada')
  if (sub_status === 'suspendido') return bloqueada('suspendida')
  if (sub_status === 'expirado') return bloqueada('vencida')

  // Pendiente de pago: la fecha límite de pago es fecha_fin_prueba
  if (estado === 'pendiente_pago' || estado === 'pendiente') {
    if (!fecha_fin_prueba) return libre
    const restantes = diasEntre(hoy, fecha_fin_prueba)
    if (restantes < 0) return bloqueada('pago_requerido')
    return {
      bloqueado: false, enGracia: true, diasRestantes: restantes, motivo: 'pago_pendiente', vence: fecha_fin_prueba,
      aviso: `Tienes ${plural(restantes, 'día')} para pagar tu suscripción.`,
    }
  }

  const vence = estado === 'prueba' ? (fecha_fin_prueba || sub_fecha_fin) : sub_fecha_fin
  if (!vence) return libre

  const restantes = diasEntre(hoy, vence)
  if (restantes >= 0) {
    const cerca = restantes <= 5
    return {
      bloqueado: false, enGracia: false, diasRestantes: restantes, motivo: null, vence,
      aviso: cerca ? `Tu ${estado === 'prueba' ? 'período de prueba' : 'suscripción'} vence en ${plural(restantes, 'día')}.` : null,
    }
  }

  const vencidoHace = -restantes
  if (vencidoHace <= diasGracia) {
    const quedan = diasGracia - vencidoHace
    return {
      bloqueado: false, enGracia: true, diasRestantes: quedan, motivo: 'en_gracia', vence,
      aviso: `Tu ${estado === 'prueba' ? 'período de prueba' : 'suscripción'} venció. Tienes ${plural(quedan, 'día')} de gracia para renovar antes de que el sistema quede en solo lectura.`,
    }
  }
  return { ...bloqueada(estado === 'prueba' ? 'prueba_vencida' : 'vencida'), vence }
}
