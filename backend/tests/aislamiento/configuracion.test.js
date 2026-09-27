import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { iniciar } from '../helpers/contexto.js'

const UPLOADS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads')

let t, A, B, adminA, adminB
const logosCreados = []
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token
})
after(async () => {
  for (const f of logosCreados) fs.rmSync(path.join(UPLOADS, path.basename(f)), { force: true })
  await t.cerrar()
})

const config = async (token) => (await t.api('GET', '/configuracion', { token })).data.data

// ── Configuración ─────────────────────────────────────────────

test('configuración: cada empresa ve la suya, con su empresa emisora', async () => {
  const a = await config(adminA)
  const b = await config(adminB)
  assert.equal(a.empresa_nombre, 'Empresa Alfa')
  assert.equal(b.empresa_nombre, 'Empresa Beta')
  assert.notEqual(a.id, b.id)
})

test('configuración: B modifica sus parámetros fiscales y A no se entera', async () => {
  const r = await t.api('PUT', '/configuracion', {
    token: adminB, body: { empresa_nombre: 'Beta Renombrada', empresa_rnc: B.rnc, itbis_porcentaje: 16, factura_prefijo: 'BB' },
  })
  assert.equal(r.status, 200)
  const b = await config(adminB)
  assert.equal(b.empresa_nombre, 'Beta Renombrada')
  assert.equal(Number(b.itbis_porcentaje), 16)
  assert.equal(b.factura_prefijo, 'BB')

  const a = await config(adminA)
  assert.equal(a.empresa_nombre, 'Empresa Alfa')
  assert.equal(Number(a.itbis_porcentaje), 18)
  assert.equal(a.factura_prefijo, 'F')
})

test('configuración: dos empresas pueden tener el mismo RNC de empresa emisora en su configuración', async () => {
  const r = await t.api('PUT', '/configuracion', {
    token: adminB, body: { empresa_nombre: 'Beta', empresa_rnc: A.rnc },
  })
  assert.equal(r.status, 200)
})

test('configuración: el logo subido por A queda en la empresa de A y no en la de B', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  const form = new FormData()
  form.append('logo', new Blob([png], { type: 'image/png' }), 'logo.png')
  const res = await fetch(`${t.base}/configuracion/logo`, { method: 'POST', headers: { Authorization: `Bearer ${adminA}` }, body: form })
  const data = await res.json()
  assert.equal(res.status, 200)
  logosCreados.push(data.data.logo_path)

  assert.equal((await config(adminA)).logo_path, data.data.logo_path)
  assert.equal((await config(adminB)).logo_path, null)
})

// ── Métodos de pago ───────────────────────────────────────────

test('métodos de pago: B no ve los de A, y no puede editarlos ni eliminarlos (404)', async () => {
  const creado = await t.api('POST', '/metodos-pago', {
    token: adminA, body: { empresa_id: A.empresaId, tipo: 'transferencia', banco: 'Banco de Alfa', numero_cuenta: '123' },
  })
  assert.equal(creado.status, 201)
  const metodoA = creado.data.data

  assert.equal((await t.api('GET', '/metodos-pago', { token: adminB })).data.data.length, 0)
  assert.equal((await t.api('PUT', `/metodos-pago/${metodoA.id}`, { token: adminB, body: { tipo: 'efectivo' } })).status, 404)
  assert.equal((await t.api('DELETE', `/metodos-pago/${metodoA.id}`, { token: adminB })).status, 404)
  const [[fila]] = await t.pool.query('SELECT tipo, activo, tenant_id FROM metodos_pago WHERE id = ?', [metodoA.id])
  assert.equal(fila.tipo, 'transferencia')
  assert.equal(fila.activo, 1)
  assert.equal(fila.tenant_id, A.tenantId)
})

test('métodos de pago: B no puede asociar un método a la empresa emisora de A (400)', async () => {
  const r = await t.api('POST', '/metodos-pago', { token: adminB, body: { empresa_id: A.empresaId, tipo: 'efectivo' } })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /empresa/i)
})

// ── Secuencias NCF ────────────────────────────────────────────

test('NCF: cada empresa lista únicamente sus secuencias', async () => {
  const a = (await t.api('GET', '/nfc', { token: adminA })).data.data
  const b = (await t.api('GET', '/nfc', { token: adminB })).data.data
  assert.equal(a.length, 6)
  assert.equal(b.length, 6)
  const idsA = new Set(a.map((s) => s.id))
  assert.ok(b.every((s) => !idsA.has(s.id)))
  assert.ok(a.every((s) => s.tenant_id === A.tenantId))
})

test('NCF: registrar una secuencia B01 en A no desactiva la B01 de B', async () => {
  const r = await t.api('POST', '/nfc', { token: adminA, body: { tipo_ncf: 'B01', desde: 1, hasta: 100 } })
  assert.equal(r.status, 201)
  const b = (await t.api('GET', '/nfc/activas', { token: adminB })).data.data
  const b01 = b.find((s) => s.tipo_ncf === 'B01')
  assert.ok(b01, 'B debe seguir con su B01 activa')
  assert.equal(b01.hasta, 500)
})

test('NCF: B recibe 404 al editar una secuencia de A y esta no cambia', async () => {
  const secuenciaA = (await t.api('GET', '/nfc/activa?tipo=B02', { token: adminA })).data.data
  const r = await t.api('PUT', `/nfc/${secuenciaA.id}`, {
    token: adminB, body: { tipo_ncf: 'B02', desde: 1, hasta: 9, activo: 0 },
  })
  assert.equal(r.status, 404)
  const [[fila]] = await t.pool.query('SELECT hasta, activo FROM nfc_secuencias WHERE id = ?', [secuenciaA.id])
  assert.equal(fila.hasta, 500)
  assert.equal(fila.activo, 1)
})

test('NCF: la secuencia activa que devuelve cada empresa es la suya', async () => {
  const a = (await t.api('GET', '/nfc/activa?tipo=B02', { token: adminA })).data.data
  const b = (await t.api('GET', '/nfc/activa?tipo=B02', { token: adminB })).data.data
  assert.equal(a.tenant_id, A.tenantId)
  assert.equal(b.tenant_id, B.tenantId)
})
