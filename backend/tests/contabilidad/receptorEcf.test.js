// DÓNDE VA: backend/tests/contabilidad/
// Prueba unitaria pura (sin base de datos) del lector de XML.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerEcfRecibido, XmlEcfInvalido } from '../../services/contabilidad/receptorEcf.js'

const XML_VALIDO = `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <IdDoc><TipoeCF>32</TipoeCF><eNCF>E320000000045</eNCF></IdDoc>
    <Emisor>
      <RNCEmisor>130881707</RNCEmisor>
      <RazonSocialEmisor>Proveedor Ejemplo SRL</RazonSocialEmisor>
      <FechaEmision>05-09-2026</FechaEmision>
    </Emisor>
    <Totales><MontoTotal>1180.00</MontoTotal><TotalITBIS>180.00</TotalITBIS></Totales>
  </Encabezado>
  <CodigoSeguridad>AB12CD</CodigoSeguridad>
</ECF>`

test('leerEcfRecibido extrae eNCF, emisor, fecha y montos', () => {
  const d = leerEcfRecibido(XML_VALIDO)
  assert.equal(d.encf, 'E320000000045')
  assert.equal(d.tipo_ecf, 32)
  assert.equal(d.rnc_emisor, '130881707')
  assert.equal(d.razon_social_emisor, 'Proveedor Ejemplo SRL')
  assert.equal(d.fecha_emision, '2026-09-05')
  assert.equal(d.monto_total, 1180)
  assert.equal(d.total_itbis, 180)
  assert.equal(d.codigo_seguridad, 'AB12CD')
})

test('rechaza un XML vacío', () => {
  assert.throws(() => leerEcfRecibido(''), XmlEcfInvalido)
})

test('rechaza un XML sin eNCF o RNCEmisor: no es un e-CF', () => {
  assert.throws(() => leerEcfRecibido('<ECF><Encabezado></Encabezado></ECF>'), XmlEcfInvalido)
})

test('rechaza un XML mal formado', () => {
  assert.throws(() => leerEcfRecibido('<ECF><Encabezado>'), XmlEcfInvalido)
})
