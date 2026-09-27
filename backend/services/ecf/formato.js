// Formato de los datos del e-CF: fechas, importes, escapado de texto y el error de negocio del módulo.

/** Error de negocio con un mensaje que puede mostrarse tal cual al usuario. */
export class ErrorDeEcf extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje)
    this.name = 'ErrorDeEcf'
    this.estado = estado
  }
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** Importe con 2 decimales y punto decimal. */
export const dinero = (n) => round2(n).toFixed(2)

/** Cantidad o precio unitario: 2 decimales como mínimo y hasta 4 si hacen falta. */
export function decimales(n) {
  const s = Number(n).toFixed(4).replace(/0{1,2}$/, '')
  return s.endsWith('.') ? `${s}00` : s
}

const pad = (n) => String(n).padStart(2, '0')

/** Fecha AAAA-MM-DD a partir de un texto (se toman los 10 primeros caracteres) o de un Date (hora local). */
export function fechaISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor ?? ''))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const valida = d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3])
  return valida ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** dd-MM-AAAA, o null si la fecha no es válida. */
export function fechaDgii(valor) {
  const iso = fechaISO(valor)
  return iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : null
}

/** dd-MM-AAAA HH:mm:ss en la hora de la República Dominicana (UTC-4, sin horario de verano). */
export function fechaHoraRD(fecha = new Date()) {
  const rd = new Date(fecha.getTime() - 4 * 60 * 60 * 1000)
  return `${pad(rd.getUTCDate())}-${pad(rd.getUTCMonth() + 1)}-${rd.getUTCFullYear()} ` +
    `${pad(rd.getUTCHours())}:${pad(rd.getUTCMinutes())}:${pad(rd.getUTCSeconds())}`
}

/** Solo los dígitos de un RNC o cédula. */
export const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

export const esRncValido = (digitos) => /^(\d{9}|\d{11})$/.test(digitos)

// Caracteres que XML 1.0 no admite ni escapados
// eslint-disable-next-line no-control-regex
const CONTROL_INVALIDO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

export function escapar(valor) {
  return String(valor)
    .replace(CONTROL_INVALIDO, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** `<nombre>valor</nombre>`, o nada si el valor está vacío. */
export const etiqueta = (nombre, valor) =>
  (valor === undefined || valor === null || valor === '' ? '' : `<${nombre}>${escapar(valor)}</${nombre}>`)

/** `<nombre>contenido</nombre>` con el contenido ya armado (no se escapa). */
export const grupo = (nombre, contenido) => `<${nombre}>${contenido}</${nombre}>`

/** Texto sin espacios sobrantes ni caracteres de control; '' si no hay nada. */
export const limpiar = (valor) => String(valor ?? '').replace(CONTROL_INVALIDO, '').trim()
