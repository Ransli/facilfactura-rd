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

async function nadaSeConsumio() {
  const cfg = (await t.api('GET', '/configuracion', { token: n.admin })).data.data
  const seq = (await t.api('GET', '/nfc/activa?tipo=B01', { token: n.admin })).data.data
  assert.equal(cfg.factura_ultimo_numero, 0, 'se consumió un número de factura')
  assert.equal(seq.ultimo_usado, 0, 'se consumió un NCF')
}

// ── D-3: cantidades, precios y medidas ────────────────────────

test('D-3 rechaza una cantidad negativa', async () => {
  const r = await n.emitir([n.itemA(-5)], {}, facturador)
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /cantidad/i)
})

test('D-3 rechaza una cantidad igual a cero', async () => {
  assert.equal((await n.emitir([n.itemA(0)], {}, facturador)).status, 400)
})

test('D-3 rechaza una cantidad que no es un número', async () => {
  assert.equal((await n.emitir([n.itemA('abc')], {}, facturador)).status, 400)
})

test('D-3 rechaza un precio unitario negativo', async () => {
  const r = await n.emitir([n.itemA(1, -10)], {}, facturador)
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /precio/i)
})

test('D-3 rechaza un ancho o un alto menores o iguales a cero', async () => {
  assert.equal((await n.emitir([n.itemB(1, 0, 2)], {}, facturador)).status, 400)
  assert.equal((await n.emitir([n.itemB(1, 2, -1)], {}, facturador)).status, 400)
})

test('D-3 acepta un precio de cero (artículo de cortesía)', async () => {
  const r = await n.emitir([n.itemA(1, 0)], {}, facturador)
  assert.equal(r.status, 201)
})

test('D-3 las facturas rechazadas no consumen NCF ni número de factura', async () => {
  // Esta prueba corre en una base sin emisiones previas: reinicia los contadores del negocio.
  await t.pool.query('UPDATE configuracion SET factura_ultimo_numero = 0')
  await t.pool.query('UPDATE nfc_secuencias SET ultimo_usado = 0')
  await t.pool.query('DELETE FROM factura_items')
  await t.pool.query('DELETE FROM facturas')

  await n.emitir([n.itemA(-5)], {}, facturador)
  await n.emitir([n.itemA(1, -10)], {}, facturador)
  await nadaSeConsumio()
})
