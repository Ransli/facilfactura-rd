import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { prepararEmpresaEcf } from '../helpers/ecf.js'
import { iniciarSimulador } from '../../services/ecf/simuladorDgii.js'
import { MAX_INTENTOS } from '../../services/ecf/cola.js'
import { verificarFirma } from '../../services/ecf/firma.js'

let t, sim, A, B, urlAnterior
before(async () => {
  t = await iniciar()
  sim = await iniciarSimulador()
  urlAnterior = process.env.DGII_URL_BASE
  process.env.DGII_URL_BASE = sim.url             // las rutas usan el cliente real, apuntado al simulador
  A = await prepararEmpresaEcf(t, 'Empresa Alfa')
  B = await prepararEmpresaEcf(t, 'Empresa Beta')
})
after(async () => {
  if (urlAnterior === undefined) delete process.env.DGII_URL_BASE
  else process.env.DGII_URL_BASE = urlAnterior
  await sim.cerrar()
  await t.cerrar()
})
beforeEach(async () => {
  sim.reiniciar()
  await t.pool.query('DELETE FROM ecf_emitidos')
  await t.pool.query('DELETE FROM ecf_configuracion')
})

const emitir = async (empresa, tipo = 'E31', extra) => {
  const r = await empresa.emitir(tipo, tipo === 'E32' ? { cliente: 'consumidor', ...extra } : extra)
  assert.equal(r.status, 201, r.data?.mensaje)
  return r.data.ecf.id
}
const crudo = (token, ruta) => fetch(`${t.base}${ruta}`, { headers: { Authorization: `Bearer ${token}` } })

// ── Listado y detalle ─────────────────────────────────────────

test('el listado muestra solo los e-CF de la empresa, con factura, cliente y estado', async () => {
  const id = await emitir(A)
  await emitir(B)
  const r = await t.api('GET', '/ecf', { token: A.visor })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.length, 1)
  const e = r.data.data[0]
  assert.equal(e.id, id)
  assert.equal(e.tipo_ecf, 31)
  assert.match(e.encf, /^E31\d{10}$/)
  assert.equal(e.estado, 'generado')
  assert.equal(e.cliente_nombre, 'Cliente Beta SRL')
  assert.match(e.factura_numero, /^F\d{6}$/)
  assert.ok(!('xml_firmado' in e), 'el listado no arrastra el XML')
})

test('el listado se filtra por estado y por tipo', async () => {
  await emitir(A, 'E31')
  await emitir(A, 'E32')
  await t.api('POST', '/ecf/procesar', { token: A.admin })
  await emitir(A, 'E31')
  assert.equal((await t.api('GET', '/ecf?estado=aceptado', { token: A.admin })).data.data.length, 2)
  assert.equal((await t.api('GET', '/ecf?estado=generado', { token: A.admin })).data.data.length, 1)
  assert.equal((await t.api('GET', '/ecf?tipo=32', { token: A.admin })).data.data.length, 1)
})

test('el detalle trae los datos del e-CF y el XML tiene su propia ruta, con la firma intacta', async () => {
  const id = await emitir(A)
  const d = await t.api('GET', `/ecf/${id}`, { token: A.admin })
  assert.equal(d.status, 200)
  assert.equal(d.data.data.id, id)
  assert.ok(!('xml_firmado' in d.data.data))

  const res = await crudo(A.admin, `/ecf/${id}/xml`)
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type'), /xml/)
  assert.match(res.headers.get('content-disposition'), new RegExp(`filename="${A.rnc}${d.data.data.encf}\\.xml"`))
  assert.equal(verificarFirma(await res.text()).valida, true)
})

test('el e-CF de otra empresa no se puede ver ni descargar', async () => {
  const id = await emitir(A)
  assert.equal((await t.api('GET', `/ecf/${id}`, { token: B.admin })).status, 404)
  assert.equal((await crudo(B.admin, `/ecf/${id}/xml`)).status, 404)
  assert.equal((await t.api('POST', `/ecf/${id}/reintentar`, { token: B.admin })).status, 404)
})

test('sin sesión es 401', async () => {
  assert.equal((await t.api('GET', '/ecf')).status, 401)
})

// ── Configuración (ambiente) ──────────────────────────────────

test('el ambiente por omisión es TesteCF y el administrador lo puede cambiar', async () => {
  assert.deepEqual((await t.api('GET', '/ecf/configuracion', { token: A.visor })).data.data, { ambiente: 'TesteCF' })
  const r = await t.api('PUT', '/ecf/configuracion', { token: A.admin, body: { ambiente: 'CerteCF' } })
  assert.equal(r.status, 200)
  assert.equal((await t.api('GET', '/ecf/configuracion', { token: A.admin })).data.data.ambiente, 'CerteCF')
  assert.equal((await t.api('GET', '/ecf/configuracion', { token: B.admin })).data.data.ambiente, 'TesteCF', 'no afecta a otra empresa')
})

test('un ambiente inválido se rechaza y solo el administrador cambia el ambiente', async () => {
  assert.equal((await t.api('PUT', '/ecf/configuracion', { token: A.admin, body: { ambiente: 'Produccion' } })).status, 400)
  assert.equal((await t.api('PUT', '/ecf/configuracion', { token: A.facturador, body: { ambiente: 'eCF' } })).status, 403)
})

// ── Procesar y reintentar ─────────────────────────────────────

test('procesar envía los e-CF pendientes de la empresa y solo de ella', async () => {
  const idA = await emitir(A)
  const idB = await emitir(B)
  const r = await t.api('POST', '/ecf/procesar', { token: A.admin })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.aceptados, 1)
  assert.equal((await t.api('GET', `/ecf/${idA}`, { token: A.admin })).data.data.estado, 'aceptado')
  assert.equal((await t.api('GET', `/ecf/${idB}`, { token: B.admin })).data.data.estado, 'generado', 'el de la otra empresa no se toca')
})

test('solo el administrador procesa la cola o reintenta', async () => {
  const id = await emitir(A)
  assert.equal((await t.api('POST', '/ecf/procesar', { token: A.facturador })).status, 403)
  assert.equal((await t.api('POST', `/ecf/${id}/reintentar`, { token: A.visor })).status, 403)
})

test('reintentar un e-CF en error lo vuelve a enviar y lo deja aceptado', async () => {
  sim.config.caido = true
  const id = await emitir(A)
  await t.pool.query(
    `UPDATE ecf_emitidos SET estado = 'error', intentos = ?, proximo_intento = NULL, mensaje_dgii = 'No se pudo completar' WHERE id = ?`, [MAX_INTENTOS, id])
  sim.config.caido = false
  const r = await t.api('POST', `/ecf/${id}/reintentar`, { token: A.admin })
  assert.equal(r.status, 200, r.data?.mensaje)
  assert.equal(r.data.data.estado, 'aceptado')
})

test('un e-CF rechazado o aceptado no se puede reintentar: se explica por qué', async () => {
  sim.config.resultado = 'rechazado'
  const id = await emitir(A)
  await t.api('POST', '/ecf/procesar', { token: A.admin })
  const r = await t.api('POST', `/ecf/${id}/reintentar`, { token: A.admin })
  assert.equal(r.status, 409)
  assert.match(r.data.mensaje, /rechaz|aceptad/i)
  assert.equal(sim.recibidos.length, 1)
})

test('una empresa suspendida puede consultar sus e-CF pero no reintentar ni cambiar el ambiente', async () => {
  const id = await emitir(B)
  await t.pool.query("UPDATE tenants SET estado = 'suspendido' WHERE id = ?", [B.tenantId])
  try {
    assert.equal((await t.api('GET', '/ecf', { token: B.admin })).status, 200)
    assert.equal((await crudo(B.admin, `/ecf/${id}/representacion`)).status, 200)
    assert.equal((await t.api('POST', `/ecf/${id}/reintentar`, { token: B.admin })).status, 403)
    assert.equal((await t.api('PUT', '/ecf/configuracion', { token: B.admin, body: { ambiente: 'eCF' } })).status, 403)
  } finally {
    await t.pool.query("UPDATE tenants SET estado = 'activo' WHERE id = ?", [B.tenantId])
  }
})
