// DÓNDE VA: backend/tests/contabilidad/
// Pruebas unitarias puras (sin base de datos). Caso del plan: 3 facturas (una anulada, una de consumo).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campos607, generar607 } from '../../services/contabilidad/formato607.js'

const facturaEmitida = {
  cliente_rnc: '131-00000-2', nfc_numero: 'B0100000012', fecha: '2026-09-03',
  subtotal: 2000, itbis: 360, ret_itbis: 0, ret_isr: 0, total: 2360, estado: 'emitida',
}
const facturaConsumo = {
  cliente_rnc: '001-1234567-8', nfc_numero: 'B0200000001', fecha: '2026-09-04',
  subtotal: 500, itbis: 90, ret_itbis: 0, ret_isr: 0, total: 590, estado: 'emitida',
}
const facturaAnulada = {
  cliente_rnc: '131-00000-2', nfc_numero: 'B0100000013', fecha: '2026-09-05',
  subtotal: 1000, itbis: 180, ret_itbis: 0, ret_isr: 0, total: 1180, estado: 'anulada',
}

test('campos607 arma los 23 campos con tipo de ingreso 01 por defecto', () => {
  const c = campos607(facturaEmitida)
  assert.equal(c.length, 23)
  assert.equal(c[4], '01')
  assert.equal(c[7], '2000.00')
})

test('generar607 incluye solo las facturas emitidas, nunca las anuladas', () => {
  const archivo = generar607({ rncEmpresa: '101-00000-1', periodo: '202609', facturas: [facturaEmitida, facturaConsumo, facturaAnulada] })
  const lineas = archivo.trim().split('\r\n')
  assert.equal(lineas[0], '607|101000001|202609|2')
  assert.equal(lineas.length, 3) // encabezado + 2 facturas vigentes
})

test('una factura de consumo con cédula usa tipo de identificación 2', () => {
  const c = campos607(facturaConsumo)
  assert.equal(c[1], '2')
})
