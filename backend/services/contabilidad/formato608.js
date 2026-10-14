// Formato 608: comprobantes anulados en el período.
//
// DÓNDE VA: backend/services/contabilidad/
// Recibe las facturas con estado 'anulada' y devuelve el archivo. Función pura.
//
// Nota: la factura todavía no guarda el motivo de la anulación (no hay columna `motivo_anulacion` en `facturas`,
// y agregarla es un cambio a una tabla fuera de este módulo). Mientras tanto se usa siempre el código 05
// (errores de facturación) como valor por omisión, documentado aquí y en el borrador del IT-1. Si se agrega la
// columna más adelante, basta con quitar TIPO_ANULACION_POR_OMISION de campos608 sin tocar generar608.
import { armarArchivo, linea, fechaAAAAMMDD } from './formatoDGII.js'

export const COLUMNAS_608 = ['NCF', 'Fecha del comprobante', 'Tipo de anulación']

const TIPO_ANULACION_POR_OMISION = '05'

export function campos608(f) {
  return [f.nfc_numero, fechaAAAAMMDD(f.fecha), f.motivo_anulacion || TIPO_ANULACION_POR_OMISION]
}

export function generar608({ rncEmpresa, periodo, facturas }) {
  const anuladas = facturas.filter((f) => f.estado === 'anulada')
  return armarArchivo('608', rncEmpresa, periodo, anuladas.map((f) => linea(campos608(f))))
}
