import '../helpers/entorno.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import pool from '../../config/database.js'
import { autenticarMaster, ErrorDeAutenticacion } from '../../services/master/autenticacion.js'
import { verificarTokenMaster } from '../../middleware/master.js'

const crearMaster = async ({ email = 'master@facilfactura.com', password = 'Master2026!', activo = true } = {}) => {
  const hash = await bcrypt.hash(password, 4)
  const [r] = await pool.query('INSERT INTO usuarios_plataforma (nombre, email, password_hash, activo) VALUES (?, ?, ?, ?)',
    ['Master de Prueba', email, hash, activo])
  return { id: r.insertId, email, password }
}

before(async () => { await pool.query('DELETE FROM usuarios_plataforma') })
beforeEach(async () => { await pool.query('DELETE FROM usuarios_plataforma') })
after(async () => { await pool.end() })

test('con email y contraseña correctos entrega un token y los datos del master (sin la contraseña)', async () => {
  const m = await crearMaster()
  const r = await autenticarMaster(pool, { email: m.email, password: m.password })
  assert.ok(r.token)
  assert.equal(r.master.email, m.email)
  assert.equal(r.master.nombre, 'Master de Prueba')
  assert.ok(!('password_hash' in r.master))
})

test('el token trae ambito master y ningún tenant_id', async () => {
  const jwt = await import('jsonwebtoken')
  const m = await crearMaster()
  const { token } = await autenticarMaster(pool, { email: m.email, password: m.password })
  const payload = jwt.default.verify(token, `${process.env.JWT_SECRET}:master`)
  assert.equal(payload.ambito, 'master')
  assert.equal(payload.tenant_id, undefined)
  assert.equal(payload.id, m.id)
})

test('el token del master está firmado con una clave distinta a la de los tenants: uno no sirve para el otro', async () => {
  const jwt = await import('jsonwebtoken')
  const m = await crearMaster()
  const { token } = await autenticarMaster(pool, { email: m.email, password: m.password })
  assert.throws(() => jwt.default.verify(token, process.env.JWT_SECRET))

  const tokenDeEmpresa = jwt.default.sign({ id: 1, tenant_id: 1, rol: 'admin' }, process.env.JWT_SECRET)
  const req = { headers: { authorization: `Bearer ${tokenDeEmpresa}` } }
  let status = null
  const res = { status: (s) => { status = s; return res }, json: () => {} }
  await verificarTokenMaster(req, res, () => { throw new Error('no debería llamar a next()') })
  assert.equal(status, 401)
})

test('contraseña incorrecta o email inexistente: mismo mensaje, para no revelar cuáles correos existen', async () => {
  const m = await crearMaster()
  await assert.rejects(autenticarMaster(pool, { email: m.email, password: 'otra-clave' }), ErrorDeAutenticacion)
  await assert.rejects(autenticarMaster(pool, { email: 'no-existe@x.com', password: 'x' }), ErrorDeAutenticacion)
  try {
    await autenticarMaster(pool, { email: m.email, password: 'otra-clave' })
  } catch (e1) {
    try {
      await autenticarMaster(pool, { email: 'no-existe@x.com', password: 'x' })
    } catch (e2) {
      assert.equal(e1.message, e2.message)
    }
  }
})

test('un master inactivo no puede entrar', async () => {
  const m = await crearMaster({ activo: false })
  await assert.rejects(autenticarMaster(pool, { email: m.email, password: m.password }), ErrorDeAutenticacion)
})

test('el acceso actualiza ultimo_acceso', async () => {
  const m = await crearMaster()
  await autenticarMaster(pool, { email: m.email, password: m.password })
  const [[fila]] = await pool.query('SELECT ultimo_acceso FROM usuarios_plataforma WHERE id = ?', [m.id])
  assert.ok(fila.ultimo_acceso)
})
