// DÓNDE VA: backend/tests/contabilidad/
// Pruebas unitarias puras (sin base de datos).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campos606, generar606 } from '../../services/contabilidad/formato606.js'

const gastoBase = {
  proveedor_rnc: '130-88170-7', proveedor_nombre: 'Proveedor Ejemplo SRL', categoria_606_codigo: '02',
  ncf: 'B0100000045', ncf_modificado: null, fecha_comprobante: '2026-09-05', fecha_pago: '2026-09-10',
  monto_servicios: 1000, monto_bienes: 0, itbis_facturado: 180, itbis_retenido: 54,
  itbis_llevado_al_costo: 0, itbis_por_adelantar: 126, monto_retencion_renta: 100, propina_legal: 0,
  forma_pago: 1, estado: 'registrado', es_pago_exterior: false,
}

test('campos606 arma los 23 campos con el total calculado y el RNC limpio', () => {
  const c = campos606(gastoBase)
  assert.equal(c.length, 23)
  assert.equal(c[0], '130881707')           // RNC sin guiones
  assert.equal(c[1], '1')                   // tipo de identificación: RNC
  assert.equal(c[9], '1000.00')             // total facturado = servicios + bienes
  assert.equal(c[10], '180.00')             // ITBIS facturado
})

test('generar606 produce el encabezado con la cantidad de registros y una línea por gasto', () => {
  const archivo = generar606({ rncEmpresa: '101-00000-1', periodo: '202609', gastos: [gastoBase] })
  const lineas = archivo.trim().split('\r\n')
  assert.equal(lineas.length, 2)
  assert.equal(lineas[0], '606|101000001|202609|1')
})

test('generar606 excluye los gastos anulados', () => {
  const archivo = generar606({ rncEmpresa: '101-00000-1', periodo: '202609', gastos: [gastoBase, { ...gastoBase, estado: 'anulado' }] })
  assert.equal(archivo.trim().split('\r\n').length, 2) // encabezado + 1 (no 2)
})

test('generar606 excluye los pagos al exterior (van en el 609)', () => {
  const archivo = generar606({ rncEmpresa: '101-00000-1', periodo: '202609', gastos: [gastoBase, { ...gastoBase, es_pago_exterior: true }] })
  assert.equal(archivo.trim().split('\r\n').length, 2)
})
