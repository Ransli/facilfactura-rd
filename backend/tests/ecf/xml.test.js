import '../helpers/entorno.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'
import { construirXml } from '../../services/ecf/xml.js'
import { ErrorDeEcf, fechaHoraRD } from '../../services/ecf/formato.js'
import { firmarXml, verificarFirma } from '../../services/ecf/firma.js'
import { crearCertificadoDePrueba } from '../helpers/certificados.js'

// ── Utilidades de prueba ──────────────────────────────────────

const parsear = (xml) => new DOMParser({ onError: (n, m) => { if (n !== 'warning') throw new Error(m) } }).parseFromString(xml, 'text/xml')
const nodos = (xml, ruta) => xpath.select(ruta, parsear(xml))
const texto = (xml, ruta) => xpath.select(`string(${ruta})`, parsear(xml))
const hijos = (xml, ruta) => nodos(xml, ruta)[0].childNodes ? Array.from(nodos(xml, ruta)[0].childNodes).filter((n) => n.nodeType === 1).map((n) => n.nodeName) : []
const existe = (xml, ruta) => nodos(xml, ruta).length > 0

const item = (extra = {}) => ({ nombre: 'Impresión de lona', cantidad: 2, precioUnitario: 500, monto: 1000, esServicio: true, ...extra })

const base31 = (extra = {}) => ({
  tipo: 31,
  encf: 'E310000000001',
  fechaVencimientoSecuencia: '2030-12-31',
  fechaEmision: '2026-09-27',
  fechaHoraFirma: '27-09-2026 10:15:30',
  emisor: { rnc: '131000001', razonSocial: 'Publicidad Alfa SRL', direccion: 'Calle Duarte 10, Santo Domingo', correo: 'info@alfa.do' },
  comprador: { rnc: '101000002', razonSocial: 'Cliente Beta SRL', direccion: 'Av. Lincoln 5' },
  tasaItbis: 18,
  items: [item()],
  ...extra,
})

const base32 = (extra = {}) => ({
  ...base31(), tipo: 32, encf: 'E320000000001', fechaVencimientoSecuencia: undefined, comprador: {}, ...extra,
})

const base34 = (extra = {}) => ({
  ...base31(), tipo: 34, encf: 'E340000000001', fechaVencimientoSecuencia: undefined, indicadorNotaCredito: 0,
  referencia: { ncfModificado: 'E310000000001', fechaNcfModificado: '2026-09-20', codigoModificacion: 1 }, ...extra,
})

const falla = (doc, motivo) => assert.throws(() => construirXml(doc), (e) => e instanceof ErrorDeEcf && motivo.test(e.message), String(motivo))

// ── Estructura general ────────────────────────────────────────

test('el XML es un documento bien formado, con declaración UTF-8 y raíz ECF', () => {
  const xml = construirXml(base31())
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<ECF>/)
  assert.equal(parsear(xml).documentElement.nodeName, 'ECF')
})

test('las secciones van en el orden del formato: Encabezado, DetallesItems y FechaHoraFirma', () => {
  const xml = construirXml(base31())
  assert.deepEqual(hijos(xml, '/ECF'), ['Encabezado', 'DetallesItems', 'FechaHoraFirma'])
  assert.deepEqual(hijos(xml, '/ECF/Encabezado'), ['Version', 'IdDoc', 'Emisor', 'Comprador', 'Totales'])
  assert.equal(texto(xml, '/ECF/Encabezado/Version'), '1.0')
  assert.equal(texto(xml, '/ECF/FechaHoraFirma'), '27-09-2026 10:15:30')
})

test('construir el mismo documento dos veces da exactamente el mismo XML', () => {
  assert.equal(construirXml(base31()), construirXml(base31()))
})

// ── e-CF 31: crédito fiscal ───────────────────────────────────

test('31: identificación del documento con e-NCF, vencimiento de la secuencia y fechas dd-MM-AAAA', () => {
  const xml = construirXml(base31())
  assert.deepEqual(hijos(xml, '/ECF/Encabezado/IdDoc'),
    ['TipoeCF', 'eNCF', 'FechaVencimientoSecuencia', 'IndicadorMontoGravado', 'TipoIngresos', 'TipoPago'])
  assert.equal(texto(xml, '//IdDoc/TipoeCF'), '31')
  assert.equal(texto(xml, '//IdDoc/eNCF'), 'E310000000001')
  assert.equal(texto(xml, '//IdDoc/FechaVencimientoSecuencia'), '31-12-2030')
  assert.equal(texto(xml, '//IdDoc/IndicadorMontoGravado'), '0')
  assert.equal(texto(xml, '//IdDoc/TipoIngresos'), '01')
  assert.equal(texto(xml, '//IdDoc/TipoPago'), '1')
})

test('31: emisor y comprador con sus datos y la fecha de emisión', () => {
  const xml = construirXml(base31({ numeroFacturaInterna: 'F000123' }))
  assert.deepEqual(hijos(xml, '//Emisor'),
    ['RNCEmisor', 'RazonSocialEmisor', 'DireccionEmisor', 'CorreoEmisor', 'NumeroFacturaInterna', 'FechaEmision'])
  assert.equal(texto(xml, '//Emisor/RNCEmisor'), '131000001')
  assert.equal(texto(xml, '//Emisor/RazonSocialEmisor'), 'Publicidad Alfa SRL')
  assert.equal(texto(xml, '//Emisor/NumeroFacturaInterna'), 'F000123')
  assert.equal(texto(xml, '//Emisor/FechaEmision'), '27-09-2026')
  assert.deepEqual(hijos(xml, '//Comprador'), ['RNCComprador', 'RazonSocialComprador', 'DireccionComprador'])
  assert.equal(texto(xml, '//Comprador/RNCComprador'), '101000002')
})

test('el RNC se limpia de guiones y espacios', () => {
  const xml = construirXml(base31({ emisor: { ...base31().emisor, rnc: '1-31-00000-1' }, comprador: { rnc: '101 000 002', razonSocial: 'X' } }))
  assert.equal(texto(xml, '//RNCEmisor'), '131000001')
  assert.equal(texto(xml, '//RNCComprador'), '101000002')
})

test('las fechas se aceptan como texto AAAA-MM-DD o como Date', () => {
  const xml = construirXml(base31({ fechaEmision: new Date(2026, 8, 5), fechaVencimientoSecuencia: new Date(2031, 0, 9) }))
  assert.equal(texto(xml, '//FechaEmision'), '05-09-2026')
  assert.equal(texto(xml, '//FechaVencimientoSecuencia'), '09-01-2031')
})

test('31: pago a crédito lleva la fecha límite de pago', () => {
  const xml = construirXml(base31({ tipoPago: 2, fechaLimitePago: '2026-10-27' }))
  assert.equal(texto(xml, '//IdDoc/TipoPago'), '2')
  assert.equal(texto(xml, '//IdDoc/FechaLimitePago'), '27-10-2026')
})

// ── Totales e ITBIS ───────────────────────────────────────────

test('ITBIS 18 %: gravado a tasa 1, ITBIS redondeado y total', () => {
  const xml = construirXml(base31({ items: [item({ monto: 1000 }), item({ monto: 500.5, cantidad: 1, precioUnitario: 500.5 })] }))
  assert.deepEqual(hijos(xml, '//Totales'),
    ['MontoGravadoTotal', 'MontoGravadoI1', 'ITBIS1', 'TotalITBIS', 'TotalITBIS1', 'MontoTotal'])
  assert.equal(texto(xml, '//Totales/MontoGravadoTotal'), '1500.50')
  assert.equal(texto(xml, '//Totales/MontoGravadoI1'), '1500.50')
  assert.equal(texto(xml, '//Totales/ITBIS1'), '18')
  assert.equal(texto(xml, '//Totales/TotalITBIS'), '270.09')
  assert.equal(texto(xml, '//Totales/TotalITBIS1'), '270.09')
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1770.59')
})

test('ITBIS 16 %: gravado a tasa 2', () => {
  const xml = construirXml(base31({ tasaItbis: 16 }))
  assert.deepEqual(hijos(xml, '//Totales'), ['MontoGravadoTotal', 'MontoGravadoI2', 'ITBIS2', 'TotalITBIS', 'TotalITBIS2', 'MontoTotal'])
  assert.equal(texto(xml, '//Totales/TotalITBIS2'), '160.00')
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1160.00')
  assert.equal(texto(xml, '//Item/IndicadorFacturacion'), '2')
})

test('ITBIS 0 %: gravado a tasa 3, sin impuesto', () => {
  const xml = construirXml(base31({ tasaItbis: 0 }))
  assert.deepEqual(hijos(xml, '//Totales'), ['MontoGravadoTotal', 'MontoGravadoI3', 'ITBIS3', 'TotalITBIS', 'TotalITBIS3', 'MontoTotal'])
  assert.equal(texto(xml, '//Totales/TotalITBIS'), '0.00')
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1000.00')
  assert.equal(texto(xml, '//Item/IndicadorFacturacion'), '3')
})

test('el redondeo del ITBIS es al centavo', () => {
  const xml = construirXml(base31({ items: [item({ monto: 0.05, cantidad: 1, precioUnitario: 0.05 })] }))
  assert.equal(texto(xml, '//Totales/TotalITBIS'), '0.01')
  assert.equal(texto(xml, '//Totales/MontoTotal'), '0.06')
})

// ── Ítems ─────────────────────────────────────────────────────

test('cada ítem lleva su número de línea, indicadores, cantidad, precio y monto', () => {
  const xml = construirXml(base31({ items: [
    item({ nombre: 'Lona', esServicio: false, cantidad: 3, precioUnitario: 250, monto: 750 }),
    item({ nombre: 'Instalación', esServicio: true, cantidad: 1, precioUnitario: 250, monto: 250 }),
  ] }))
  assert.equal(nodos(xml, '//DetallesItems/Item').length, 2)
  assert.deepEqual(hijos(xml, '//Item[1]'),
    ['NumeroLinea', 'IndicadorFacturacion', 'NombreItem', 'IndicadorBienoServicio', 'CantidadItem', 'PrecioUnitarioItem', 'MontoItem'])
  assert.equal(texto(xml, '//Item[1]/NumeroLinea'), '1')
  assert.equal(texto(xml, '//Item[2]/NumeroLinea'), '2')
  assert.equal(texto(xml, '//Item[1]/IndicadorBienoServicio'), '1')
  assert.equal(texto(xml, '//Item[2]/IndicadorBienoServicio'), '2')
  assert.equal(texto(xml, '//Item[1]/CantidadItem'), '3.00')
  assert.equal(texto(xml, '//Item[1]/PrecioUnitarioItem'), '250.00')
  assert.equal(texto(xml, '//Item[1]/MontoItem'), '750.00')
})

test('un precio con más de 2 decimales conserva hasta 4', () => {
  const xml = construirXml(base31({ items: [item({ cantidad: 3, precioUnitario: 33.3333, monto: 100 })] }))
  assert.equal(texto(xml, '//Item/PrecioUnitarioItem'), '33.3333')
})

test('un nombre de más de 80 caracteres se recorta y el texto completo pasa a la descripción', () => {
  const largo = 'Impresión en lona de alta resolución para valla publicitaria de gran formato con ojetes reforzados'
  const xml = construirXml(base31({ items: [item({ nombre: largo })] }))
  assert.equal(texto(xml, '//Item/NombreItem').length, 80)
  assert.equal(texto(xml, '//Item/DescripcionItem'), largo)
  assert.deepEqual(hijos(xml, '//Item'),
    ['NumeroLinea', 'IndicadorFacturacion', 'NombreItem', 'IndicadorBienoServicio', 'DescripcionItem', 'CantidadItem', 'PrecioUnitarioItem', 'MontoItem'])
})

test('una descripción adicional del ítem se incluye tras el indicador de bien o servicio', () => {
  const xml = construirXml(base31({ items: [item({ descripcion: '2 x 1.5 m' })] }))
  assert.equal(texto(xml, '//Item/DescripcionItem'), '2 x 1.5 m')
})

test('el máximo es de 100 ítems por comprobante', () => {
  const cien = Array.from({ length: 100 }, () => item({ monto: 1, cantidad: 1, precioUnitario: 1 }))
  assert.equal(nodos(construirXml(base31({ items: cien })), '//Item').length, 100)
  falla(base31({ items: [...cien, item()] }), /100 ítems/)
})

// ── Retenciones ───────────────────────────────────────────────

test('31 con retenciones: totales retenidos y reparto por línea que suma exactamente el total', () => {
  const items = [item({ monto: 333.33, cantidad: 1, precioUnitario: 333.33 }), item({ monto: 333.33, cantidad: 1, precioUnitario: 333.33 }), item({ monto: 333.34, cantidad: 1, precioUnitario: 333.34 })]
  const xml = construirXml(base31({ items, retenciones: { itbis: 180, isr: 100 } }))
  assert.deepEqual(hijos(xml, '//Totales'),
    ['MontoGravadoTotal', 'MontoGravadoI1', 'ITBIS1', 'TotalITBIS', 'TotalITBIS1', 'MontoTotal', 'TotalITBISRetenido', 'TotalISRRetencion'])
  assert.equal(texto(xml, '//Totales/TotalITBISRetenido'), '180.00')
  assert.equal(texto(xml, '//Totales/TotalISRRetencion'), '100.00')
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1180.00', 'el total no descuenta las retenciones')

  const sumar = (ruta) => Math.round(nodos(xml, ruta).reduce((s, n) => s + Number(n.textContent), 0) * 100) / 100
  assert.equal(sumar('//Item/Retencion/MontoITBISRetenido'), 180)
  assert.equal(sumar('//Item/Retencion/MontoISRRetenido'), 100)
  assert.deepEqual(hijos(xml, '//Item[1]'),
    ['NumeroLinea', 'IndicadorFacturacion', 'Retencion', 'NombreItem', 'IndicadorBienoServicio', 'CantidadItem', 'PrecioUnitarioItem', 'MontoItem'])
  assert.deepEqual(hijos(xml, '//Item[1]/Retencion'), ['IndicadorAgenteRetencionoPercepcion', 'MontoITBISRetenido', 'MontoISRRetenido'])
  assert.equal(texto(xml, '//Item[1]/Retencion/IndicadorAgenteRetencionoPercepcion'), '1')
})

test('solo se informa la retención que existe', () => {
  const xml = construirXml(base31({ retenciones: { itbis: 0, isr: 100 } }))
  assert.ok(!existe(xml, '//TotalITBISRetenido'))
  assert.equal(texto(xml, '//TotalISRRetencion'), '100.00')
  assert.ok(!existe(xml, '//Item/Retencion/MontoITBISRetenido'))
})

test('sin retenciones el XML no trae ninguna etiqueta de retención', () => {
  const xml = construirXml(base31({ retenciones: { itbis: 0, isr: 0 } }))
  assert.ok(!/Retenc|Retenido/.test(xml.replace('IndicadorNotaCredito', '')))
})

test('32: el formato no admite retenciones en consumo', () => {
  falla(base32({ retenciones: { itbis: 10, isr: 0 } }), /retenci/i)
})

// ── e-CF 32: consumo ──────────────────────────────────────────

test('32: sin vencimiento de secuencia y con el comprador vacío si no dio su RNC', () => {
  const xml = construirXml(base32())
  assert.equal(texto(xml, '//IdDoc/TipoeCF'), '32')
  assert.ok(!existe(xml, '//FechaVencimientoSecuencia'))
  assert.equal(hijos(xml, '//Comprador').length, 0)
})

test('32: con nombre y RNC del comprador los incluye', () => {
  const xml = construirXml(base32({ comprador: { rnc: '40212345678', razonSocial: 'Ana Pérez' } }))
  assert.equal(texto(xml, '//Comprador/RNCComprador'), '40212345678')
  assert.equal(texto(xml, '//Comprador/RazonSocialComprador'), 'Ana Pérez')
})

test('32: desde RD$ 250,000 el RNC del comprador es obligatorio; por debajo no', () => {
  const grande = (monto) => base32({ items: [item({ monto, cantidad: 1, precioUnitario: monto })], tasaItbis: 0 })
  falla(grande(250000), /250,000/)
  assert.doesNotThrow(() => construirXml(grande(249999.99)))
  assert.doesNotThrow(() => construirXml({ ...grande(250000), comprador: { rnc: '101000002', razonSocial: 'Empresa Grande' } }))
})

test('32: el límite se mide sobre el total con ITBIS', () => {
  const doc = base32({ items: [item({ monto: 215000, cantidad: 1, precioUnitario: 215000 })] })   // 215,000 + 18 % = 253,700
  falla(doc, /250,000/)
})

// ── e-CF 34: nota de crédito ──────────────────────────────────

test('34: indicador de nota de crédito e información de referencia antes de la firma', () => {
  const xml = construirXml(base34())
  assert.deepEqual(hijos(xml, '/ECF'), ['Encabezado', 'DetallesItems', 'InformacionReferencia', 'FechaHoraFirma'])
  assert.equal(texto(xml, '//IdDoc/IndicadorNotaCredito'), '0')
  assert.ok(!existe(xml, '//FechaVencimientoSecuencia'))
  assert.deepEqual(hijos(xml, '//InformacionReferencia'), ['NCFModificado', 'FechaNCFModificado', 'CodigoModificacion'])
  assert.equal(texto(xml, '//InformacionReferencia/NCFModificado'), 'E310000000001')
  assert.equal(texto(xml, '//InformacionReferencia/FechaNCFModificado'), '20-09-2026')
  assert.equal(texto(xml, '//InformacionReferencia/CodigoModificacion'), '1')
})

test('34: el indicador es 1 cuando la nota se emite pasados 30 días del original', () => {
  assert.equal(texto(construirXml(base34({ indicadorNotaCredito: 1 })), '//IdDoc/IndicadorNotaCredito'), '1')
})

test('34: en IdDoc el indicador va antes de IndicadorMontoGravado', () => {
  assert.deepEqual(hijos(construirXml(base34()), '//IdDoc'),
    ['TipoeCF', 'eNCF', 'IndicadorNotaCredito', 'IndicadorMontoGravado', 'TipoIngresos', 'TipoPago'])
})

test('34: la razón de la modificación se incluye si se indica', () => {
  const xml = construirXml(base34({ referencia: { ncfModificado: 'E310000000001', fechaNcfModificado: '2026-09-20', codigoModificacion: 1, razonModificacion: 'Devolución total' } }))
  assert.equal(texto(xml, '//InformacionReferencia/RazonModificacion'), 'Devolución total')
})

test('34 exige referencia completa; 31 y 32 no la admiten', () => {
  falla(base34({ referencia: undefined }), /referencia/i)
  falla(base34({ referencia: { ncfModificado: 'E310000000001' } }), /referencia/i)
  falla(base34({ indicadorNotaCredito: undefined }), /indicador/i)
  falla(base31({ referencia: { ncfModificado: 'E310000000001', fechaNcfModificado: '2026-09-20', codigoModificacion: 1 } }), /referencia/i)
})

test('34 con retenciones: se informan, porque la nota repite las del original', () => {
  const xml = construirXml(base34({ retenciones: { itbis: 180, isr: 100 } }))
  assert.equal(texto(xml, '//TotalITBISRetenido'), '180.00')
})

// ── Rechazos ──────────────────────────────────────────────────

test('31: el comprador necesita RNC y razón social', () => {
  falla(base31({ comprador: { razonSocial: 'Sin RNC' } }), /RNC del comprador/i)
  falla(base31({ comprador: { rnc: '101000002' } }), /nombre.*comprador|razón social/i)
  falla(base31({ comprador: undefined }), /comprador/i)
})

test('los RNC deben tener 9 u 11 dígitos', () => {
  falla(base31({ comprador: { rnc: '12345', razonSocial: 'X' } }), /RNC del comprador/i)
  falla(base31({ emisor: { ...base31().emisor, rnc: '12ab' } }), /RNC del emisor/i)
})

test('solo se admiten las tasas de ITBIS de 18, 16 y 0 %', () => {
  falla(base31({ tasaItbis: 10 }), /18%, 16% o 0%/)
  falla(base31({ tasaItbis: undefined }), /tasa de ITBIS/i)
})

test('el emisor necesita razón social y dirección', () => {
  falla(base31({ emisor: { rnc: '131000001', razonSocial: 'X' } }), /dirección del emisor/i)
  falla(base31({ emisor: { rnc: '131000001', direccion: 'Calle' } }), /razón social del emisor/i)
})

test('el e-NCF debe coincidir con el tipo y tener 10 dígitos', () => {
  falla(base31({ encf: 'E320000000001' }), /e-NCF/)
  falla(base31({ encf: 'E31000001' }), /e-NCF/)
  falla(base31({ encf: 'B0100000001' }), /e-NCF/)
})

test('solo se construyen los tipos 31, 32 y 34', () => {
  falla(base31({ tipo: 33 }), /31, 32 y 34/)
  falla(base31({ tipo: 41 }), /31, 32 y 34/)
})

test('31 exige la fecha de vencimiento de la secuencia', () => {
  falla(base31({ fechaVencimientoSecuencia: undefined }), /vencimiento de la secuencia/i)
})

test('los ítems deben ser válidos', () => {
  falla(base31({ items: [] }), /al menos un/i)
  falla(base31({ items: [item({ cantidad: 0 })] }), /cantidad/i)
  falla(base31({ items: [item({ monto: -5 })] }), /monto/i)
  falla(base31({ items: [item({ nombre: '  ' })] }), /nombre/i)
})

test('las fechas inválidas se rechazan', () => {
  falla(base31({ fechaEmision: 'ayer' }), /fecha de emisión/i)
  falla(base31({ fechaHoraFirma: undefined }), /firma/i)
})

// ── Caracteres especiales ─────────────────────────────────────

test('los caracteres especiales del texto se escapan y los acentos se conservan', () => {
  const xml = construirXml(base31({
    emisor: { ...base31().emisor, razonSocial: 'Ferretería Pérez & Hijos "El Éxito" <SRL>' },
    items: [item({ nombre: "Lona 2' x 3\" > básica" })],
  }))
  assert.match(xml, /Ferretería Pérez &amp; Hijos &quot;El Éxito&quot; &lt;SRL&gt;/)
  assert.equal(texto(xml, '//RazonSocialEmisor'), 'Ferretería Pérez & Hijos "El Éxito" <SRL>')
  assert.equal(texto(xml, '//Item/NombreItem'), "Lona 2' x 3\" > básica")
})

test('los caracteres de control no válidos en XML se eliminan', () => {
  const xml = construirXml(base31({ items: [item({ nombre: 'Lona\u0000 \u0008negra\u001f' })] }))
  assert.equal(texto(xml, '//Item/NombreItem'), 'Lona negra')
})

// ── Con la firma ──────────────────────────────────────────────

test('el XML construido se firma y la firma se verifica; alterarlo la invalida', () => {
  const cert = crearCertificadoDePrueba()
  const firmado = firmarXml(construirXml(base31()), { clavePem: cert.clavePem, certificadoPem: cert.certificadoPem })
  assert.ok(firmado.endsWith('</Signature></ECF>'))
  assert.equal(verificarFirma(firmado).valida, true)
  assert.equal(verificarFirma(firmado.replace('<MontoTotal>1180.00', '<MontoTotal>1.00')).valida, false)
})

// ── fechaHoraRD ───────────────────────────────────────────────

test('fechaHoraRD da la fecha y hora de la República Dominicana (UTC-4) como dd-MM-AAAA HH:mm:ss', () => {
  assert.equal(fechaHoraRD(new Date('2026-09-27T14:15:30Z')), '27-09-2026 10:15:30')
  assert.equal(fechaHoraRD(new Date('2026-01-01T02:00:00Z')), '31-12-2025 22:00:00')
})
