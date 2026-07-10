// Formato y validación de los campos dominicanos que se repiten entre vistas.
//
// RNC:    9 dígitos  → 130-88170-7
// Cédula: 11 dígitos → 001-1234567-8
// Teléfono/celular: 10 dígitos → 809-555-0000

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '')

export function formatearRncCedula(v) {
  const n = soloDigitos(v).slice(0, 11)
  if (n.length <= 9) {
    if (n.length <= 3) return n
    if (n.length <= 8) return `${n.slice(0, 3)}-${n.slice(3)}`
    return `${n.slice(0, 3)}-${n.slice(3, 8)}-${n.slice(8)}`
  }
  if (n.length <= 10) return `${n.slice(0, 3)}-${n.slice(3)}`
  return `${n.slice(0, 3)}-${n.slice(3, 10)}-${n.slice(10)}`
}

export function formatearTelefono(v) {
  const n = soloDigitos(v).slice(0, 10)
  if (n.length <= 3) return n
  if (n.length <= 6) return `${n.slice(0, 3)}-${n.slice(3)}`
  return `${n.slice(0, 3)}-${n.slice(3, 6)}-${n.slice(6)}`
}

// Acepta cualquier cantidad de dígitos: las cuentas bancarias no tienen
// un largo único entre bancos dominicanos.
export function formatearCuenta(v) {
  return soloDigitos(v).slice(0, 20)
}

// Deja escribir un decimal parcial ("18." mientras se teclea) sin borrarlo.
export function formatearPorcentaje(v) {
  const limpio = String(v ?? '').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1')
  const [ent, dec] = limpio.split('.')
  const entero = ent.slice(0, 3)
  return dec === undefined ? entero : `${entero}.${dec.slice(0, 2)}`
}

export function validarRncCedula(v) {
  if (!v) return ''
  const n = soloDigitos(v)
  if (n.length === 9 || n.length === 11) return ''
  return 'Formato inválido. RNC: 9 dígitos (ej: 130-88170-7) · Cédula: 11 dígitos (ej: 001-1234567-8)'
}

export function validarEmail(v) {
  if (!v) return ''
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Correo inválido (ej: cliente@correo.com)'
}

export function validarTelefono(v) {
  if (!v) return ''
  return soloDigitos(v).length === 10 ? '' : 'Teléfono inválido (ej: 809-555-0000 · 10 dígitos)'
}

export function validarSitioWeb(v) {
  if (!v) return ''
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/.test(v.trim())
    ? ''
    : 'Sitio web inválido (ej: www.miempresa.com)'
}

export function validarPorcentaje(v) {
  if (v === '' || v === null || v === undefined) return ''
  const n = Number(v)
  if (Number.isNaN(n)) return 'Debe ser un número'
  return n >= 0 && n <= 100 ? '' : 'Debe estar entre 0 y 100'
}

export function validarRequerido(v) {
  return String(v ?? '').trim() ? '' : 'Este campo es obligatorio'
}

export function whatsappUrl(telefono, celular) {
  const num = soloDigitos(celular || telefono)
  if (!num) return null
  const intl = num.length === 10 ? `1${num}` : num
  return `https://web.whatsapp.com/send?phone=${intl}`
}
