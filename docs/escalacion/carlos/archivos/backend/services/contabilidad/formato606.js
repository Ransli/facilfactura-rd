// Formato 606: compras de bienes y servicios (lo que la empresa gastó).
//
// DÓNDE VA: backend/services/contabilidad/
// Recibe filas de la tabla `gastos` (con `categoria_606_codigo` unido desde `categorias_606`) y devuelve el archivo.
// Es una función pura: la consulta a la base la hace la ruta (backend/routes/contabilidad/reportes.js).
//
// TODO (Carlos, 30 sep): confirmar el orden y la cantidad de columnas contra la guía vigente de la DGII.
// El orden de abajo es el punto de partida (23 columnas).
import { armarArchivo, linea, tipoIdentificacion, soloDigitos, fechaAAAAMMDD, monto } from './formatoDGII.js'

export const COLUMNAS_606 = [
  'RNC o cédula del proveedor', 'Tipo de identificación', 'Tipo de bienes y servicios comprados', 'NCF', 'NCF modificado',
  'Fecha del comprobante', 'Fecha de pago', 'Monto facturado en servicios', 'Monto facturado en bienes',
  'Total monto facturado', 'ITBIS facturado', 'ITBIS retenido', 'ITBIS sujeto a proporcionalidad',
  'ITBIS llevado al costo', 'ITBIS por adelantar', 'ITBIS percibido en compras', 'Tipo de retención en ISR',
  'Monto retención de renta', 'ISR percibido en compras', 'Impuesto selectivo al consumo', 'Otros impuestos y tasas',
  'Monto propina legal', 'Forma de pago',
]

/** Un gasto → los 23 campos del 606. Lo que la empresa no captura todavía sale vacío o en cero. */
export function campos606(g) {
  const total = Number(g.monto_servicios || 0) + Number(g.monto_bienes || 0)
  return [
    soloDigitos(g.proveedor_rnc), tipoIdentificacion(g.proveedor_rnc), g.categoria_606_codigo, g.ncf, g.ncf_modificado || '',
    fechaAAAAMMDD(g.fecha_comprobante), fechaAAAAMMDD(g.fecha_pago), monto(g.monto_servicios), monto(g.monto_bienes),
    monto(total), monto(g.itbis_facturado), monto(g.itbis_retenido), '',
    monto(g.itbis_llevado_al_costo), monto(g.itbis_por_adelantar), '', '',
    monto(g.monto_retencion_renta), '', '', '',
    monto(g.propina_legal), g.forma_pago,
  ]
}

/** Archivo 606 de un período. `gastos` ya viene filtrado por empresa y por período. */
export function generar606({ rncEmpresa, periodo, gastos }) {
  // TODO: excluir los gastos con estado 'anulado' si la guía lo exige
  return armarArchivo('606', rncEmpresa, periodo, gastos.map((g) => linea(campos606(g))))
}
