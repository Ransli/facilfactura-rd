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

test('D-1 diez facturas emitidas a la vez reciben números de factura y NCF distintos y consecutivos', async () => {
  const respuestas = await Promise.all(Array.from({ length: 10 }, () => n.emitir([n.itemA(1)], {}, facturador)))

  assert.deepEqual(respuestas.map((r) => r.status), Array(10).fill(201), 'todas deben emitirse')

  const facturas = respuestas.map((r) => r.data.data)
  const numeros = facturas.map((f) => f.numero).sort()
  const ncf = facturas.map((f) => f.nfc_numero).sort()
  assert.equal(new Set(numeros).size, 10, 'números de factura repetidos')
  assert.equal(new Set(ncf).size, 10, 'NCF repetidos')
  assert.deepEqual(numeros, Array.from({ length: 10 }, (_, i) => `F${String(i + 1).padStart(6, '0')}`))
  assert.deepEqual(ncf, Array.from({ length: 10 }, (_, i) => `B01${String(i + 1).padStart(10, '0')}`))
})

test('D-1 el contador de la secuencia coincide con las facturas emitidas', async () => {
  const seq = (await t.api('GET', '/nfc/activa?tipo=B01', { token: n.admin })).data.data
  assert.equal(seq.ultimo_usado, 10)
})
