import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from '../helpers/contexto.js'

let t, A, admin
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  admin = (await t.sesionDe(A, 'admin')).token
})
after(async () => { await t.cerrar() })

// Token con solo_lectura:true, como el que emite la consola master al "ver como empresa"
const tokenSoloLectura = () => jwt.sign(
  { id: 1, tenant_id: A.tenantId, rol: 'admin', solo_lectura: true }, process.env.JWT_SECRET, { expiresIn: '2h' })

test('un token normal (sin solo_lectura) escribe con normalidad', async () => {
  const r = await t.api('POST', '/clientes', { token: admin, body: { nombre: 'Cliente normal' } })
  assert.equal(r.status, 201)
})

test('un token de solo lectura puede consultar pero no crear, editar ni borrar', async () => {
  const token = tokenSoloLectura()
  assert.equal((await t.api('GET', '/clientes', { token })).status, 200)

  const crear = await t.api('POST', '/clientes', { token, body: { nombre: 'No debería crearse' } })
  assert.equal(crear.status, 403)
  assert.equal(crear.data.solo_lectura, true)
  assert.match(crear.data.mensaje, /solo lectura/i)

  assert.equal((await t.api('PUT', '/configuracion', { token, body: { moneda: 'USD' } })).status, 403)
})

test('el solo_lectura no se mezcla entre empresas: sigue aislado por tenant_id', async () => {
  const B = await t.crearEmpresa('Empresa Beta')
  const token = jwt.sign({ id: 1, tenant_id: A.tenantId, rol: 'admin', solo_lectura: true }, process.env.JWT_SECRET)
  const r = await t.api('GET', '/clientes', { token, body: undefined })
  // No debe poder colarse tenant_id de B por query/body
  const intento = await fetch(`${t.base}/clientes?tenant_id=${B.tenantId}`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(intento.status, 403)
  assert.equal(r.status, 200)
})
