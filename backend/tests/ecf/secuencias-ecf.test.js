import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { validarSecuenciaElectronica } from '../../services/ecf/secuencias.js'

// ── Validación (pura) ─────────────────────────────────────────

test('los comprobantes en papel (B..) no se validan aquí: siguen como siempre', () => {
  assert.equal(validarSecuenciaElectronica({ tipo_ncf: 'B01', desde: 1, hasta: 500 }), null)
  assert.equal(validarSecuenciaElectronica({ tipo_ncf: 'B15', desde: 1, hasta: 50 }), null)
})

test('E31, E32 y E34 son los únicos tipos electrónicos admitidos', () => {
  for (const tipo of ['E31', 'E32', 'E34']) {
    assert.equal(validarSecuenciaElectronica({ tipo_ncf: tipo, desde: 1, hasta: 100, fecha_vencimiento: '2030-12-31' }), null, tipo)
  }
  for (const tipo of ['E33', 'E41', 'E99', 'E3', 'E310']) {
    assert.match(validarSecuenciaElectronica({ tipo_ncf: tipo, desde: 1, hasta: 100, fecha_vencimiento: '2030-12-31' }), /E31, E32 y E34/, tipo)
  }
})

test('la fecha de vencimiento de la secuencia es obligatoria en E31 (la exige el XML) y opcional en E32 y E34', () => {
  assert.match(validarSecuenciaElectronica({ tipo_ncf: 'E31', desde: 1, hasta: 100 }), /vencimiento/i)
  assert.equal(validarSecuenciaElectronica({ tipo_ncf: 'E32', desde: 1, hasta: 100 }), null)
  assert.equal(validarSecuenciaElectronica({ tipo_ncf: 'E34', desde: 1, hasta: 100 }), null)
})

test('el rango debe caber en los 10 dígitos del e-NCF', () => {
  assert.equal(validarSecuenciaElectronica({ tipo_ncf: 'E32', desde: 1, hasta: 9999999999 }), null)
  assert.match(validarSecuenciaElectronica({ tipo_ncf: 'E32', desde: 1, hasta: 10000000000 }), /10 dígitos/)
  assert.match(validarSecuenciaElectronica({ tipo_ncf: 'E32', desde: 0, hasta: 10 }), /desde/)
  assert.match(validarSecuenciaElectronica({ tipo_ncf: 'E32', desde: 1.5, hasta: 10 }), /enteros/)
})

// ── A través de la API ────────────────────────────────────────

let t, A, B, adminA, adminB, facturadorA
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token
  facturadorA = (await t.sesionDe(A, 'facturador')).token
})
after(async () => { await t.cerrar() })

const registrar = (token, body) => t.api('POST', '/nfc', { token, body })

test('el administrador registra una secuencia E31 y queda activa', async () => {
  const r = await registrar(adminA, { tipo_ncf: 'E31', descripcion: 'Crédito fiscal electrónico', desde: 1, hasta: 200, fecha_vencimiento: '2030-12-31' })
  assert.equal(r.status, 201)
  assert.equal(r.data.data.tipo_ncf, 'E31')
  assert.equal(r.data.data.activo, 1)
})

test('la API rechaza un E31 sin vencimiento, un tipo E99 y un rango de más de 10 dígitos', async () => {
  assert.equal((await registrar(adminA, { tipo_ncf: 'E31', desde: 1, hasta: 10 })).status, 400)
  assert.equal((await registrar(adminA, { tipo_ncf: 'E99', desde: 1, hasta: 10 })).status, 400)
  assert.equal((await registrar(adminA, { tipo_ncf: 'E32', desde: 1, hasta: 10000000000 })).status, 400)
})

test('registrar otro E32 jubila al anterior de esa empresa, sin tocar el E31 ni a la otra empresa', async () => {
  await registrar(adminA, { tipo_ncf: 'E32', desde: 1, hasta: 100 })
  await registrar(adminB, { tipo_ncf: 'E32', desde: 1, hasta: 100 })
  await registrar(adminA, { tipo_ncf: 'E32', desde: 101, hasta: 200 })
  const activas = (await t.api('GET', '/nfc/activas', { token: adminA })).data.data.filter((s) => s.tipo_ncf.startsWith('E'))
  assert.deepEqual(activas.map((s) => s.tipo_ncf).sort(), ['E31', 'E32'])
  assert.equal(activas.find((s) => s.tipo_ncf === 'E32').desde, 101)
  const deB = (await t.api('GET', '/nfc/activas', { token: adminB })).data.data.filter((s) => s.tipo_ncf.startsWith('E'))
  assert.deepEqual(deB.map((s) => [s.tipo_ncf, s.desde]), [['E32', 1]])
})

test('editar una secuencia a un tipo electrónico inválido también se rechaza', async () => {
  const [{ id }] = (await t.api('GET', '/nfc/activas', { token: adminA })).data.data.filter((s) => s.tipo_ncf === 'E31')
  const r = await t.api('PUT', `/nfc/${id}`, { token: adminA, body: { tipo_ncf: 'E77', desde: 1, hasta: 100, fecha_vencimiento: '2030-12-31' } })
  assert.equal(r.status, 400)
  const ok = await t.api('PUT', `/nfc/${id}`, { token: adminA, body: { tipo_ncf: 'E31', desde: 1, hasta: 300, fecha_vencimiento: '2031-06-30' } })
  assert.equal(ok.status, 200)
})

test('solo el administrador registra secuencias', async () => {
  assert.equal((await registrar(facturadorA, { tipo_ncf: 'E32', desde: 1, hasta: 10 })).status, 403)
})
