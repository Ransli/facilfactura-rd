// Formato 609: pagos al exterior (servicios prestados desde fuera del país, con su ISR retenido).
//
// DÓNDE VA: backend/services/contabilidad/
// Recibe los `gastos` del período marcados con `es_pago_exterior = true` (unidos a `categorias_606` igual que el
// 606, aunque el 609 no usa la categoría). Función pura.
//
// NOTA (verificar contra la guía vigente de la DGII antes de dar por bueno): el 609 tiene su propio juego de
// columnas, distinto del 606/607. El orden de abajo (9 columnas) es el punto de partida más citado en la guía del
// formato de envío; confírmalo contra la versión vigente antes de usarlo en un envío real.
import { armarArchivo, linea, fechaAAAAMMDD, monto } from './formatoDGII.js'

export const COLUMNAS_609 = [
  'RNC o identificación del beneficiario', 'Nombre o razón social del beneficiario', 'País de residencia',
  'Tipo de renta pagada o acreditada', 'Fecha de pago o acreditación', 'Monto pagado o acreditado',
  'ISR retenido y pagado', 'Monto aplicado de impuesto proporcional', 'Fecha de pago del impuesto en el exterior',
]

/** Un gasto marcado como pago al exterior → los 9 campos del 609. */
export function campos609(g) {
  const montoPagado = Number(g.monto_servicios || 0) + Number(g.monto_bienes || 0)
  return [
    g.proveedor_rnc || '', g.proveedor_nombre, g.pais_beneficiario || '',
    g.tipo_renta_exterior || '', fechaAAAAMMDD(g.fecha_pago || g.fecha_comprobante), monto(montoPagado),
    monto(g.monto_retencion_renta), '', '',
  ]
}

/** Archivo 609 de un período. `gastos` ya viene filtrado por empresa y período; aquí se queda solo con los pagos al exterior. */
export function generar609({ rncEmpresa, periodo, gastos }) {
  const alExterior = gastos.filter((g) => g.es_pago_exterior && g.estado === 'registrado')
  return armarArchivo('609', rncEmpresa, periodo, alExterior.map((g) => linea(campos609(g))))
}
