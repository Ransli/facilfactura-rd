// Secuencias de e-NCF. Se guardan en la misma tabla que los NCF en papel (`nfc_secuencias`): el tipo `E31`, `E32` o `E34`
// más un correlativo de 10 dígitos es exactamente el formato del e-NCF (`E310000000001`), y así la pantalla de NCF, el
// bloqueo y la alerta de agotamiento sirven sin cambios.

const TIPOS_ELECTRONICOS = ['E31', 'E32', 'E34']
const MAXIMO_E_NCF = 9_999_999_999          // 10 dígitos

export const esTipoElectronico = (tipoNcf) => /^E/i.test(String(tipoNcf ?? ''))

/**
 * Motivo por el que una secuencia electrónica no es válida, o null si lo es. Los NCF en papel no se validan aquí.
 * La fecha de vencimiento de la secuencia (FechaVencimientoSecuencia) es obligatoria en el e-CF 31 y no aplica en 32 y 34.
 */
export function validarSecuenciaElectronica({ tipo_ncf, desde, hasta, fecha_vencimiento }) {
  if (!esTipoElectronico(tipo_ncf)) return null
  if (!TIPOS_ELECTRONICOS.includes(tipo_ncf)) return 'Los comprobantes electrónicos admitidos son E31, E32 y E34'
  const d = Number(desde)
  const h = Number(hasta)
  if (!Number.isInteger(d) || !Number.isInteger(h)) return 'desde y hasta deben ser números enteros'
  if (d < 1) return 'desde debe ser 1 o mayor'
  if (h > MAXIMO_E_NCF) return 'hasta no puede superar los 10 dígitos del e-NCF (9999999999)'
  if (tipo_ncf === 'E31' && !fecha_vencimiento) return 'La fecha de vencimiento de la secuencia es obligatoria para el E31'
  return null
}
