import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'

let t, A, B, adminA, adminB, planPequeno, planIlimitado
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token

  // Plan de prueba con límites pequeños: 4 usuarios (crearEmpresa ya trae 3) y 5 clientes
  const [p1] = await t.pool.query(
    `INSERT INTO planes (nombre, slug, precio_mensual, max_usuarios, max_clientes, max_ecf_mes, es_plan_prueba, orden)
     VALUES ('Pequeño de prueba', 'pequeno-test', 1, 4, 5, 10, 0, 90)`)
  const [p2] = await t.pool.query(
    `INSERT INTO planes (nombre, slug, precio_mensual, max_usuarios, max_clientes, max_ecf_mes, es_plan_prueba, orden)
     VALUES ('Ilimitado de prueba', 'ilimitado-test', 2, -1, -1, -1, 0, 91)`)
  planPequeno = p1.insertId
  planIlimitado = p2.insertId
})
after(async () => {
  await t.pool.query('UPDATE tenants SET plan_id = (SELECT id FROM planes WHERE slug = ?) WHERE id IN (?, ?)', ['negocio', A.tenantId, B.tenantId])
  await t.pool.query('DELETE FROM planes WHERE id IN (?, ?)', [planPequeno, planIlimitado])
  await t.cerrar()
})

const usarPlan = (tenantId, planId) => t.pool.query('UPDATE tenants SET plan_id = ? WHERE id = ?', [planId, tenantId])
const nuevoUsuario = (token, n) => t.api('POST', '/usuarios', {
  token, body: { nombre: `Empleado ${n}`, email: `empleado${n}-${Math.random().toString(36).slice(2, 8)}@x.test`, password: 'abc123', rol_id: 2 },
})
const nuevoCliente = (token, n) => t.api('POST', '/clientes', { token, body: { nombre: `Cliente ${n}` } })

// ── Usuarios ──────────────────────────────────────────────────

test('un plan con máximo de usuarios impide crear el que lo excede, con un mensaje claro', async () => {
  await usarPlan(B.tenantId, planPequeno)
  const cuarto = await nuevoUsuario(adminB, 4)              // 3 existentes + 1 = 4 (el máximo)
  assert.equal(cuarto.status, 201)

  const quinto = await nuevoUsuario(adminB, 5)
  assert.equal(quinto.status, 403)
  assert.equal(quinto.data.limite_alcanzado, true)
  assert.equal(quinto.data.recurso, 'usuarios')
  assert.equal(quinto.data.actual, 4)
  assert.equal(quinto.data.max, 4)
  assert.match(quinto.data.mensaje, /límite/i)
})

test('los usuarios desactivados no cuentan para el límite', async () => {
  const lista = (await t.api('GET', '/usuarios', { token: adminB })).data.data
  const otro = lista.find((u) => u.rol === 'visor')
  assert.equal((await t.api('DELETE', `/usuarios/${otro.id}`, { token: adminB })).status, 200)
  assert.equal((await nuevoUsuario(adminB, 6)).status, 201)
})

test('el uso de una empresa no cuenta para otra', async () => {
  // A tiene el plan «negocio» (5 usuarios) y solo 3 usuarios: puede crear más aunque B esté al límite
  assert.equal((await nuevoUsuario(adminA, 1)).status, 201)
})

// ── Clientes ──────────────────────────────────────────────────

test('un plan con máximo de clientes impide crear el que lo excede', async () => {
  await usarPlan(B.tenantId, planPequeno)
  for (let i = 1; i <= 5; i++) assert.equal((await nuevoCliente(adminB, i)).status, 201)
  const sexto = await nuevoCliente(adminB, 6)
  assert.equal(sexto.status, 403)
  assert.equal(sexto.data.limite_alcanzado, true)
  assert.equal(sexto.data.recurso, 'clientes')
  assert.equal(sexto.data.max, 5)
})

test('los clientes eliminados (inactivos) no cuentan para el límite', async () => {
  const uno = (await t.api('GET', '/clientes', { token: adminB })).data.data[0]
  await t.api('DELETE', `/clientes/${uno.id}`, { token: adminB })
  assert.equal((await nuevoCliente(adminB, 7)).status, 201)
})

test('un plan ilimitado (-1) no impone tope', async () => {
  await usarPlan(B.tenantId, planIlimitado)
  for (let i = 8; i <= 12; i++) assert.equal((await nuevoCliente(adminB, i)).status, 201)
  assert.equal((await nuevoUsuario(adminB, 20)).status, 201)
})

test('editar un cliente existente no consume cupo aunque la empresa esté en su límite', async () => {
  await usarPlan(B.tenantId, planPequeno)     // ahora tiene más clientes que el máximo
  const uno = (await t.api('GET', '/clientes', { token: adminB })).data.data[0]
  const r = await t.api('PUT', `/clientes/${uno.id}`, { token: adminB, body: { nombre: 'Editado' } })
  assert.equal(r.status, 200)
})

// ── Consulta de límites ───────────────────────────────────────

test('GET /suscripcion/limites informa el uso y el máximo de cada recurso', async () => {
  await usarPlan(A.tenantId, planPequeno)
  const r = await t.api('GET', '/suscripcion/limites', { token: adminA })
  assert.equal(r.status, 200)
  const d = r.data.data
  assert.equal(d.plan.slug, 'pequeno-test')
  assert.equal(d.usuarios.max, 4)
  assert.equal(d.usuarios.actual, 4)          // 3 de crearEmpresa + 1 creado arriba
  assert.equal(d.usuarios.porcentaje, 100)
  assert.equal(d.usuarios.al_limite, true)
  assert.equal(d.clientes.max, 5)
  assert.equal(d.clientes.actual, 0)
  assert.equal(d.clientes.cerca_del_limite, false)
  assert.equal(d.ecf_mes.max, 10)
})

test('con un 80 % de uso o más se marca cerca_del_limite', async () => {
  for (let i = 1; i <= 4; i++) await nuevoCliente(adminA, i)      // 4 de 5 = 80 %
  const d = (await t.api('GET', '/suscripcion/limites', { token: adminA })).data.data
  assert.equal(d.clientes.actual, 4)
  assert.equal(d.clientes.porcentaje, 80)
  assert.equal(d.clientes.cerca_del_limite, true)
  assert.equal(d.clientes.al_limite, false)
})

test('un plan ilimitado se informa con max -1 y sin porcentaje', async () => {
  await usarPlan(A.tenantId, planIlimitado)
  const d = (await t.api('GET', '/suscripcion/limites', { token: adminA })).data.data
  assert.equal(d.clientes.max, -1)
  assert.equal(d.clientes.porcentaje, null)
  assert.equal(d.clientes.al_limite, false)
})
