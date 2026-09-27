import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sumarDias, sumarMeses, fechaMayor } from '../../services/suscripcion/fechas.js'

test('sumarDias avanza y retrocede días de calendario, cruzando meses y años', () => {
  assert.equal(sumarDias('2026-09-27', 5), '2026-10-02')
  assert.equal(sumarDias('2026-12-30', 3), '2027-01-02')
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28')
  assert.equal(sumarDias('2028-02-28', 1), '2028-02-29')
})

test('sumarMeses conserva el día del mes', () => {
  assert.equal(sumarMeses('2026-09-15', 1), '2026-10-15')
  assert.equal(sumarMeses('2026-12-15', 1), '2027-01-15')
  assert.equal(sumarMeses('2026-09-15', 12), '2027-09-15')
})

test('sumarMeses se ajusta al último día cuando el mes siguiente es más corto', () => {
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28')
  assert.equal(sumarMeses('2028-01-31', 1), '2028-02-29')   // año bisiesto
  assert.equal(sumarMeses('2026-03-31', 1), '2026-04-30')
  assert.equal(sumarMeses('2026-08-31', 1), '2026-09-30')
})

test('fechaMayor devuelve la posterior de dos fechas (y tolera valores vacíos)', () => {
  assert.equal(fechaMayor('2026-09-27', '2026-10-01'), '2026-10-01')
  assert.equal(fechaMayor('2026-10-01', '2026-09-27'), '2026-10-01')
  assert.equal(fechaMayor('2026-09-27', null), '2026-09-27')
  assert.equal(fechaMayor(null, '2026-09-27'), '2026-09-27')
})
