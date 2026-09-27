import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from './helpers/contexto.js'

let t
before(async () => { t = await iniciar() })
after(async () => { await t.cerrar() })

const login = (email, password) => t.api('POST', '/auth/login', { body: { email, password } })

test('AUT-01 el administrador inicia sesión y recibe un token sin exponer el hash', async () => {
  const r = await login('admin@facilfactura.com', 'Admin2025!')
  assert.equal(r.status, 200)
  assert.ok(r.data.token)
  assert.equal(r.data.usuario.rol, 'admin')
  assert.equal('password_hash' in r.data.usuario, false)
})

test('AUT-02 rechaza una contraseña incorrecta', async () => {
  const r = await login('admin@facilfactura.com', 'incorrecta')
  assert.equal(r.status, 401)
  assert.equal(r.data.mensaje, 'Credenciales incorrectas')
})

test('AUT-03 usuario inexistente recibe el mismo mensaje que una contraseña incorrecta', async () => {
  const r = await login('noexiste@x.com', 'x')
  assert.equal(r.status, 401)
  assert.equal(r.data.mensaje, 'Credenciales incorrectas')
})

test('AUT-04 rechaza un inicio de sesión sin contraseña', async () => {
  const r = await t.api('POST', '/auth/login', { body: { email: 'admin@facilfactura.com' } })
  assert.equal(r.status, 400)
})

test('AUT-05 un recurso protegido exige token', async () => {
  const r = await t.api('GET', '/clientes')
  assert.equal(r.status, 401)
  assert.equal(r.data.mensaje, 'Token requerido')
})

test('AUT-06 rechaza un token firmado con otra clave', async () => {
  const falso = jwt.sign({ id: 1, rol: 'admin' }, 'otra_clave')
  const r = await t.api('GET', '/clientes', { token: falso })
  assert.equal(r.status, 401)
})

test('AUT-07 rechaza un token vencido', async () => {
  const vencido = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET, { expiresIn: -10 })
  const r = await t.api('GET', '/clientes', { token: vencido })
  assert.equal(r.status, 401)
})

test('AUT-08 /auth/me devuelve el usuario de la sesión', async () => {
  const { token } = await t.sesion('facturador')
  const r = await t.api('GET', '/auth/me', { token })
  assert.equal(r.status, 200)
  assert.equal(r.data.usuario.rol, 'facturador')
})

test('ROL-01 un facturador no puede listar usuarios', async () => {
  const { token } = await t.sesion('facturador')
  assert.equal((await t.api('GET', '/usuarios', { token })).status, 403)
})

test('ROL-02 un facturador no puede registrar una secuencia NCF', async () => {
  const { token } = await t.sesion('facturador')
  const r = await t.api('POST', '/nfc', { token, body: { tipo_ncf: 'B01', desde: 1, hasta: 100 } })
  assert.equal(r.status, 403)
})

test('ROL-03 un visor no puede modificar la configuración fiscal', async () => {
  const { token } = await t.sesion('visor')
  const r = await t.api('PUT', '/configuracion', { token, body: { moneda: 'USD' } })
  assert.equal(r.status, 403)
})
