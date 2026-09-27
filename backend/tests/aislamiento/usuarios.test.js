import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'

let t, A, B, adminA, adminB, usuarioDeB
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token
  const lista = (await t.api('GET', '/usuarios', { token: adminB })).data.data
  usuarioDeB = lista.find((u) => u.rol === 'facturador')
})
after(async () => { await t.cerrar() })

const filaDe = async (id) => (await t.pool.query('SELECT * FROM usuarios WHERE id = ?', [id]))[0][0]

test('el administrador de cada empresa lista solo a sus propios usuarios', async () => {
  const a = (await t.api('GET', '/usuarios', { token: adminA })).data.data
  const b = (await t.api('GET', '/usuarios', { token: adminB })).data.data
  assert.equal(a.length, 3)
  assert.equal(b.length, 3)
  assert.ok(a.every((u) => u.email.endsWith(`@${A.slug}.test`)))
  assert.ok(b.every((u) => u.email.endsWith(`@${B.slug}.test`)))
})

test('la búsqueda de usuarios no atraviesa empresas', async () => {
  const r = await t.api('GET', `/usuarios?buscar=${B.slug}`, { token: adminA })
  assert.equal(r.data.data.length, 0)
})

test('un usuario creado por el administrador de A pertenece a A', async () => {
  const r = await t.api('POST', '/usuarios', {
    token: adminA, body: { nombre: 'Nuevo de Alfa', email: 'nuevo@alfa.test', password: 'abc123', rol_id: 2 },
  })
  assert.equal(r.status, 201)
  assert.equal((await filaDe(r.data.data.id)).tenant_id, A.tenantId)
})

test('el correo de un usuario de B no puede reutilizarse en A: es único en la plataforma', async () => {
  const r = await t.api('POST', '/usuarios', {
    token: adminA, body: { nombre: 'Repetido', email: usuarioDeB.email, password: 'abc123', rol_id: 2 },
  })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /email/i)
})

test('A recibe 404 al editar a un usuario de B, y este no cambia (ni su contraseña)', async () => {
  const antes = await filaDe(usuarioDeB.id)
  const r = await t.api('PUT', `/usuarios/${usuarioDeB.id}`, {
    token: adminA, body: { nombre: 'Hackeado', email: usuarioDeB.email, rol_id: 1, password: 'nuevaclave1' },
  })
  assert.equal(r.status, 404)
  const despues = await filaDe(usuarioDeB.id)
  assert.equal(despues.nombre, antes.nombre)
  assert.equal(despues.rol_id, antes.rol_id)
  assert.equal(despues.password_hash, antes.password_hash)
})

test('A recibe 404 al desactivar a un usuario de B, y este sigue activo', async () => {
  const r = await t.api('DELETE', `/usuarios/${usuarioDeB.id}`, { token: adminA })
  assert.equal(r.status, 404)
  assert.equal((await filaDe(usuarioDeB.id)).activo, 1)
})

test('cada empresa inicia sesión con su propio usuario y el token lleva su empresa', async () => {
  const a = await t.sesionDe(A, 'facturador')
  const b = await t.sesionDe(B, 'facturador')
  assert.equal(a.usuario.tenant_id, A.tenantId)
  assert.equal(b.usuario.tenant_id, B.tenantId)
})

test('el catálogo de roles es común a todas las empresas', async () => {
  const a = (await t.api('GET', '/usuarios/roles', { token: adminA })).data.data
  const b = (await t.api('GET', '/usuarios/roles', { token: adminB })).data.data
  assert.deepEqual(a, b)
  assert.equal(a.length, 3)
})
