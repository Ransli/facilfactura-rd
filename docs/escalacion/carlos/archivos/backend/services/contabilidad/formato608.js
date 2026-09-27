// Formato 608: comprobantes anulados en el período.
//
// DÓNDE VA: backend/services/contabilidad/
// Recibe las facturas con estado 'anulada' y devuelve el archivo. Función pura.
//
// TODO (Carlos, 6 oct):
//  1. Confirmar las columnas contra la guía vigente de la DGII (aquí: NCF, fecha, tipo de anulación).
//  2. «Tipo de anulación» (01 a 10): hoy la factura no guarda el motivo de la anulación. Opciones:
//     agregar una columna `motivo_anulacion` en `facturas` (migración nueva, pídele a Ransli que revise) o usar
//     siempre el código 05 (errores de facturación) como valor por omisión hasta entonces.
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
