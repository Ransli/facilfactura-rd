import '../helpers/entorno.js'
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { crearCertificadoDePrueba } from '../helpers/certificados.js'
import { construirXml } from '../../services/ecf/xml.js'
import { firmarXml } from '../../services/ecf/firma.js'
import { crearClienteDgii, ErrorDeDgii } from '../../services/ecf/clienteDgii.js'
import { iniciarSimulador } from '../../services/ecf/simuladorDgii.js'

let sim, cert, cliente
before(async () => {
  sim = await iniciarSimulador()
  cert = crearCertificadoDePrueba()
})
after(async () => { await sim.cerrar() })
beforeEach(() => {
  sim.reiniciar()
  cliente = crearCliente()
})

const crearCliente = (extra = {}) => crearClienteDgii({
  baseUrl: sim.url, ambiente: 'TesteCF', credenciales: { clavePem: cert.clavePem, certificadoPem: cert.certificadoPem }, ...extra,
})

let secuencia = 0
function ecfFirmado({ encf } = {}) {
  secuencia += 1
  const xml = construirXml({
    tipo: 32, encf: encf || `E32${String(secuencia).padStart(10, '0')}`, fechaEmision: '2026-09-27', fechaHoraFirma: '27-09-2026 10:00:00',
    emisor: { rnc: '131000001', razonSocial: 'Empresa Alfa', direccion: 'Calle 1' }, comprador: {}, tasaItbis: 18,
    items: [{ nombre: 'Servicio', cantidad: 1, precioUnitario: 1000, monto: 1000, esServicio: true }],
  })
  return firmarXml(xml, { clavePem: cert.clavePem, certificadoPem: cert.certificadoPem })
}

// ── Envío y consulta ──────────────────────────────────────────

test('se autentica con la semilla firmada, envía el e-CF y recibe su TrackID', async () => {
  const xml = ecfFirmado({ encf: 'E320000000001' })
  const { trackId } = await cliente.enviarEcf(xml, '131000001E320000000001.xml')
  assert.ok(trackId)
  assert.equal(sim.autenticaciones(), 1)
  assert.equal(sim.recibidos.length, 1)
  assert.equal(sim.recibidos[0].encf, 'E320000000001')
  assert.equal(sim.recibidos[0].rncEmisor, '131000001')
  assert.equal(sim.recibidos[0].archivo, '131000001E320000000001.xml')
})

test('la consulta de estado devuelve aceptado', async () => {
  const { trackId } = await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  const r = await cliente.consultarEstado(trackId)
  assert.equal(r.estado, 'aceptado')
  assert.deepEqual(r.mensajes, [])
})

test('un e-CF aceptado condicional se distingue y trae sus observaciones', async () => {
  sim.config.resultado = 'aceptado_condicional'
  sim.config.motivo = 'Dirección del comprador incompleta'
  const { trackId } = await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  const r = await cliente.consultarEstado(trackId)
  assert.equal(r.estado, 'aceptado_condicional')
  assert.deepEqual(r.mensajes, ['Dirección del comprador incompleta'])
})

test('un e-CF rechazado trae el motivo de la DGII', async () => {
  sim.config.resultado = 'rechazado'
  sim.config.motivo = 'El RNC del comprador no existe'
  const { trackId } = await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  const r = await cliente.consultarEstado(trackId)
  assert.equal(r.estado, 'rechazado')
  assert.deepEqual(r.mensajes, ['El RNC del comprador no existe'])
})

test('mientras la DGII lo procesa la consulta devuelve en_proceso', async () => {
  sim.config.consultasEnProceso = 2
  const { trackId } = await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  assert.equal((await cliente.consultarEstado(trackId)).estado, 'en_proceso')
  assert.equal((await cliente.consultarEstado(trackId)).estado, 'en_proceso')
  assert.equal((await cliente.consultarEstado(trackId)).estado, 'aceptado')
})

test('un TrackID que la DGII no conoce se trata como en proceso (puede tardar en aparecer)', async () => {
  assert.equal((await cliente.consultarEstado('no-existe')).estado, 'en_proceso')
})

// ── Token ─────────────────────────────────────────────────────

test('el token se reutiliza entre llamadas', async () => {
  const { trackId } = await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  await cliente.consultarEstado(trackId)
  await cliente.enviarEcf(ecfFirmado(), 'b.xml')
  assert.equal(sim.autenticaciones(), 1)
})

test('si la DGII ya no reconoce el token, el cliente se autentica de nuevo y reintenta una vez', async () => {
  await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  sim.olvidarTokens()
  const { trackId } = await cliente.enviarEcf(ecfFirmado(), 'b.xml')
  assert.ok(trackId)
  assert.equal(sim.autenticaciones(), 2)
})

test('un token vencido según la respuesta de la DGII se renueva antes de usarse', async () => {
  sim.config.duracionTokenMs = -1000
  await cliente.enviarEcf(ecfFirmado(), 'a.xml')
  await cliente.enviarEcf(ecfFirmado(), 'b.xml')
  assert.equal(sim.autenticaciones(), 2)
})

test('la semilla exige una firma válida: sin ella la DGII no da token', async () => {
  const semilla = await fetch(`${sim.url}/testecf/autenticacion/api/autenticacion/semilla`).then((r) => r.text())
  const form = new FormData()
  form.append('xml', new Blob([semilla], { type: 'text/xml' }), 'semilla.xml')
  const r = await fetch(`${sim.url}/testecf/autenticacion/api/autenticacion/validacioncertificado`, { method: 'POST', body: form })
  assert.equal(r.status, 401)
})

// ── Rechazos inmediatos ───────────────────────────────────────

test('un XML alterado después de firmar se rechaza al recibirlo, y no es un error transitorio', async () => {
  const alterado = ecfFirmado().replace('<MontoTotal>1180.00', '<MontoTotal>1.00')
  await assert.rejects(cliente.enviarEcf(alterado, 'a.xml'),
    (e) => e instanceof ErrorDeDgii && e.transitorio === false && /firma/i.test(e.message))
})

test('un e-NCF repetido se rechaza como duplicado', async () => {
  const xml = ecfFirmado({ encf: 'E320000000099' })
  await cliente.enviarEcf(xml, 'a.xml')
  await assert.rejects(cliente.enviarEcf(ecfFirmado({ encf: 'E320000000099' }), 'b.xml'),
    (e) => e instanceof ErrorDeDgii && e.transitorio === false && /ya fue recibido/i.test(e.message))
})

// ── Fallas de comunicación ────────────────────────────────────

test('con la DGII caída (503) el error es transitorio', async () => {
  sim.config.caido = true
  await assert.rejects(cliente.enviarEcf(ecfFirmado(), 'a.xml'),
    (e) => e instanceof ErrorDeDgii && e.transitorio === true && e.estadoHttp === 503)
  await assert.rejects(cliente.consultarEstado('x'), (e) => e instanceof ErrorDeDgii && e.transitorio === true)
})

test('sin conexión (nadie escucha) el error es transitorio', async () => {
  const otro = await iniciarSimulador()
  const url = otro.url
  await otro.cerrar()
  const c = crearCliente({ baseUrl: url })
  await assert.rejects(c.enviarEcf(ecfFirmado(), 'a.xml'), (e) => e instanceof ErrorDeDgii && e.transitorio === true)
})

test('una respuesta que tarda más del tiempo permitido es un error transitorio', async () => {
  sim.config.latenciaMs = 300
  const c = crearCliente({ timeoutMs: 80 })
  await assert.rejects(c.enviarEcf(ecfFirmado(), 'a.xml'), (e) => e instanceof ErrorDeDgii && e.transitorio === true && /tard/i.test(e.message))
})

test('al recuperarse la DGII el mismo cliente vuelve a funcionar', async () => {
  sim.config.caido = true
  await assert.rejects(cliente.enviarEcf(ecfFirmado(), 'a.xml'))
  sim.config.caido = false
  assert.ok((await cliente.enviarEcf(ecfFirmado(), 'b.xml')).trackId)
})

// ── Ambiente y URL ────────────────────────────────────────────

test('cada ambiente usa su propia ruta en la DGII', async () => {
  for (const [ambiente, ruta] of [['TesteCF', 'testecf'], ['CerteCF', 'certecf'], ['eCF', 'ecf']]) {
    sim.reiniciar()
    await crearCliente({ ambiente }).enviarEcf(ecfFirmado(), 'a.xml')
    assert.ok(sim.rutas.every((r) => r.startsWith(`/${ruta}/`)), `${ambiente}: ${sim.rutas.join(', ')}`)
  }
})

test('un ambiente desconocido es un error de configuración', () => {
  assert.throws(() => crearCliente({ ambiente: 'Produccion' }), /ambiente/i)
})

test('sin baseUrl usa DGII_URL_BASE del entorno', async () => {
  const anterior = process.env.DGII_URL_BASE
  process.env.DGII_URL_BASE = sim.url
  try {
    const c = crearClienteDgii({ ambiente: 'TesteCF', credenciales: { clavePem: cert.clavePem, certificadoPem: cert.certificadoPem } })
    assert.ok((await c.enviarEcf(ecfFirmado(), 'a.xml')).trackId)
  } finally {
    if (anterior === undefined) delete process.env.DGII_URL_BASE
    else process.env.DGII_URL_BASE = anterior
  }
})
