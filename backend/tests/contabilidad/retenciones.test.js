// DÓNDE VA: backend/tests/contabilidad/
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'

let t, A, B, adminA, adminB, categoriaId, gastoA

before(async () => {
  t = await iniciar()
  const [[cat]] = await t.pool.query("SELECT id FROM categorias_606 WHERE codigo = '02'")
  categoriaId = cat.id
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token

  const creado = await t.api('POST', '/contabilidad/gastos', {
    token: adminA,
    body: {
      proveedor_rnc: '130-88170-7', proveedor_nombre: 'Proveedor de Alfa', categoria_606_id: categoriaId,
      ncf: 'B0100000070', fecha_comprobante: '2026-09-05', monto_servicios: 1000, monto_bienes: 0, itbis_facturado: 180,
    },
  })
  gastoA = creado.data.data
})
after(async () => { await t.cerrar() })

test('una retención de ITBIS se calcula sobre el ITBIS facturado y se suma al gasto', async () => {
  const r = await t.api('POST', '/contabilidad/retenciones', { token: adminA, body: { gasto_id: gastoA.id, tipo: 'itbis', porcentaje: 30 } })
  assert.equal(r.status, 201)
  assert.equal(Number(r.data.data.monto), 54) // 180 * 0.30

  const [[fila]] = await t.pool.query('SELECT itbis_retenido FROM gastos WHERE id = ?', [gastoA.id])
  assert.equal(Number(fila.itbis_retenido), 54)
})

test('una retención de ISR se calcula sobre el total del gasto (servicios + bienes)', async () => {
  const r = await t.api('POST', '/contabilidad/retenciones', { token: adminA, body: { gasto_id: gastoA.id, tipo: 'isr', porcentaje: 10 } })
  assert.equal(r.status, 201)
  assert.equal(Number(r.data.data.monto), 100) // 1000 * 0.10
})

test('rechaza un porcentaje fuera de 0-100', async () => {
  const r = await t.api('POST', '/contabilidad/retenciones', { token: adminA, body: { gasto_id: gastoA.id, tipo: 'itbis', porcentaje: 150 } })
  assert.equal(r.status, 400)
})

test('eliminar una retención la revierte del gasto', async () => {
  const creada = await t.api('POST', '/contabilidad/retenciones', { token: adminA, body: { gasto_id: gastoA.id, tipo: 'itbis', porcentaje: 5 } })
  const [[antes]] = await t.pool.query('SELECT itbis_retenido FROM gastos WHERE id = ?', [gastoA.id])

  const r = await t.api('DELETE', `/contabilidad/retenciones/${creada.data.data.id}`, { token: adminA })
  assert.equal(r.status, 200)

  const [[despues]] = await t.pool.query('SELECT itbis_retenido FROM gastos WHERE id = ?', [gastoA.id])
  assert.equal(Number(despues.itbis_retenido), Number(antes.itbis_retenido) - 9) // 180 * 0.05 = 9
})

test('AISLAMIENTO: la empresa B recibe 404 al retener sobre un gasto de la empresa A', async () => {
  const r = await t.api('POST', '/contabilidad/retenciones', { token: adminB, body: { gasto_id: gastoA.id, tipo: 'itbis', porcentaje: 10 } })
  assert.equal(r.status, 404)
})

test('AISLAMIENTO: la empresa B no ve las retenciones de la empresa A', async () => {
  const r = await t.api('GET', `/contabilidad/retenciones?gasto_id=${gastoA.id}`, { token: adminB })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.length, 0)
})
