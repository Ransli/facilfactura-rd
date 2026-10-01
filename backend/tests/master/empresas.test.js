import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import * as empresas from '../../services/master/empresas.js'
import { ErrorDeSuscripcion } from '../../services/suscripcion/gestion.js'

let t, A, B, emprendedorId, negocioId
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa', { plan: 'negocio' })
  B = await t.crearEmpresa('Empresa Beta', { plan: 'emprendedor' })
  const [planes] = await t.pool.query('SELECT id, slug FROM planes')
  emprendedorId = planes.find((p) => p.slug === 'emprendedor').id
  negocioId = planes.find((p) => p.slug === 'negocio').id
})
after(async () => { await t.cerrar() })

// ── Listado ───────────────────────────────────────────────────

test('listar trae todas las empresas con su plan, estado y uso', async () => {
  const lista = await empresas.listar(t.pool)
  const alfa = lista.find((e) => e.tenant_id === A.tenantId)
  assert.ok(alfa)
  assert.equal(alfa.nombre, 'Empresa Alfa')
  assert.equal(alfa.plan.slug, 'negocio')
  assert.equal(alfa.uso.usuarios.actual, 3)   // admin, facturador, visor de crearEmpresa
  assert.ok('estado' in alfa)
  assert.ok('bloqueado' in alfa)
  const beta = lista.find((e) => e.tenant_id === B.tenantId)
  assert.equal(beta.plan.slug, 'emprendedor')
})

test('listar no expone contraseñas ni datos de otras tablas de negocio', async () => {
  const lista = await empresas.listar(t.pool)
  const texto = JSON.stringify(lista)
  assert.ok(!/password/i.test(texto))
})

// ── Detalle ───────────────────────────────────────────────────

test('detalle trae la empresa, su suscripción, sus límites, su historial y sus pagos', async () => {
  const d = await empresas.detalle(t.pool, A.tenantId)
  assert.equal(d.tenant.nombre, 'Empresa Alfa')
  assert.equal(d.suscripcion.plan.slug, 'negocio')
  assert.ok(d.limites.usuarios)
  assert.ok(Array.isArray(d.historial))
  assert.ok(Array.isArray(d.pagos))
})

test('detalle de una empresa inexistente devuelve null', async () => {
  assert.equal(await empresas.detalle(t.pool, 999999), null)
})

// ── Cambiar plan ──────────────────────────────────────────────

test('cambiarPlan cambia el plan y lo registra en el historial con el actor master', async () => {
  await empresas.cambiarPlan(t.pool, B.tenantId, negocioId, { actor: 'master:1' })
  const d = await empresas.detalle(t.pool, B.tenantId)
  assert.equal(d.suscripcion.plan.slug, 'negocio')
  assert.equal(d.historial[d.historial.length - 1].actor, 'master:1')
  // deja a B en su plan original para no afectar otras pruebas
  await empresas.cambiarPlan(t.pool, B.tenantId, emprendedorId, { actor: 'master:1' })
})

test('cambiarPlan con un plan inexistente falla con un mensaje claro', async () => {
  await assert.rejects(empresas.cambiarPlan(t.pool, B.tenantId, 999999, { actor: 'master:1' }), ErrorDeSuscripcion)
})

// ── Pago y estado ─────────────────────────────────────────────

test('registrarPago registra el pago de la consola master', async () => {
  const r = await empresas.registrarPago(t.pool, B.tenantId, { monto: 990, metodo: 'transferencia', referencia: 'TRX-1' }, { actor: 'master:1' })
  assert.ok(r.pagoId)
  const d = await empresas.detalle(t.pool, B.tenantId)
  assert.ok(d.pagos.some((p) => p.referencia === 'TRX-1'))
})

test('cambiarEstado suspende, reactiva, cancela y marca exenta, cada una con su acción válida', async () => {
  await empresas.cambiarEstado(t.pool, B.tenantId, 'suspender', { actor: 'master:1' })
  assert.equal((await empresas.detalle(t.pool, B.tenantId)).tenant.estado, 'suspendido')
  await empresas.cambiarEstado(t.pool, B.tenantId, 'reactivar', { actor: 'master:1' })
  assert.equal((await empresas.detalle(t.pool, B.tenantId)).tenant.estado, 'activo')
  await empresas.cambiarEstado(t.pool, B.tenantId, 'exentar', { actor: 'master:1' })
  assert.equal((await empresas.detalle(t.pool, B.tenantId)).tenant.estado, 'exento')
  await empresas.cambiarEstado(t.pool, B.tenantId, 'quitar_exencion', { actor: 'master:1' })
  assert.equal((await empresas.detalle(t.pool, B.tenantId)).tenant.estado, 'activo')
})

test('una acción de estado desconocida se rechaza', async () => {
  await assert.rejects(empresas.cambiarEstado(t.pool, B.tenantId, 'volar', { actor: 'master:1' }), /acción/i)
})

// ── Impersonación ─────────────────────────────────────────────

test('impersonar en modo ver da un token de solo lectura de la empresa; en modo editar, de escritura', async () => {
  const ver = await empresas.tokenDeImpersonacion(t.pool, A.tenantId, { modo: 'ver', masterId: 7 })
  assert.ok(ver.token)
  assert.equal(ver.tenant.nombre, 'Empresa Alfa')

  const jwt = await import('jsonwebtoken')
  const payloadVer = jwt.default.verify(ver.token, process.env.JWT_SECRET)
  assert.equal(payloadVer.tenant_id, A.tenantId)
  assert.equal(payloadVer.rol, 'admin')
  assert.equal(payloadVer.solo_lectura, true)
  assert.equal(payloadVer.impersonado_por, 7)

  const editar = await empresas.tokenDeImpersonacion(t.pool, A.tenantId, { modo: 'editar', masterId: 7 })
  const payloadEditar = jwt.default.verify(editar.token, process.env.JWT_SECRET)
  assert.equal(payloadEditar.solo_lectura, undefined)
})

test('el token de impersonación sirve de verdad en las rutas de la empresa (modo ver bloquea escritura)', async () => {
  const ver = await empresas.tokenDeImpersonacion(t.pool, A.tenantId, { modo: 'ver', masterId: 7 })
  const r = await t.api('GET', '/clientes', { token: ver.token })
  assert.equal(r.status, 200)
  const w = await t.api('POST', '/clientes', { token: ver.token, body: { nombre: 'x' } })
  assert.equal(w.status, 403)

  const editar = await empresas.tokenDeImpersonacion(t.pool, A.tenantId, { modo: 'editar', masterId: 7 })
  const w2 = await t.api('POST', '/clientes', { token: editar.token, body: { nombre: 'Creado por el master' } })
  assert.equal(w2.status, 201)
})

test('impersonar una empresa inexistente da null', async () => {
  assert.equal(await empresas.tokenDeImpersonacion(t.pool, 999999, { modo: 'ver', masterId: 7 }), null)
})

test('el token de impersonación usa un administrador real de la empresa (para /auth/me y las FK de usuario_id)', async () => {
  const { token } = await empresas.tokenDeImpersonacion(t.pool, A.tenantId, { modo: 'editar', masterId: 7 })
  const [[admin]] = await t.pool.query(
    "SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.tenant_id = ? AND r.nombre = 'admin'", [A.tenantId])
  const jwt = await import('jsonwebtoken')
  assert.equal(jwt.default.verify(token, process.env.JWT_SECRET).id, admin.id)

  const me = await t.api('GET', '/auth/me', { token })
  assert.equal(me.status, 200)
})

test('impersonar una empresa sin administrador activo da null', async () => {
  const C = await t.crearEmpresa('Empresa Sin Admin')
  await t.pool.query(
    "UPDATE usuarios SET activo = 0 WHERE tenant_id = ? AND rol_id = (SELECT id FROM roles WHERE nombre = 'admin')", [C.tenantId])
  assert.equal(await empresas.tokenDeImpersonacion(t.pool, C.tenantId, { modo: 'ver', masterId: 7 }), null)
})
