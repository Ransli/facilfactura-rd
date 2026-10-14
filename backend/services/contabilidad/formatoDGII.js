// Utilidades comunes de los formatos de envío de la DGII (606, 607, 608 y 609).
//
// DÓNDE VA: backend/services/contabilidad/
// Son funciones puras (sin base de datos), con pruebas en backend/tests/contabilidad/formatoDGII.test.js.
//
// Los archivos de la DGII son texto plano: una línea de encabezado (formato, RNC de la empresa, período y cantidad
// de registros) y una línea por registro, con los campos separados por «|». Confirma este detalle contra la guía vigente.

export const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

/** Tipo de identificación del proveedor o cliente: 1 = RNC (9 dígitos), 2 = cédula (11 dígitos); vacío si no cuadra. */
export function tipoIdentificacion(documento) {
  const d = soloDigitos(documento)
  if (d.length === 9) return '1'
  if (d.length === 11) return '2'
  return ''
}

/** Fecha como AAAAMMDD. Acepta un Date o un texto AAAA-MM-DD; devuelve '' si no hay fecha. */
export function fechaAAAAMMDD(fecha) {
  if (!fecha) return ''
  const iso = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : String(fecha).slice(0, 10)
  return iso.replace(/-/g, '')
}

/** Monto con dos decimales y punto decimal; vacío o cero se escribe 0.00. */
export const monto = (valor) => Number(valor || 0).toFixed(2)

/** Período AAAAMM válido (mes de 01 a 12). */
export function periodoValido(periodo) {
  return /^\d{4}(0[1-9]|1[0-2])$/.test(String(periodo))
}

/** Rango de fechas [desde, hasta] (AAAA-MM-DD) que cubre un período AAAAMM. */
export function rangoDelPeriodo(periodo) {
  if (!periodoValido(periodo)) throw new Error(`Período inválido: ${periodo}`)
  const anio = Number(String(periodo).slice(0, 4))
  const mes = Number(String(periodo).slice(4, 6))
  const ultimoDia = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  const mm = String(mes).padStart(2, '0')
  return { desde: `${anio}-${mm}-01`, hasta: `${anio}-${mm}-${String(ultimoDia).padStart(2, '0')}` }
}

export const linea = (campos) => campos.map((c) => c ?? '').join('|')

export function encabezado(formato, rncEmpresa, periodo, cantidad) {
  return linea([formato, soloDigitos(rncEmpresa), periodo, cantidad])
}

/** Arma el archivo completo: encabezado + una línea por registro (cada línea ya viene armada con `linea`). */
export function armarArchivo(formato, rncEmpresa, periodo, lineas) {
  if (!periodoValido(periodo)) throw new Error(`Período inválido: ${periodo}`)
  return [encabezado(formato, rncEmpresa, periodo, lineas.length), ...lineas].join('\r\n') + '\r\n'
}
