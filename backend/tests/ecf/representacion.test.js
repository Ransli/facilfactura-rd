import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { prepararEmpresaEcf } from '../helpers/ecf.js'
import { iniciarSimulador } from '../../services/ecf/simuladorDgii.js'
import { procesarCola } from '../../services/ecf/cola.js'
import { urlDelQr } from '../../services/ecf/representacion.js'

// ── URL del código QR (pura) ──────────────────────────────────

const ecf = (extra = {}) => ({
  tipo_ecf: 31, encf: 'E310000000007', rnc_emisor: '131000001', rnc_comprador: '101000002', monto_total: '1180.00',
  fecha_emision: '2026-09-27', fecha_firma: '27-09-2026 10:15:30', codigo_seguridad: 'aB3dE9', ...extra,
})

test('el QR de un E31 apunta a la consulta de timbre con todos los datos', () => {
  const url = new URL(urlDelQr(ecf(), 'TesteCF'))
  assert.equal(url.origin + url.pathname, 'https://ecf.dgii.gov.do/testecf/ConsultaTimbre')
  assert.equal(url.searchParams.get('RncEmisor'), '131000001')
  assert.equal(url.searchParams.get('RncComprador'), '101000002')
  assert.equal(url.searchParams.get('ENCF'), 'E310000000007')
  assert.equal(url.searchParams.get('FechaEmision'), '27-09-2026')
  assert.equal(url.searchParams.get('MontoTotal'), '1180.00')
  assert.equal(url.searchParams.get('FechaFirma'), '27-09-2026 10:15:30')
  assert.equal(url.searchParams.get('CodigoSeguridad'), 'aB3dE9')
})

test('el QR de un E32 menor a RD$ 250,000 usa la consulta de factura de consumo, más corta', () => {
  const url = new URL(urlDelQr(ecf({ tipo_ecf: 32, encf: 'E320000000001', rnc_comprador: null, monto_total: '1180.00' }), 'TesteCF'))
  assert.equal(url.pathname, '/testecf/ConsultaTimbreFC')
  assert.deepEqual([...url.searchParams.keys()], ['RncEmisor', 'ENCF', 'MontoTotal', 'CodigoSeguridad'])
})

test('un E32 desde RD$ 250,000 usa la consulta de timbre completa', () => {
  const url = new URL(urlDelQr(ecf({ tipo_ecf: 32, encf: 'E320000000001', monto_total: '250000.00' }), 'CerteCF'))
  assert.equal(url.pathname, '/certecf/ConsultaTimbre')
})

test('cada ambiente tiene su ruta', () => {
  assert.match(urlDelQr(ecf(), 'eCF'), /^https:\/\/ecf\.dgii\.gov\.do\/ecf\/ConsultaTimbre\?/)
  assert.match(urlDelQr(ecf(), 'CerteCF'), /\/certecf\//)
})

// ── Representación impresa ────────────────────────────────────

let t, sim, A, B, adminB
before(async () => {
  t = await iniciar()
  sim = await iniciarSimulador()
  A = await prepararEmpresaEcf(t, 'Publicidad Alfa SRL')
  B = await prepararEmpresaEcf(t, 'Empresa Beta')
  adminB = B.admin
})
after(async () => { await sim.cerrar(); await t.cerrar() })

const html = async (token, id) => {
  const res = await fetch(`${t.base}/ecf/${id}/representacion`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: res.status, tipo: res.headers.get('content-type'), texto: await res.text() }
}
const emitir = async (empresa, tipo, extra) => {
  const r = await empresa.emitir(tipo, extra)
  assert.equal(r.status, 201, r.data?.mensaje)
  const [[fila]] = await t.pool.query('SELECT * FROM ecf_emitidos WHERE factura_id = ?', [r.data.data.id])
  return { factura: r.data.data, fila }
}

test('la representación del E31 muestra e-NCF, emisor, comprador, ítems, totales, QR y código de seguridad', async () => {
  const { factura, fila } = await emitir(A, 'E31')
  const r = await html(A.visor, fila.id)
  assert.equal(r.status, 200)
  assert.match(r.tipo, /text\/html/)
  const h = r.texto
  assert.match(h, /Factura de Crédito Fiscal Electrónica/)
  assert.ok(h.includes('E310000000001') || h.includes(fila.encf))
  assert.ok(h.includes('Publicidad Alfa SRL'))
  assert.ok(h.includes(A.rnc))
  assert.ok(h.includes('Calle Duarte 10, Santo Domingo'))
  assert.ok(h.includes('Cliente Beta SRL'))
  assert.ok(h.includes('101000002'))
  assert.ok(h.includes('Soporte técnico'))
  assert.ok(h.includes('27-09-2026'), 'fecha de emisión')
  assert.ok(h.includes('31-12-2030'), 'vencimiento de la secuencia')
  assert.ok(h.includes('1,000.00') && h.includes('180.00') && h.includes('1,180.00'))
  assert.ok(h.includes(factura.numero))
  assert.ok(h.includes(`Código de seguridad: ${fila.codigo_seguridad}`.replace(/&/g, '&amp;')) || h.includes(fila.codigo_seguridad))
  assert.match(h, /<img[^>]+src="data:image\/png;base64,[A-Za-z0-9+/=]{200,}"/)
  assert.match(h, /Fecha de firma digital:<\/span> \d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}/)
})

test('el código QR viene abajo a la izquierda, con el código de seguridad al lado', async () => {
  const { fila } = await emitir(A, 'E31')
  const h = (await html(A.admin, fila.id)).texto
  assert.match(h, /class="timbre"/)
  assert.ok(h.indexOf('class="qr"') < h.indexOf(fila.codigo_seguridad), 'el QR antes que el código')
  assert.match(h, /data-url="https:\/\/ecf\.dgii\.gov\.do\/testecf\/ConsultaTimbre\?/)
})

test('muestra las retenciones del E31 y el valor a pagar', async () => {
  const { fila } = await emitir(A, 'E31')
  const h = (await html(A.admin, fila.id)).texto
  assert.match(h, /Retención de ITBIS/)
  assert.match(h, /Retención de ISR/)
  assert.ok(h.includes('900.00'), 'valor a pagar 1,180 − 180 − 100')
})

test('el E32 no muestra retenciones ni vencimiento de secuencia, y usa la consulta corta', async () => {
  const { fila } = await emitir(A, 'E32', { cliente: 'consumidor' })
  const h = (await html(A.admin, fila.id)).texto
  assert.match(h, /Factura de Consumo Electrónica/)
  assert.ok(!/Retención de/.test(h))
  assert.ok(!/Vencimiento de la secuencia/i.test(h))
  assert.match(h, /ConsultaTimbreFC/)
  assert.ok(h.includes('Consumidor final') || h.includes('Ana Pérez'))
})

test('muestra el estado ante la DGII y se actualiza cuando la DGII responde', async () => {
  const { fila } = await emitir(A, 'E31')
  assert.match((await html(A.admin, fila.id)).texto, /Pendiente de envío/)
  await procesarCola(t.pool, { baseUrl: sim.url, ahora: new Date(Date.now() + 60_000) })
  assert.match((await html(A.admin, fila.id)).texto, /Aceptado por la DGII/)
})

test('un e-CF rechazado muestra el motivo', async () => {
  sim.config.resultado = 'rechazado'
  sim.config.motivo = 'RNC del comprador inexistente'
  const { fila } = await emitir(A, 'E31')
  await procesarCola(t.pool, { baseUrl: sim.url, ahora: new Date(Date.now() + 60_000) })
  const h = (await html(A.admin, fila.id)).texto
  assert.match(h, /Rechazado por la DGII/)
  assert.ok(h.includes('RNC del comprador inexistente'))
  sim.reiniciar()
})

test('el texto de la empresa y del cliente se escapa: no se puede inyectar HTML', async () => {
  const cliente = (await t.api('POST', '/clientes', {
    token: A.admin, body: { nombre: '<script>alert(1)</script> & Cía', rnc: '101000009', direccion: '"><img src=x onerror=alert(2)>' },
  })).data.data
  A.clientes.raro = cliente
  const { fila } = await emitir(A, 'E31', { cliente: 'raro' })
  const h = (await html(A.admin, fila.id)).texto
  assert.ok(!h.includes('<script>alert(1)'))
  assert.ok(!h.includes('<img src=x'))
  assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cía'))
})

test('las medidas de un artículo por área se ven en la línea', async () => {
  const { fila } = await emitir(A, 'E31', { items: [A.itemConDimensiones(2, 2, 1.5)] })
  const h = (await html(A.admin, fila.id)).texto
  assert.ok(h.includes('Lona impresa'))
  assert.ok(h.includes('2 x 1.5'))
  assert.ok(h.includes('1,500.00'))
})

test('sin sesión es 401; el e-CF de otra empresa es 404; uno inexistente también', async () => {
  const { fila } = await emitir(A, 'E31')
  assert.equal((await html(null, fila.id)).status, 401)
  assert.equal((await html(adminB, fila.id)).status, 404)
  assert.equal((await html(A.admin, 999999)).status, 404)
  assert.equal((await html(A.admin, 'abc')).status, 404)
})
