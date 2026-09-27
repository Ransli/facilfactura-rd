// Formato 607: ventas de bienes y servicios (lo que la empresa facturó).
//
// DÓNDE VA: backend/services/contabilidad/
// Recibe filas de la tabla `facturas` unidas con `clientes` y devuelve el archivo. Función pura.
//
// TODO (Carlos, 29 sep):
//  1. Confirmar orden y cantidad de columnas contra la guía vigente de la DGII (el orden de abajo son 23 columnas).
//  2. «Tipo de ingreso» (01 a 06): por ahora todas las facturas van como 01 (ingresos por operaciones).
//  3. Las facturas anuladas NO van en el 607 (van en el 608): ya se filtran aquí.
//  4. Las formas de pago (efectivo, tarjeta, crédito...) todavía no se guardan en la factura: van en cero salvo
//     «Venta a crédito». Cuando exista el registro de cobros, se rellenan.
import { armarArchivo, linea, tipoIdentificacion, soloDigitos, fechaAAAAMMDD, monto } from './formatoDGII.js'

export const COLUMNAS_607 = [
  'RNC o cédula del cliente', 'Tipo de identificación', 'NCF', 'NCF modificado', 'Tipo de ingreso',
  'Fecha del comprobante', 'Fecha de retención', 'Monto facturado', 'ITBIS facturado', 'ITBIS retenido por terceros',
  'ITBIS percibido', 'Retención de renta por terceros', 'ISR percibido', 'Impuesto selectivo al consumo',
  'Otros impuestos y tasas', 'Monto propina legal', 'Efectivo', 'Cheque, transferencia o depósito', 'Tarjeta',
  'Venta a crédito', 'Bonos o certificados de regalo', 'Permuta', 'Otras formas de ventas',
]

/** Una factura → los 23 campos del 607. */
export function campos607(f) {
  return [
    soloDigitos(f.cliente_rnc), tipoIdentificacion(f.cliente_rnc), f.nfc_numero, '', '01',
    fechaAAAAMMDD(f.fecha), '', monto(f.subtotal), monto(f.itbis), monto(f.ret_itbis),
    '', monto(f.ret_isr), '', '',
    '', '', monto(0), monto(0), monto(0),
    monto(f.total), monto(0), monto(0), monto(0),
  ]
}

/** Archivo 607 de un período. `facturas` ya viene filtrado por empresa y período; aquí se descartan las anuladas. */
export function generar607({ rncEmpresa, periodo, facturas }) {
  const vigentes = facturas.filter((f) => f.estado === 'emitida')
  return armarArchivo('607', rncEmpresa, periodo, vigentes.map((f) => linea(campos607(f))))
}
