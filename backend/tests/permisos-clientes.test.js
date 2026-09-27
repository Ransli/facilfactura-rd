import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'

let t, admin, facturador, visor, clienteId
before(async () => {
  t = await iniciar()
  admin = (await t.sesion('admin')).token
  facturador = (await t.sesion('facturador')).token
  visor = (await t.sesion('visor')).token
  clienteId = (await t.api('POST', '/clientes', { token: facturador, body: { nombre: 'Cliente Base' } })).data.data.id
})
after(async () => { await t.cerrar() })

test('D-4 un visor no puede crear clientes', async () => {
  const r = await t.api('POST', '/clientes', { token: visor, body: { nombre: 'Creado por un visor' } })
  assert.equal(r.status, 403)
})

test('D-4 un visor no puede editar clientes', async () => {
  const r = await t.api('PUT', `/clientes/${clienteId}`, { token: visor, body: { nombre: 'Cambiado' } })
  assert.equal(r.status, 403)
})

test('D-4 un visor no puede eliminar clientes', async () => {
  const r = await t.api('DELETE', `/clientes/${clienteId}`, { token: visor })
  assert.equal(r.status, 403)
  const sigue = await t.api('GET', `/clientes/${clienteId}`, { token: visor })
  assert.equal(sigue.status, 200, 'el cliente debe seguir existiendo')
})

test('D-4 un visor sí puede consultar y buscar clientes', async () => {
  assert.equal((await t.api('GET', '/clientes', { token: visor })).status, 200)
  assert.equal((await t.api('GET', `/clientes/${clienteId}`, { token: visor })).status, 200)
})

test('D-4 el facturador y el administrador siguen pudiendo editar clientes', async () => {
  const a = await t.api('PUT', `/clientes/${clienteId}`, { token: facturador, body: { nombre: 'Editado por facturador' } })
  const b = await t.api('PUT', `/clientes/${clienteId}`, { token: admin, body: { nombre: 'Editado por admin' } })
  assert.equal(a.status, 200)
  assert.equal(b.status, 200)
})
