// Formato 609: pagos al exterior (servicios prestados desde fuera del país).
//
// DÓNDE VA: backend/services/contabilidad/
//
// TODO (Carlos, 6 oct): este formato tiene su propio conjunto de columnas (identificación del beneficiario, país,
// tipo de renta, monto pagado, retención de ISR...). Pasos:
//  1. Bajar la guía vigente del 609 de la DGII y copiar la lista de columnas en COLUMNAS_609.
//  2. Decidir de dónde salen los datos: lo más simple es marcar un gasto con un indicador «pago al exterior» y
//     los campos extra del beneficiario (migración nueva sobre `gastos`; pídele a Ransli que la revise).
//  3. Implementar campos609 y generar609 igual que los otros formatos y cubrirlos con pruebas.
import { armarArchivo, linea } from './formatoDGII.js'

export const COLUMNAS_609 = [] // TODO

export function campos609(/* pago */) {
  throw new Error('TODO: formato 609 sin implementar')
}

export function generar609({ rncEmpresa, periodo, pagos }) {
  return armarArchivo('609', rncEmpresa, periodo, pagos.map((p) => linea(campos609(p))))
}
