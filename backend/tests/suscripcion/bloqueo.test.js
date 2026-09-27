import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from '../helpers/contexto.js'
import { hoyRD } from '../../services/suscripcion/estado.js'

let t, A, B, adminA, adminB, facturadorB, visorB
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token
  facturadorB = (await t.sesionDe(B, 'facturador')).token
  visorB = (await t.sesionDe(B, 'visor')).token
})
after(async () => { await t.cerrar() })

const hoy = () => hoyRD()
const enDias = (n) => {
  const d = new Date(`${hoy()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Deja a la empresa B en un estado de suscripción concreto
async function fijarEstadoB({ estado, fecha_fin_prueba = null, sub_fecha_fin = null, sub_status = null }) {
  await t.pool.query('UPDATE tenants SET estado = ?, fecha_fin_prueba = ? WHERE id = ?', [estado, fecha_fin_prueba, B.tenantId])
  await t.pool.query('DELETE FROM tenant_subscriptions WHERE tenant_id = ?', [B.tenantId])
  if (sub_status) {
    const [[plan]] = await t.pool.query('SELECT plan_id FROM tenants WHERE id = ?', [B.tenantId])
    await t.pool.query(
      'INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?)',
      [B.tenantId, plan.plan_id, sub_status, enDias(-30), sub_fecha_fin])
  }
}

const crearCliente = (token, nombre = 'Cliente') => t.api('POST', '/clientes', { token, body: { nombre } })

// ── Bloqueo: solo lectura ─────────────────────────────────────

test('una empresa suspendida puede consultar todo pero no crear ni modificar', async () => {
  await fijarEstadoB({ estado: 'suspendido' })

  for (const ruta of ['/clientes', '/articulos', '/categorias', '/facturas', '/dashboard', '/nfc', '/configuracion', '/usuarios']) {
    assert.equal((await t.api('GET', ruta, { token: adminB })).status, 200, `GET ${ruta} debe seguir funcionando`)
  }

  const nuevo = await crearCliente(facturadorB)
  assert.equal(nuevo.status, 403)
  assert.equal(nuevo.data.suscripcion_bloqueada, true)
  assert.equal(nuevo.data.motivo, 'suspendida')
  assert.match(nuevo.data.mensaje, /suspendida/i)

  assert.equal((await t.api('PUT', '/configuracion', { token: adminB, body: { moneda: 'USD' } })).status, 403)
  assert.equal((await t.api('POST', '/categorias', { token: adminB, body: { nombre: 'X' } })).status, 403)
  assert.equal((await t.api('POST', '/usuarios', { token: adminB, body: { nombre: 'x', email: 'x@x.com', password: '123456', rol_id: 2 } })).status, 403)
  assert.equal((await t.api('POST', '/facturas', { token: facturadorB, body: { cliente_id: 1, empresa_id: 1, items: [{}] } })).status, 403)
})

test('una empresa bloqueada tampoco pierde sus datos: lo creado antes sigue ahí', async () => {
  await fijarEstadoB({ estado: 'activo' })
  const creado = await crearCliente(facturadorB, 'Cliente previo al bloqueo')
  assert.equal(creado.status, 201)
  await fijarEstadoB({ estado: 'suspendido' })
  const lista = (await t.api('GET', '/clientes', { token: adminB })).data.data
  assert.ok(lista.some((c) => c.nombre === 'Cliente previo al bloqueo'))
})

test('el bloqueo de una empresa no afecta a otra', async () => {
  await fijarEstadoB({ estado: 'suspendido' })
  assert.equal((await crearCliente(adminA, 'Cliente de A')).status, 201)
})

test('el inicio de sesión sigue funcionando en una empresa bloqueada (entra en solo lectura)', async () => {
  await fijarEstadoB({ estado: 'cancelado' })
  const r = await t.sesionDe(B, 'admin')
  assert.ok(r.token)
})

test('al reactivar la empresa vuelve a poder escribir', async () => {
  await fijarEstadoB({ estado: 'suspendido' })
  assert.equal((await crearCliente(adminB)).status, 403)
  await fijarEstadoB({ estado: 'activo' })
  assert.equal((await crearCliente(adminB, 'Ya puede')).status, 201)
})

test('una empresa exenta nunca se bloquea', async () => {
  await fijarEstadoB({ estado: 'exento', sub_status: 'expirado', sub_fecha_fin: enDias(-90) })
  assert.equal((await crearCliente(adminB, 'Exenta')).status, 201)
})

// ── Vencimientos ──────────────────────────────────────────────

test('suscripción vencida hace 1 día: período de gracia, puede trabajar y se le avisa', async () => {
  await fijarEstadoB({ estado: 'activo', sub_status: 'activo', sub_fecha_fin: enDias(-1) })
  assert.equal((await crearCliente(adminB, 'En gracia')).status, 201)
  const s = (await t.api('GET', '/suscripcion/mi-suscripcion', { token: adminB })).data.data
  assert.equal(s.enGracia, true)
  assert.equal(s.bloqueado, false)
  assert.match(s.aviso, /gracia/i)
})

test('suscripción vencida hace 3 días: bloqueada', async () => {
  await fijarEstadoB({ estado: 'activo', sub_status: 'activo', sub_fecha_fin: enDias(-3) })
  const r = await crearCliente(adminB)
  assert.equal(r.status, 403)
  assert.equal(r.data.motivo, 'vencida')
})

test('prueba gratuita vencida hace más de 2 días: bloqueada con motivo de prueba', async () => {
  await fijarEstadoB({ estado: 'prueba', fecha_fin_prueba: enDias(-5) })
  const r = await crearCliente(adminB)
  assert.equal(r.status, 403)
  assert.equal(r.data.motivo, 'prueba_vencida')
})

test('plan de pago sin pagar y con el plazo vencido: bloqueada por pago requerido', async () => {
  await fijarEstadoB({ estado: 'pendiente_pago', fecha_fin_prueba: enDias(-1) })
  const r = await crearCliente(adminB)
  assert.equal(r.status, 403)
  assert.equal(r.data.motivo, 'pago_requerido')
})

test('plan de pago dentro del plazo: puede trabajar y ve cuántos días tiene para pagar', async () => {
  await fijarEstadoB({ estado: 'pendiente_pago', fecha_fin_prueba: enDias(4) })
  assert.equal((await crearCliente(adminB, 'Plazo de pago')).status, 201)
  const s = (await t.api('GET', '/suscripcion/mi-suscripcion', { token: adminB })).data.data
  assert.equal(s.diasRestantes, 4)
  assert.match(s.aviso, /pagar/)
})

// ── mi-suscripcion ────────────────────────────────────────────

test('mi-suscripcion devuelve el plan, el estado y los límites, aun con la empresa bloqueada', async () => {
  await fijarEstadoB({ estado: 'suspendido' })
  const r = await t.api('GET', '/suscripcion/mi-suscripcion', { token: visorB })
  assert.equal(r.status, 200)
  const s = r.data.data
  assert.equal(s.estado, 'suspendido')
  assert.equal(s.bloqueado, true)
  assert.equal(s.plan.slug, 'negocio')
  assert.equal(s.plan.max_usuarios, 5)
  assert.ok('precio_mensual' in s.plan)
})

test('mi-suscripcion no sirve a un token sin empresa', async () => {
  const sinEmpresa = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET)
  assert.equal((await t.api('GET', '/suscripcion/mi-suscripcion', { token: sinEmpresa })).status, 403)
  assert.equal((await t.api('GET', '/suscripcion/mi-suscripcion')).status, 401)
})

test('la empresa no puede cambiar su propio plan ni su estado desde la API', async () => {
  await fijarEstadoB({ estado: 'activo' })
  for (const [metodo, ruta] of [['PUT', '/suscripcion/mi-suscripcion'], ['POST', '/suscripcion/mi-suscripcion'], ['PATCH', '/suscripcion/mi-suscripcion']]) {
    const r = await t.api(metodo, ruta, { token: adminB, body: { estado: 'exento', plan_id: 4 } })
    assert.ok([404, 405].includes(r.status) || r.status === 403, `${metodo} ${ruta} respondió ${r.status}`)
  }
  const [[fila]] = await t.pool.query('SELECT estado FROM tenants WHERE id = ?', [B.tenantId])
  assert.equal(fila.estado, 'activo')
})
