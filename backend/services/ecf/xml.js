// Construcción del XML de los e-CF 31 (crédito fiscal), 32 (consumo) y 34 (nota de crédito), según el
// «Formato Comprobante Fiscal Electrónico (e-CF) v1.0» de la DGII (octubre 2025): mismas etiquetas y mismo orden.
//
// Es una función pura: recibe un documento con datos simples y devuelve el XML SIN firmar. La firma la agrega firma.js.

import {
  ErrorDeEcf, round2, dinero, decimales, fechaDgii, soloDigitos, esRncValido, etiqueta, grupo, limpiar,
} from './formato.js'

const TIPOS = [31, 32, 34]
const MAXIMO_ITEMS = 100
const TASAS = { 18: { indicador: 1, montoGravado: 'MontoGravadoI1', tasa: 'ITBIS1', total: 'TotalITBIS1' },
                16: { indicador: 2, montoGravado: 'MontoGravadoI2', tasa: 'ITBIS2', total: 'TotalITBIS2' },
                0:  { indicador: 3, montoGravado: 'MontoGravadoI3', tasa: 'ITBIS3', total: 'TotalITBIS3' } }
const tasaAdmitida = (tasa) => tasa !== null && tasa !== undefined && tasa !== '' && Object.hasOwn(TASAS, Number(tasa))
const LIMITE_CONSUMO_SIN_RNC = 250000
const MAXIMO_NOMBRE_ITEM = 80

// ── Validación ────────────────────────────────────────────────

function validar(doc, { totalConItbis }) {
  const tipo = Number(doc.tipo)
  if (!TIPOS.includes(tipo)) throw new ErrorDeEcf('Solo se emiten los comprobantes electrónicos 31, 32 y 34')

  if (!new RegExp(`^E${tipo}\\d{10}$`).test(String(doc.encf ?? ''))) {
    throw new ErrorDeEcf(`El e-NCF debe ser E${tipo} seguido de 10 dígitos`)
  }

  const emisor = doc.emisor || {}
  if (!esRncValido(soloDigitos(emisor.rnc))) throw new ErrorDeEcf('El RNC del emisor debe tener 9 u 11 dígitos')
  if (!limpiar(emisor.razonSocial)) throw new ErrorDeEcf('Falta la razón social del emisor')
  if (!limpiar(emisor.direccion)) throw new ErrorDeEcf('Falta la dirección del emisor: complétala en Configuración')

  if (!fechaDgii(doc.fechaEmision)) throw new ErrorDeEcf('La fecha de emisión no es válida')
  if (!/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/.test(String(doc.fechaHoraFirma ?? ''))) {
    throw new ErrorDeEcf('Falta la fecha y hora de la firma (dd-MM-AAAA HH:mm:ss)')
  }
  if (tipo === 31 && !fechaDgii(doc.fechaVencimientoSecuencia)) {
    throw new ErrorDeEcf('Falta la fecha de vencimiento de la secuencia del e-NCF')
  }
  if (!tasaAdmitida(doc.tasaItbis)) {
    const tasa = doc.tasaItbis === undefined || doc.tasaItbis === null ? '' : ` del ${doc.tasaItbis}%`
    throw new ErrorDeEcf(`La tasa de ITBIS${tasa} no está admitida en e-CF: solo 18%, 16% o 0%`)
  }

  // Comprador
  const comprador = doc.comprador
  const rncComprador = soloDigitos(comprador?.rnc)
  if (tipo === 31) {
    if (!comprador) throw new ErrorDeEcf('El e-CF 31 necesita los datos del comprador')
    if (!esRncValido(rncComprador)) throw new ErrorDeEcf('El RNC del comprador es obligatorio en el e-CF 31 y debe tener 9 u 11 dígitos')
    if (!limpiar(comprador.razonSocial)) throw new ErrorDeEcf('La razón social del comprador es obligatoria en el e-CF 31')
  } else if (rncComprador && !esRncValido(rncComprador)) {
    throw new ErrorDeEcf('El RNC del comprador debe tener 9 u 11 dígitos')
  }
  if (tipo === 32 && totalConItbis >= LIMITE_CONSUMO_SIN_RNC && !rncComprador) {
    throw new ErrorDeEcf('Desde RD$ 250,000 el e-CF 32 exige el RNC del comprador')
  }

  // Ítems
  if (!Array.isArray(doc.items) || doc.items.length === 0) throw new ErrorDeEcf('El comprobante debe tener al menos un ítem')
  if (doc.items.length > MAXIMO_ITEMS) throw new ErrorDeEcf(`Un e-CF admite hasta ${MAXIMO_ITEMS} ítems`)
  doc.items.forEach((it, i) => {
    const n = i + 1
    if (!limpiar(it.nombre)) throw new ErrorDeEcf(`El ítem ${n} necesita un nombre`)
    if (!(Number(it.cantidad) > 0)) throw new ErrorDeEcf(`La cantidad del ítem ${n} debe ser mayor que cero`)
    if (!(Number(it.monto) >= 0) || !(Number(it.precioUnitario) >= 0)) throw new ErrorDeEcf(`El monto del ítem ${n} no puede ser negativo`)
  })

  // Retenciones (el formato no las admite en consumo)
  const ret = doc.retenciones || {}
  if (tipo === 32 && (Number(ret.itbis) > 0 || Number(ret.isr) > 0)) {
    throw new ErrorDeEcf('El e-CF 32 (consumo) no admite retenciones')
  }

  // Referencia (solo la nota de crédito)
  const ref = doc.referencia
  if (tipo === 34) {
    if (!ref?.ncfModificado || !fechaDgii(ref.fechaNcfModificado) || !ref.codigoModificacion) {
      throw new ErrorDeEcf('La nota de crédito necesita la información de referencia: e-NCF modificado, su fecha y el código de modificación')
    }
    if (doc.indicadorNotaCredito !== 0 && doc.indicadorNotaCredito !== 1) {
      throw new ErrorDeEcf('Falta el indicador de nota de crédito (0 si se emite dentro de 30 días del original, 1 si pasó más)')
    }
  } else if (ref) {
    throw new ErrorDeEcf(`El e-CF ${tipo} no lleva información de referencia`)
  }
}

// ── Cálculos ──────────────────────────────────────────────────

/** Reparte `total` en partes proporcionales a `pesos`, con el sobrante en la última: la suma es exacta. */
function repartir(total, pesos) {
  const suma = pesos.reduce((s, p) => s + p, 0)
  let acumulado = 0
  return pesos.map((p, i) => {
    if (i === pesos.length - 1) return round2(total - acumulado)
    const parte = suma > 0 ? round2((total * p) / suma) : 0
    acumulado = round2(acumulado + parte)
    return parte
  })
}

function calcularTotales(doc) {
  const montos = doc.items.map((i) => round2(i.monto))
  const gravado = round2(montos.reduce((s, m) => s + m, 0))
  const itbis = round2(gravado * (Number(doc.tasaItbis) / 100))
  return { montos, gravado, itbis, total: round2(gravado + itbis) }
}

// ── Secciones ─────────────────────────────────────────────────

function idDoc(doc, tipo) {
  return grupo('IdDoc',
    etiqueta('TipoeCF', tipo) +
    etiqueta('eNCF', doc.encf) +
    (tipo === 31 ? etiqueta('FechaVencimientoSecuencia', fechaDgii(doc.fechaVencimientoSecuencia)) : '') +
    (tipo === 34 ? etiqueta('IndicadorNotaCredito', doc.indicadorNotaCredito) : '') +
    etiqueta('IndicadorMontoGravado', 0) +                       // los precios de la v1 no incluyen ITBIS
    etiqueta('TipoIngresos', doc.tipoIngresos || '01') +
    etiqueta('TipoPago', doc.tipoPago || 1) +
    (Number(doc.tipoPago) === 2 ? etiqueta('FechaLimitePago', fechaDgii(doc.fechaLimitePago)) : ''))
}

function emisor(doc) {
  const e = doc.emisor
  return grupo('Emisor',
    etiqueta('RNCEmisor', soloDigitos(e.rnc)) +
    etiqueta('RazonSocialEmisor', limpiar(e.razonSocial)) +
    etiqueta('NombreComercial', limpiar(e.nombreComercial)) +
    etiqueta('DireccionEmisor', limpiar(e.direccion)) +
    etiqueta('CorreoEmisor', limpiar(e.correo)) +
    etiqueta('NumeroFacturaInterna', limpiar(doc.numeroFacturaInterna)) +
    etiqueta('FechaEmision', fechaDgii(doc.fechaEmision)))
}

function comprador(doc, tipo) {
  const c = doc.comprador || {}
  const contenido =
    etiqueta('RNCComprador', soloDigitos(c.rnc)) +
    etiqueta('RazonSocialComprador', limpiar(c.razonSocial)) +
    etiqueta('DireccionComprador', limpiar(c.direccion))
  // En el 32 el comprador va aunque esté vacío (consumidor final); en el 34 solo si hay datos
  if (tipo === 34 && !contenido) return ''
  return grupo('Comprador', contenido)
}

function totales(doc, tipo, calc) {
  const t = TASAS[Number(doc.tasaItbis)]
  const ret = doc.retenciones || {}
  return grupo('Totales',
    etiqueta('MontoGravadoTotal', dinero(calc.gravado)) +
    etiqueta(t.montoGravado, dinero(calc.gravado)) +
    etiqueta(t.tasa, Number(doc.tasaItbis)) +
    etiqueta('TotalITBIS', dinero(calc.itbis)) +
    etiqueta(t.total, dinero(calc.itbis)) +
    etiqueta('MontoTotal', dinero(calc.total)) +                 // el formato no descuenta las retenciones
    (tipo !== 32 && Number(ret.itbis) > 0 ? etiqueta('TotalITBISRetenido', dinero(ret.itbis)) : '') +
    (tipo !== 32 && Number(ret.isr) > 0 ? etiqueta('TotalISRRetencion', dinero(ret.isr)) : ''))
}

function detallesItems(doc, tipo, calc) {
  const indicador = TASAS[Number(doc.tasaItbis)].indicador
  const ret = doc.retenciones || {}
  const retItbis = tipo !== 32 && Number(ret.itbis) > 0 ? repartir(round2(ret.itbis), calc.montos) : null
  const retIsr = tipo !== 32 && Number(ret.isr) > 0 ? repartir(round2(ret.isr), calc.montos) : null

  const lineas = doc.items.map((it, i) => {
    const nombre = limpiar(it.nombre)
    const descripcion = limpiar(it.descripcion) || (nombre.length > MAXIMO_NOMBRE_ITEM ? nombre : '')
    const retencion = retItbis || retIsr
      ? grupo('Retencion',
          etiqueta('IndicadorAgenteRetencionoPercepcion', 1) +
          (retItbis ? etiqueta('MontoITBISRetenido', dinero(retItbis[i])) : '') +
          (retIsr ? etiqueta('MontoISRRetenido', dinero(retIsr[i])) : ''))
      : ''
    return grupo('Item',
      etiqueta('NumeroLinea', i + 1) +
      etiqueta('IndicadorFacturacion', indicador) +
      retencion +
      etiqueta('NombreItem', nombre.slice(0, MAXIMO_NOMBRE_ITEM)) +
      etiqueta('IndicadorBienoServicio', it.esServicio ? 2 : 1) +
      etiqueta('DescripcionItem', descripcion) +
      etiqueta('CantidadItem', decimales(it.cantidad)) +
      etiqueta('PrecioUnitarioItem', decimales(it.precioUnitario)) +
      etiqueta('MontoItem', dinero(calc.montos[i])))
  })
  return grupo('DetallesItems', lineas.join(''))
}

function informacionReferencia(doc) {
  const r = doc.referencia
  return grupo('InformacionReferencia',
    etiqueta('NCFModificado', r.ncfModificado) +
    etiqueta('FechaNCFModificado', fechaDgii(r.fechaNcfModificado)) +
    etiqueta('CodigoModificacion', r.codigoModificacion) +
    etiqueta('RazonModificacion', limpiar(r.razonModificacion)))
}

// ── Punto de entrada ──────────────────────────────────────────

/**
 * Construye el XML de un e-CF sin firmar.
 * @param doc { tipo, encf, fechaVencimientoSecuencia, fechaEmision, fechaHoraFirma, tipoIngresos, tipoPago, fechaLimitePago,
 *              numeroFacturaInterna, emisor, comprador, tasaItbis, items, retenciones, indicadorNotaCredito, referencia }
 * @throws ErrorDeEcf si el documento no cumple el formato (mensaje claro para el usuario)
 */
export function construirXml(doc) {
  const tipo = Number(doc.tipo)
  const calc = Array.isArray(doc.items) && tasaAdmitida(doc.tasaItbis) ? calcularTotales(doc) : { total: 0 }
  validar(doc, { totalConItbis: calc.total })

  const encabezado = grupo('Encabezado',
    etiqueta('Version', '1.0') + idDoc(doc, tipo) + emisor(doc) + comprador(doc, tipo) + totales(doc, tipo, calc))

  return '<?xml version="1.0" encoding="UTF-8"?>' +
    grupo('ECF',
      encabezado +
      detallesItems(doc, tipo, calc) +
      (tipo === 34 ? informacionReferencia(doc) : '') +
      etiqueta('FechaHoraFirma', doc.fechaHoraFirma))
}
