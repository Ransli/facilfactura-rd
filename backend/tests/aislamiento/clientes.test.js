import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from './../helpers/contexto.js'

let t, A, B, adminA, adminB, clienteA
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token
  clienteA = (await t.api('POST', '/clientes', {
    token: adminA, body: { nombre: 'Cliente secreto de Alfa', rnc: '130-88170-7' },
  })).data.data
})
after(async () => { await t.cerrar() })

test('el cliente creado por una empresa queda asignado a esa empresa', async () => {
  const [[fila]] = await t.pool.query('SELECT tenant_id FROM clientes WHERE id = ?', [clienteA.id])
  assert.equal(fila.tenant_id, A.tenantId)
})

test('la empresa B no ve los clientes de la empresa A en el listado', async () => {
  const r = await t.api('GET', '/clientes', { token: adminB })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.length, 0)
})

test('la búsqueda de la empresa B no encuentra clientes de la empresa A', async () => {
  const r = await t.api('GET', '/clientes?buscar=secreto', { token: adminB })
  assert.equal(r.data.data.length, 0)
})

test('la empresa A sí ve su propio cliente', async () => {
  const r = await t.api('GET', '/clientes', { token: adminA })
  assert.deepEqual(r.data.data.map((c) => c.nombre), ['Cliente secreto de Alfa'])
})

test('la empresa B recibe 404 al pedir un cliente de la empresa A', async () => {
  const r = await t.api('GET', `/clientes/${clienteA.id}`, { token: adminB })
  assert.equal(r.status, 404)
})

test('la empresa B recibe 404 al editar un cliente de A y este no cambia', async () => {
  const r = await t.api('PUT', `/clientes/${clienteA.id}`, { token: adminB, body: { nombre: 'Hackeado' } })
  assert.equal(r.status, 404)
  const [[fila]] = await t.pool.query('SELECT nombre FROM clientes WHERE id = ?', [clienteA.id])
  assert.equal(fila.nombre, 'Cliente secreto de Alfa')
})

test('la empresa B recibe 404 al eliminar un cliente de A y este sigue activo', async () => {
  const r = await t.api('DELETE', `/clientes/${clienteA.id}`, { token: adminB })
  assert.equal(r.status, 404)
  const [[fila]] = await t.pool.query('SELECT activo FROM clientes WHERE id = ?', [clienteA.id])
  assert.equal(fila.activo, 1)
})

test('pedir un tenant_id ajeno en la URL da 403', async () => {
  const r = await t.api('GET', `/clientes?tenant_id=${A.tenantId}`, { token: adminB })
  assert.equal(r.status, 403)
})

test('mandar un tenant_id ajeno en el cuerpo da 403 y no crea el cliente', async () => {
  const r = await t.api('POST', '/clientes', { token: adminB, body: { nombre: 'Intruso', tenant_id: A.tenantId } })
  assert.equal(r.status, 403)
  const [[fila]] = await t.pool.query("SELECT COUNT(*) n FROM clientes WHERE nombre = 'Intruso'")
  assert.equal(fila.n, 0)
})

test('mandar el propio tenant_id es aceptado (no rompe a quien lo envía por costumbre)', async () => {
  const r = await t.api('GET', `/clientes?tenant_id=${B.tenantId}`, { token: adminB })
  assert.equal(r.status, 200)
})

test('un token sin tenant_id (como el de la consola master) no entra a las rutas de empresa', async () => {
  const sinEmpresa = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET)
  const r = await t.api('GET', '/clientes', { token: sinEmpresa })
  assert.equal(r.status, 403)
})

test('un cliente nuevo de B con el mismo RNC que uno de A es válido: son empresas distintas', async () => {
  const r = await t.api('POST', '/clientes', { token: adminB, body: { nombre: 'Mismo RNC', rnc: '130-88170-7' } })
  assert.equal(r.status, 201)
  const [[fila]] = await t.pool.query('SELECT tenant_id FROM clientes WHERE id = ?', [r.data.data.id])
  assert.equal(fila.tenant_id, B.tenantId)
})

test('el token de inicio de sesión lleva el tenant_id de la empresa', async () => {
  const decoded = jwt.decode(adminA)
  assert.equal(decoded.tenant_id, A.tenantId)
})
