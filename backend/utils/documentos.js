// RNC (9 dígitos, empresas) y cédula (11 dígitos, personas físicas) de República Dominicana.
// Se valida la LONGITUD, igual que la interfaz; el dígito verificador no se comprueba.

export const soloDigitos = (valor) => String(valor ?? '').replace(/\D/g, '')

export function esDocumentoValido(valor) {
  const d = soloDigitos(valor)
  return d.length === 9 || d.length === 11
}

/** RNC como 130-88170-7 y cédula como 001-1234567-8; si la longitud no cuadra devuelve los dígitos tal cual. */
export function formatearDocumento(valor) {
  const d = soloDigitos(valor)
  if (d.length === 9) return `${d.slice(0, 3)}-${d.slice(3, 8)}-${d.slice(8)}`
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}`
  return d
}

export const esCorreoValido = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor ?? '').trim())
