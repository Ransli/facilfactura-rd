// DÓNDE VA: backend/tests/contabilidad/
// Pruebas unitarias puras: no necesitan base de datos.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  soloDigitos, tipoIdentificacion, fechaAAAAMMDD, monto, periodoValido, rangoDelPeriodo,
  linea, encabezado, armarArchivo,
} from '../../services/contabilidad/formatoDGII.js'

test('soloDigitos deja únicamente los números', () => {
  assert.equal(soloDigitos('130-88170-7'), '130881707')
  assert.equal(soloDigitos(null), '')
})

test('tipoIdentificacion distingue RNC de cédula', () => {
  assert.equal(tipoIdentificacion('130-88170-7'), '1')
  assert.equal(tipoIdentificacion('001-1234567-8'), '2')
  assert.equal(tipoIdentificacion('12345'), '')
})

test('fechaAAAAMMDD acepta Date y texto', () => {
  assert.equal(fechaAAAAMMDD('2026-09-05'), '20260905')
  assert.equal(fechaAAAAMMDD(new Date('2026-09-05T12:00:00Z')), '20260905')
  assert.equal(fechaAAAAMMDD(null), '')
})

test('monto usa dos decimales y trata vacío como cero', () => {
  assert.equal(monto(1234.5), '1234.50')
  assert.equal(monto(''), '0.00')
  assert.equal(monto(undefined), '0.00')
})

test('periodoValido exige AAAAMM con mes de 01 a 12', () => {
  assert.equal(periodoValido('202609'), true)
  assert.equal(periodoValido('202613'), false)
  assert.equal(periodoValido('2026-09'), false)
})

test('rangoDelPeriodo cubre el mes completo, incluido febrero bisiesto', () => {
  assert.deepEqual(rangoDelPeriodo('202609'), { desde: '2026-09-01', hasta: '2026-09-30' })
  assert.deepEqual(rangoDelPeriodo('202402'), { desde: '2024-02-01', hasta: '2024-02-29' })
  assert.throws(() => rangoDelPeriodo('202600'))
})

test('encabezado y archivo: cantidad de registros y separador de línea', () => {
  assert.equal(encabezado('606', '131-00000-1', '202609', 2), '606|131000001|202609|2')
  assert.equal(linea(['a', null, 'c']), 'a||c')
  const archivo = armarArchivo('607', '131000001', '202609', ['x|1', 'y|2'])
  assert.equal(archivo, '607|131000001|202609|2\r\nx|1\r\ny|2\r\n')
})
