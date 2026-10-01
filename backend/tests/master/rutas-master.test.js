import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { iniciar } from '../helpers/contexto.js'

let t, A, adminA, master
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  adminA = (await t.sesionDe(A, 'admin')).token
  const hash = await bcrypt.hash('Master2026!', 4)
  const [r] = await t.pool.query('INSERT INTO usuarios_plataforma (nombre, email, password_hash) VALUES (?, ?, ?)',
    ['Master de Prueba', 'master@facilfactura.com', hash])
  const login = await t.api('POST', '/master/auth/login', { body: { email: 'master@facilfactura.com', password: 'Master2026!' } })
  master = login.data.token
})
after(async () => { await t.cerrar() })

// ── Realms separados ──────────────────────────────────────────

test('el login del master rechaza credenciales incorrectas con 401', async () => {
  const r = await t.api('POST', '/master/auth/login', { body: { email: 'master@facilfactura.com', password: 'mala' } })
  assert.equal(r.status, 401)
})

test('un token de empresa no sirve en las rutas del master, y uno del master no sirve en las de empresa', async () => {
  assert.equal((await t.api('GET', '/master/empresas', { token: adminA })).status, 401)
  assert.equal((await t.api('GET', '/clientes', { token: master })).status, 401)
})

test('sin token, las rutas del master piden autenticación', async () => {
  assert.equal((await t.api('GET', '/master/empresas')).status, 401)
})

// ── Listado y detalle ─────────────────────────────────────────

test('el master lista las empresas y ve el detalle de una', async () => {
  const lista = await t.api('GET', '/master/empresas', { token: master })
  assert.equal(lista.status, 200)
  assert.ok(lista.data.data.some((e) => e.tenant_id === A.tenantId))

  const detalle = await t.api('GET', `/master/empresas/${A.tenantId}`, { token: master })
  assert.equal(detalle.status, 200)
  assert.equal(detalle.data.data.tenant.nombre, 'Empresa Alfa')
})

test('el detalle de una empresa inexistente es 404', async () => {
  assert.equal((await t.api('GET', '/master/empresas/999999', { token: master })).status, 404)
})

// ── Cambiar plan, pago y estado ───────────────────────────────

test('el master cambia el plan de una empresa', async () => {
  const [[plan]] = await t.pool.query("SELECT id FROM planes WHERE slug = 'empresarial'")
  const r = await t.api('PUT', `/master/empresas/${A.tenantId}/plan`, { token: master, body: { plan_id: plan.id } })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.suscripcion.plan.slug, 'empresarial')
})

test('el master registra un pago', async () => {
  const r = await t.api('POST', `/master/empresas/${A.tenantId}/pagos`, { token: master, body: { monto: 500, metodo: 'efectivo' } })
  assert.equal(r.status, 201)
})

test('el master suspende y reactiva una empresa', async () => {
  assert.equal((await t.api('POST', `/master/empresas/${A.tenantId}/estado`, { token: master, body: { accion: 'suspender' } })).status, 200)
  assert.equal((await t.api('GET', `/master/empresas/${A.tenantId}`, { token: master })).data.data.tenant.estado, 'suspendido')
  assert.equal((await t.api('POST', `/master/empresas/${A.tenantId}/estado`, { token: master, body: { accion: 'reactivar' } })).status, 200)
})

test('una empresa no admin no puede tocar las rutas del master aunque adivine la URL', async () => {
  const facturadorA = (await t.sesionDe(A, 'facturador')).token
  assert.equal((await t.api('GET', '/master/empresas', { token: facturadorA })).status, 401)
})

// ── Impersonación de punta a punta ────────────────────────────

test('el master entra a ver una empresa (solo lectura) y luego a editarla', async () => {
  const ver = await t.api('POST', `/master/empresas/${A.tenantId}/impersonar`, { token: master, body: { modo: 'ver' } })
  assert.equal(ver.status, 200)
  assert.equal((await t.api('GET', '/clientes', { token: ver.data.data.token })).status, 200)
  assert.equal((await t.api('POST', '/clientes', { token: ver.data.data.token, body: { nombre: 'x' } })).status, 403)

  const editar = await t.api('POST', `/master/empresas/${A.tenantId}/impersonar`, { token: master, body: { modo: 'editar' } })
  const creado = await t.api('POST', '/clientes', { token: editar.data.data.token, body: { nombre: 'Cliente del master' } })
  assert.equal(creado.status, 201)
})

test('impersonar una empresa inexistente da 404', async () => {
  assert.equal((await t.api('POST', '/master/empresas/999999/impersonar', { token: master, body: { modo: 'ver' } })).status, 404)
})

test('/master/auth/me confirma la sesión', async () => {
  const r = await t.api('GET', '/master/auth/me', { token: master })
  assert.equal(r.status, 200)
  assert.equal(r.data.master.email, 'master@facilfactura.com')
})
