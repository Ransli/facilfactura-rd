import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'

let t, admin, nuevo
before(async () => { t = await iniciar(); admin = (await t.sesion('admin')).token })
after(async () => { await t.cerrar() })

test('USU-01 el administrador crea un empleado con rol facturador sin exponer el hash', async () => {
  const r = await t.api('POST', '/usuarios', {
    token: admin, body: { nombre: 'Empleado Prueba', email: 'prueba@x.com', password: 'abc123', rol_id: 2 },
  })
  assert.equal(r.status, 201)
  assert.equal('password_hash' in r.data.data, false)
  nuevo = r.data.data
})

test('USU-02 no permite dos usuarios con el mismo correo', async () => {
  const r = await t.api('POST', '/usuarios', {
    token: admin, body: { nombre: 'Otro', email: 'prueba@x.com', password: 'abc123', rol_id: 2 },
  })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /email/)
})

test('USU-03 exige contraseñas de al menos 6 caracteres', async () => {
  const r = await t.api('POST', '/usuarios', {
    token: admin, body: { nombre: 'Otro', email: 'corta@x.com', password: '123', rol_id: 2 },
  })
  assert.equal(r.status, 400)
})

test('USU-04 un usuario desactivado ya no puede iniciar sesión', async () => {
  const baja = await t.api('DELETE', `/usuarios/${nuevo.id}`, { token: admin })
  assert.equal(baja.status, 200)
  const r = await t.api('POST', '/auth/login', { body: { email: 'prueba@x.com', password: 'abc123' } })
  assert.equal(r.status, 401)
})

test('USU-05 el administrador no puede desactivar su propia cuenta', async () => {
  const yo = (await t.api('GET', '/auth/me', { token: admin })).data.usuario
  const r = await t.api('DELETE', `/usuarios/${yo.id}`, { token: admin })
  assert.equal(r.status, 400)
})

test('SEG-02 el listado de usuarios no expone password_hash', async () => {
  const r = await t.api('GET', '/usuarios', { token: admin })
  assert.ok(r.data.data.length > 0)
  assert.ok(r.data.data.every((u) => !('password_hash' in u)))
})
