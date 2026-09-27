import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from '../helpers/contexto.js'
import { hoyRD } from '../../services/suscripcion/estado.js'
import { sumarDias } from '../../services/suscripcion/fechas.js'

let t, A, B, planes
before(async () => {
  t = await iniciar()
  A = await registrar('Empresa Alfa SRL', '140-00000-1')
  B = await registrar('Empresa Beta SRL', '140-00000-2')
  const [filas] = await t.pool.query('SELECT id, slug FROM planes')
  planes = Object.fromEntries(filas.map((p) => [p.slug, p.id]))
})
after(async () => { await t.cerrar() })

async function registrar(nombre, rnc) {
  const r = await t.api('POST', '/registro/empresa', {
    body: { nombre, rnc, correo: `${rnc}@x.do`, telefono: '809-555-0100', direccion: 'Calle 1' },
  })
  const [[tenant]] = await t.pool.query('SELECT id FROM tenants WHERE nombre = ?', [nombre])
  return { token: r.data.token_registro, tenantId: tenant.id }
}
const elegir = (token, cuerpo) => t.api('POST', '/registro/plan', { token, body: cuerpo })
const tenantDe = async (id) => (await t.pool.query('SELECT * FROM tenants WHERE id = ?', [id]))[0][0]
const fechaDe = (v) => (v instanceof Date ? v.toLocaleDateString('en-CA') : String(v).slice(0, 10))

test('paso 2: elegir el plan de pago deja la empresa pendiente de pago con 5 días para pagar', async () => {
  const r = await elegir(A.token, { plan_id: planes.negocio })
  assert.equal(r.status, 200)
  assert.equal(r.data.estado, 'pendiente_pago')
  assert.equal(r.data.dias_para_pagar, 5)
  assert.equal(r.data.fecha_limite, sumarDias(hoyRD(), 5))
  assert.equal(r.data.plan.slug, 'negocio')
  assert.equal(r.data.plan.precio_mensual, 2490)

  const tenant = await tenantDe(A.tenantId)
  assert.equal(tenant.plan_id, planes.negocio)
  assert.equal(tenant.estado, 'pendiente_pago')
})

test('paso 2: se puede volver a elegir plan antes de terminar el alta', async () => {
  const r = await elegir(A.token, { plan_id: planes.prueba })
  assert.equal(r.status, 200)
  assert.equal(r.data.estado, 'prueba')
  assert.equal(r.data.fecha_limite, sumarDias(hoyRD(), 30))
  assert.equal(r.data.dias_para_pagar, null)
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM tenant_subscriptions WHERE tenant_id = ?', [A.tenantId])
  assert.equal(n, 1, 'se actualiza la suscripción, no se duplica')
})

test('paso 2: un plan inexistente o inactivo da 400 y no cambia nada', async () => {
  const antes = await tenantDe(A.tenantId)
  assert.equal((await elegir(A.token, { plan_id: 999999 })).status, 400)
  assert.equal((await elegir(A.token, {})).status, 400)
  await t.pool.query('UPDATE planes SET activo = 0 WHERE id = ?', [planes.emprendedor])
  const inactivo = await elegir(A.token, { plan_id: planes.emprendedor })
  await t.pool.query('UPDATE planes SET activo = 1 WHERE id = ?', [planes.emprendedor])
  assert.equal(inactivo.status, 400)
  assert.equal((await tenantDe(A.tenantId)).plan_id, antes.plan_id)
})

// ── Seguridad del token de registro ───────────────────────────

test('paso 2: sin token de registro responde 401', async () => {
  assert.equal((await elegir(undefined, { plan_id: planes.negocio })).status, 401)
})

test('paso 2: un token cualquiera o falsificado responde 401', async () => {
  assert.equal((await elegir('esto.no.es.un.token', { plan_id: planes.negocio })).status, 401)
  const falso = jwt.sign({ tenant_id: B.tenantId, fase: 'registro' }, 'otra-clave', { expiresIn: '2h' })
  assert.equal((await elegir(falso, { plan_id: planes.negocio })).status, 401)
})

test('paso 2: el token de una sesión normal no sirve para el registro', async () => {
  const { token } = await t.sesion('admin')                       // sesión de la empresa 1
  assert.equal((await elegir(token, { plan_id: planes.negocio })).status, 401)
})

test('paso 2: un token de registro vencido responde 401', async () => {
  const vencido = jwt.sign({ tenant_id: B.tenantId, fase: 'registro' }, `${process.env.JWT_SECRET}:registro`, { expiresIn: -10 })
  assert.equal((await elegir(vencido, { plan_id: planes.negocio })).status, 401)
})

test('paso 2: un token con la clave de registro pero sin la fase de registro responde 401', async () => {
  const otro = jwt.sign({ tenant_id: B.tenantId, fase: 'otra' }, `${process.env.JWT_SECRET}:registro`, { expiresIn: '2h' })
  assert.equal((await elegir(otro, { plan_id: planes.negocio })).status, 401)
})

test('paso 2: el token de una empresa no puede cambiar el plan de otra, aunque mande su tenant_id', async () => {
  const antes = await tenantDe(B.tenantId)
  const r = await elegir(A.token, { plan_id: planes.empresarial, tenant_id: B.tenantId })
  assert.equal(r.status, 200)
  assert.equal((await tenantDe(B.tenantId)).plan_id, antes.plan_id, 'el plan de B no debe cambiar')
  assert.equal((await tenantDe(A.tenantId)).plan_id, planes.empresarial)
})

test('paso 2: el token de registro no sirve en las rutas de negocio', async () => {
  for (const ruta of ['/clientes', '/facturas', '/configuracion', '/suscripcion/mi-suscripcion']) {
    assert.equal((await t.api('GET', ruta, { token: A.token })).status, 401, ruta)
  }
})
