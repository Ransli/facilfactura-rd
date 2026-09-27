// Aritmética de fechas AAAA-MM-DD (fechas de calendario, sin hora ni zona horaria).

const aISO = (d) => d.toISOString().slice(0, 10)
const aUTC = (fecha) => new Date(`${fecha}T00:00:00Z`)

/** Suma (o resta, con un número negativo) días de calendario. */
export function sumarDias(fecha, dias) {
  const d = aUTC(fecha)
  d.setUTCDate(d.getUTCDate() + dias)
  return aISO(d)
}

/** Suma meses conservando el día; si el mes destino es más corto, usa su último día (31 ene + 1 mes = 28 feb). */
export function sumarMeses(fecha, meses) {
  const d = aUTC(fecha)
  const dia = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(dia, ultimoDia))
  return aISO(d)
}

/** La fecha posterior de dos; ignora la que venga vacía. */
export function fechaMayor(a, b) {
  if (!a) return b ?? null
  if (!b) return a
  return a >= b ? a : b
}
