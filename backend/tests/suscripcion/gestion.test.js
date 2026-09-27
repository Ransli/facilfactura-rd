import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { enTransaccion } from '../../utils/transaccion.js'
import { hoyRD } from '../../services/suscripcion/estado.js'
import { sumarDias, sumarMeses } from '../../services/suscripcion/fechas.js'
import * as gestion from '../../services/suscripcion/gestion.js'

let t, A, B, adminB, facturadorB
let pruebaId, negocioId, emprendedorId
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminB = (await t.sesionDe(B, 'admin')).token
  facturadorB = (await t.sesionDe(B, 'facturador')).token
  const [planes] = await t.pool.query('SELECT id, slug FROM planes')
  const id = (slug) => planes.find((p) => p.slug === slug).id
  pruebaId = id('prueba'); negocioId = id('negocio'); emprendedorId = id('emprendedor')
})
after(async () => { await t.cerrar() })

const hoy = () => hoyRD()
const ejecutar = (fn) => enTransaccion(t.pool, fn)
const tenantB = async () => (await t.pool.query('SELECT * FROM tenants WHERE id = ?', [B.tenantId]))[0][0]
const subsB = async () => (await t.pool.query(
  "SELECT *, DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fin FROM tenant_subscriptions WHERE tenant_id = ? ORDER BY id DESC", [B.tenantId]))[0]
const historialB = async () => (await t.pool.query(
  'SELECT accion, detalle, actor FROM subscription_history WHERE tenant_id = ? ORDER BY id', [B.tenantId]))[0]
const fechaDe = (valor) => (valor instanceof Date ? valor.toLocaleDateString('en-CA') : String(valor).slice(0, 10))

test('iniciar una suscripción con el plan de prueba: 30 días gratis, en estado prueba', async () => {
  await ejecutar((c) => gestion.iniciarSuscripcion(c, B.tenantId, pruebaId, { actor: 'sistema' }))
  const tenant = await tenantB()
  assert.equal(tenant.estado, 'prueba')
  assert.equal(tenant.plan_id, pruebaId)
  assert.equal(fechaDe(tenant.fecha_fin_prueba), sumarDias(hoy(), 30))
  const subs = await subsB()
  assert.equal(subs.length, 1)
  assert.equal(subs[0].status, 'prueba')
  assert.equal(subs[0].fin, sumarDias(hoy(), 30))
  assert.equal((await historialB())[0].accion, 'creada')
})

test('iniciar una suscripción con un plan de pago: pendiente de pago con 5 días para pagar', async () => {
  await ejecutar((c) => gestion.iniciarSuscripcion(c, B.tenantId, negocioId, { actor: 'sistema' }))
  const tenant = await tenantB()
  assert.equal(tenant.estado, 'pendiente_pago')
  assert.equal(tenant.plan_id, negocioId)
  assert.equal(fechaDe(tenant.fecha_fin_prueba), sumarDias(hoy(), 5))
  assert.equal((await subsB()).length, 1, 'se actualiza la suscripción, no se duplica')
})

test('un plan inexistente o inactivo no inicia la suscripción', async () => {
  await assert.rejects(ejecutar((c) => gestion.iniciarSuscripcion(c, B.tenantId, 999999)), /plan/i)
  await t.pool.query('UPDATE planes SET activo = 0 WHERE id = ?', [emprendedorId])
  await assert.rejects(ejecutar((c) => gestion.iniciarSuscripcion(c, B.tenantId, emprendedorId)), /plan/i)
  await t.pool.query('UPDATE planes SET activo = 1 WHERE id = ?', [emprendedorId])
})

// ── Pagos ─────────────────────────────────────────────────────

test('registrar un pago activa la empresa por un mes y deja el pago y el historial', async () => {
  const r = await ejecutar((c) => gestion.registrarPago(c, {
    tenantId: B.tenantId, monto: 2490, metodo: 'transferencia', referencia: 'TRF-001', actor: 'master:1',
  }))
  assert.equal(r.fecha_fin, sumarMeses(hoy(), 1))

  const tenant = await tenantB()
  assert.equal(tenant.estado, 'activo')
  assert.equal(tenant.fecha_fin_prueba, null)
  const subs = await subsB()
  assert.equal(subs[0].status, 'activo')
  assert.equal(subs[0].fin, sumarMeses(hoy(), 1))

  const [[pago]] = await t.pool.query('SELECT * FROM subscription_payments WHERE id = ?', [r.pagoId])
  assert.equal(Number(pago.monto), 2490)
  assert.equal(pago.metodo, 'transferencia')
  assert.equal(pago.referencia, 'TRF-001')
  assert.equal(pago.estado, 'pagado')
  assert.equal(pago.registrado_por, 'master:1')
  assert.equal(fechaDe(pago.periodo_desde), hoy())
  assert.equal(fechaDe(pago.periodo_hasta), sumarMeses(hoy(), 1))

  const h = await historialB()
  assert.equal(h[h.length - 1].accion, 'pago_registrado')
  assert.equal(h[h.length - 1].actor, 'master:1')
})

test('pagar antes de vencer suma el mes al vencimiento vigente: no se pierden días', async () => {
  const antes = (await subsB())[0].fin
  const r = await ejecutar((c) => gestion.registrarPago(c, { tenantId: B.tenantId, monto: 2490, metodo: 'efectivo', actor: 'master:1' }))
  assert.equal(r.fecha_fin, sumarMeses(antes, 1))
})

test('pagar con la suscripción ya vencida cuenta el mes desde hoy y desbloquea la empresa', async () => {
  await t.pool.query("UPDATE tenant_subscriptions SET fecha_fin = ? WHERE tenant_id = ?", [sumarDias(hoy(), -10), B.tenantId])
  assert.equal((await t.api('POST', '/clientes', { token: facturadorB, body: { nombre: 'Bloqueado' } })).status, 403)

  const r = await ejecutar((c) => gestion.registrarPago(c, { tenantId: B.tenantId, monto: 2490, metodo: 'tarjeta', actor: 'master:1' }))
  assert.equal(r.fecha_fin, sumarMeses(hoy(), 1))
  assert.equal((await t.api('POST', '/clientes', { token: facturadorB, body: { nombre: 'Ya no' } })).status, 201)
})

test('un pago inválido no deja nada a medias: ni pago, ni cambio de fechas, ni historial', async () => {
  const antes = { subs: (await subsB())[0].fin, h: (await historialB()).length }
  const [[{ n: pagosAntes }]] = await t.pool.query('SELECT COUNT(*) n FROM subscription_payments WHERE tenant_id = ?', [B.tenantId])

  for (const malo of [{ monto: 0 }, { monto: -5 }, { monto: 'abc' }, { metodo: 'bitcoin' }]) {
    await assert.rejects(ejecutar((c) => gestion.registrarPago(c, { tenantId: B.tenantId, monto: 100, metodo: 'efectivo', ...malo })))
  }
  await assert.rejects(ejecutar((c) => gestion.registrarPago(c, { tenantId: 999999, monto: 100, metodo: 'efectivo' })), /empresa/i)

  const [[{ n: pagosDespues }]] = await t.pool.query('SELECT COUNT(*) n FROM subscription_payments WHERE tenant_id = ?', [B.tenantId])
  assert.equal(pagosDespues, pagosAntes)
  assert.equal((await subsB())[0].fin, antes.subs)
  assert.equal((await historialB()).length, antes.h)
})

// ── Cambios de plan y de estado ───────────────────────────────

test('cambiar de plan actualiza empresa y suscripción, conserva las fechas y deja historial', async () => {
  const fin = (await subsB())[0].fin
  await ejecutar((c) => gestion.cambiarPlan(c, B.tenantId, emprendedorId, { actor: 'master:1' }))
  assert.equal((await tenantB()).plan_id, emprendedorId)
  assert.equal((await subsB())[0].plan_id, emprendedorId)
  assert.equal((await subsB())[0].fin, fin)
  const h = await historialB()
  assert.equal(h[h.length - 1].accion, 'plan_cambiado')
  assert.match(h[h.length - 1].detalle, /Negocio.*Emprendedor|Emprendedor/)
})

test('suspender bloquea las escrituras y reactivar las devuelve, sin tocar los datos', async () => {
  const [[antes]] = await t.pool.query('SELECT (SELECT COUNT(*) FROM clientes WHERE tenant_id = ?) c, (SELECT COUNT(*) FROM usuarios WHERE tenant_id = ?) u', [B.tenantId, B.tenantId])

  await ejecutar((c) => gestion.suspender(c, B.tenantId, { motivo: 'Falta de pago', actor: 'master:1' }))
  assert.equal((await tenantB()).estado, 'suspendido')
  assert.equal((await t.api('POST', '/clientes', { token: facturadorB, body: { nombre: 'X' } })).status, 403)
  assert.equal((await t.api('GET', '/clientes', { token: adminB })).status, 200)

  await ejecutar((c) => gestion.reactivar(c, B.tenantId, { actor: 'master:1' }))
  assert.equal((await tenantB()).estado, 'activo')
  assert.equal((await t.api('POST', '/clientes', { token: facturadorB, body: { nombre: 'Vuelve' } })).status, 201)

  const [[despues]] = await t.pool.query('SELECT (SELECT COUNT(*) FROM clientes WHERE tenant_id = ?) c, (SELECT COUNT(*) FROM usuarios WHERE tenant_id = ?) u', [B.tenantId, B.tenantId])
  assert.equal(despues.c, antes.c + 1, 'solo el cliente creado después de reactivar')
  assert.equal(despues.u, antes.u)
})

test('cancelar bloquea y deja historial con el motivo', async () => {
  await ejecutar((c) => gestion.cancelar(c, B.tenantId, { motivo: 'Pidió la baja', actor: 'master:1' }))
  assert.equal((await tenantB()).estado, 'cancelado')
  assert.equal((await subsB())[0].status, 'cancelado')
  const h = await historialB()
  assert.equal(h[h.length - 1].accion, 'cancelada')
  assert.match(h[h.length - 1].detalle, /Pidió la baja/)
  await ejecutar((c) => gestion.reactivar(c, B.tenantId, { actor: 'master:1' }))
})

test('marcar como exenta evita el bloqueo aunque venza, y quitar la exención lo restablece', async () => {
  await t.pool.query('UPDATE tenant_subscriptions SET fecha_fin = ? WHERE tenant_id = ?', [sumarDias(hoy(), -30), B.tenantId])
  await ejecutar((c) => gestion.marcarExento(c, B.tenantId, { motivo: 'Cliente piloto', actor: 'master:1' }))
  assert.equal((await tenantB()).estado, 'exento')
  assert.equal((await t.api('POST', '/clientes', { token: facturadorB, body: { nombre: 'Exenta' } })).status, 201)

  await ejecutar((c) => gestion.quitarExento(c, B.tenantId, { actor: 'master:1' }))
  assert.equal((await tenantB()).estado, 'activo')
  assert.equal((await t.api('POST', '/clientes', { token: facturadorB, body: { nombre: 'Ya no' } })).status, 403)
})

test('cada cambio queda en el historial, en orden y con su responsable', async () => {
  const h = await historialB()
  assert.ok(h.length >= 8)
  const acciones = new Set(h.map((x) => x.accion))
  for (const esperada of ['creada', 'pago_registrado', 'plan_cambiado', 'suspendida', 'reactivada', 'cancelada', 'exenta', 'exencion_quitada']) {
    assert.ok(acciones.has(esperada), `falta ${esperada}`)
  }
  assert.ok(h.every((x) => x.actor))
})

test('operar sobre una empresa inexistente falla con un mensaje claro', async () => {
  await assert.rejects(ejecutar((c) => gestion.suspender(c, 999999, { actor: 'master:1' })), /empresa/i)
  await assert.rejects(ejecutar((c) => gestion.cambiarPlan(c, 999999, negocioId, { actor: 'master:1' })), /empresa/i)
})

test('las operaciones de una empresa no alteran la suscripción de otra', async () => {
  const [[a]] = await t.pool.query('SELECT estado, plan_id FROM tenants WHERE id = ?', [A.tenantId])
  assert.equal(a.estado, 'activo')
  const [[hA]] = await t.pool.query('SELECT COUNT(*) n FROM subscription_history WHERE tenant_id = ?', [A.tenantId])
  assert.equal(hA.n, 0)
})

// ── Planes públicos ───────────────────────────────────────────

test('GET /suscripcion/planes lista los planes activos sin necesidad de iniciar sesión', async () => {
  const r = await t.api('GET', '/suscripcion/planes')
  assert.equal(r.status, 200)
  const planes = r.data.data
  assert.ok(planes.length >= 4)
  assert.ok(planes.every((p) => p.nombre && 'precio_mensual' in p && 'max_usuarios' in p && 'max_ecf_mes' in p))
  assert.ok(planes.every((p) => !('created_at' in p) && !('activo' in p)), 'sin campos internos')
  assert.deepEqual(planes.map((p) => p.orden), [...planes.map((p) => p.orden)].sort((x, y) => x - y))
})

test('un plan inactivo no aparece en la lista pública', async () => {
  await t.pool.query('UPDATE planes SET activo = 0 WHERE id = ?', [emprendedorId])
  const planes = (await t.api('GET', '/suscripcion/planes')).data.data
  assert.ok(!planes.some((p) => p.id === emprendedorId))
  await t.pool.query('UPDATE planes SET activo = 1 WHERE id = ?', [emprendedorId])
})
