// DÓNDE VA: backend/tests/contabilidad/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campos608, generar608 } from '../../services/contabilidad/formato608.js'

test('campos608 usa el código 05 (errores de facturación) cuando no hay motivo guardado', () => {
  const c = campos608({ nfc_numero: 'B0100000020', fecha: '2026-09-06', estado: 'anulada' })
  assert.deepEqual(c, ['B0100000020', '20260906', '05'])
})

test('campos608 respeta un motivo_anulacion explícito si existe', () => {
  const c = campos608({ nfc_numero: 'B0100000020', fecha: '2026-09-06', motivo_anulacion: '02' })
  assert.equal(c[2], '02')
})

test('generar608 incluye solo las facturas anuladas', () => {
  const facturas = [
    { nfc_numero: 'B01', fecha: '2026-09-01', estado: 'emitida' },
    { nfc_numero: 'B02', fecha: '2026-09-02', estado: 'anulada' },
  ]
  const archivo = generar608({ rncEmpresa: '101-00000-1', periodo: '202609', facturas })
  const lineas = archivo.trim().split('\r\n')
  assert.equal(lineas.length, 2) // encabezado + 1 anulada
  assert.equal(lineas[0], '608|101000001|202609|1')
})
