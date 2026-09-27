import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'
import { prepararNegocio } from './helpers/negocio.js'

let t, n, facturador
before(async () => {
  t = await iniciar()
  n = await prepararNegocio(t)
  facturador = (await t.sesion('facturador')).token
})
after(async () => { await t.cerrar() })

const registrarB16 = (hasta) => t.api('POST', '/nfc', { token: n.admin, body: { tipo_ncf: 'B16', desde: 1, hasta } })

test('NCF-01 al registrar una secuencia, la alerta se calcula al 80 % del rango', async () => {
  const r = await registrarB16(2)
  assert.equal(r.status, 201)
  assert.equal(r.data.data.alerta_desde, 1)
})

test('NCF-02 registrar un B16 nuevo desactiva el anterior sin tocar los demás tipos', async () => {
  const lista = (await t.api('GET', '/nfc', { token: n.admin })).data.data
  assert.equal(lista.filter((s) => s.tipo_ncf === 'B16' && s.activo).length, 1)
  for (const tipo of ['B01', 'B02', 'B11', 'B14', 'B15']) {
    assert.ok(lista.some((s) => s.tipo_ncf === tipo && s.activo), `${tipo} debe seguir activo`)
  }
})

test('NCF-03 rechaza una secuencia con desde mayor o igual a hasta', async () => {
  const r = await t.api('POST', '/nfc', { token: n.admin, body: { tipo_ncf: 'B15', desde: 10, hasta: 10 } })
  assert.equal(r.status, 400)
})

test('NCF-04 la primera emisión de una secuencia corta dispara la alerta de agotamiento', async () => {
  const r = await n.emitir([n.itemA(1)], { tipo_ncf: 'B16' }, facturador)
  assert.equal(r.status, 201)
  assert.equal(r.data.alerta_ncf, true)
})

test('NCF-05 con la secuencia agotada no se puede emitir', async () => {
  await n.emitir([n.itemA(1)], { tipo_ncf: 'B16' }, facturador)   // consume el segundo y último número
  const r = await n.emitir([n.itemA(1)], { tipo_ncf: 'B16' }, facturador)
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /agotada/)
})

test('NCF-06 un intento fallido por agotamiento no consume el número de factura', async () => {
  const antes = (await t.api('GET', '/configuracion', { token: n.admin })).data.data.factura_ultimo_numero
  await n.emitir([n.itemA(1)], { tipo_ncf: 'B16' }, facturador)
  const despues = (await t.api('GET', '/configuracion', { token: n.admin })).data.data.factura_ultimo_numero
  assert.equal(despues, antes)
})

test('NCF-07 pedir un tipo sin secuencia activa da 400 y nombra el tipo', async () => {
  const r = await n.emitir([n.itemA(1)], { tipo_ncf: 'B99' }, facturador)
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /B99/)
})
