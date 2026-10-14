// Formato 606: compras de bienes y servicios (lo que la empresa gastó).
//
// DÓNDE VA: backend/services/contabilidad/
// Recibe filas de la tabla `gastos` (con `categoria_606_codigo` unido desde `categorias_606`) y devuelve el archivo.
// Es una función pura: la consulta a la base la hace la ruta (backend/routes/contabilidad/reportes.js).
//
// El orden de abajo (23 columnas) sigue la guía de envío de la DGII vigente a la fecha de esta entrega;
// verifícalo contra la versión vigente antes de un envío real, como en los demás formatos de este módulo.
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

/** Archivo 606 de un período. `gastos` ya viene filtrado por empresa y por período; aquí se excluyen los
 *  anulados y los pagos al exterior (esos van en el 609, no en el 606). */
export function generar606({ rncEmpresa, periodo, gastos }) {
  const vigentes = gastos.filter((g) => g.estado === 'registrado' && !g.es_pago_exterior)
  return armarArchivo('606', rncEmpresa, periodo, vigentes.map((g) => linea(campos606(g))))
}
