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

const configurar = (cambios) => t.api('PUT', '/configuracion', { token: n.admin, body: cambios })

test('D-2 con retención de ITBIS del 30 % el total es subtotal + ITBIS − ret. ITBIS − ret. ISR', async () => {
  await configurar({ ret_itbis_porcentaje: 30 })
  const f = (await n.emitir([n.itemA(1)], {}, facturador)).data.data

  assert.equal(Number(f.subtotal), 1000)
  assert.equal(Number(f.itbis), 180)
  assert.equal(Number(f.ret_itbis), 54)
  assert.equal(Number(f.ret_isr), 100)
  assert.equal(Number(f.total), 1026)
})

test('D-2 sin retención de ITBIS el total suma el ITBIS completo', async () => {
  await configurar({ ret_itbis_porcentaje: 0 })
  const f = (await n.emitir([n.itemA(1)], {}, facturador)).data.data
  assert.equal(Number(f.total), 1080)   // 1,000 + 180 − 0 − 100
})

test('D-2 con la retención de ITBIS al 100 % el total sigue siendo subtotal − ret. ISR', async () => {
  await configurar({ ret_itbis_porcentaje: 100 })
  const f = (await n.emitir([n.itemA(1)], {}, facturador)).data.data
  assert.equal(Number(f.total), 900)
})
