// DÓNDE VA: backend/tests/contabilidad/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campos609, generar609 } from '../../services/contabilidad/formato609.js'

const pagoExterior = {
  proveedor_rnc: '', proveedor_nombre: 'Consultora Extranjera LLC', pais_beneficiario: 'US', tipo_renta_exterior: '01',
  fecha_pago: '2026-09-15', fecha_comprobante: '2026-09-10', monto_servicios: 1500, monto_bienes: 0,
  monto_retencion_renta: 142.5, estado: 'registrado', es_pago_exterior: true,
}

test('campos609 arma los 9 campos con el monto pagado y el ISR retenido', () => {
  const c = campos609(pagoExterior)
  assert.equal(c.length, 9)
  assert.equal(c[1], 'Consultora Extranjera LLC')
  assert.equal(c[2], 'US')
  assert.equal(c[5], '1500.00')
  assert.equal(c[6], '142.50')
})

test('generar609 incluye solo los gastos marcados como pago al exterior', () => {
  const gastoLocal = { ...pagoExterior, es_pago_exterior: false }
  const archivo = generar609({ rncEmpresa: '101-00000-1', periodo: '202609', gastos: [pagoExterior, gastoLocal] })
  const lineas = archivo.trim().split('\r\n')
  assert.equal(lineas.length, 2) // encabezado + 1
  assert.equal(lineas[0], '609|101000001|202609|1')
})

test('generar609 excluye los pagos al exterior anulados', () => {
  const archivo = generar609({ rncEmpresa: '101-00000-1', periodo: '202609', gastos: [{ ...pagoExterior, estado: 'anulado' }] })
  assert.equal(archivo.trim().split('\r\n').length, 1) // solo el encabezado, 0 registros
})
