import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'
import { iniciar } from '../helpers/contexto.js'
import { prepararEmpresaEcf, contadores } from '../helpers/ecf.js'
import { iniciarSimulador } from '../../services/ecf/simuladorDgii.js'
import { verificarFirma } from '../../services/ecf/firma.js'
import { hoyRD } from '../../services/suscripcion/estado.js'
import { sumarDias } from '../../services/suscripcion/fechas.js'

let t, sim, A, B, urlAnterior
before(async () => {
  t = await iniciar()
  sim = await iniciarSimulador()
  urlAnterior = process.env.DGII_URL_BASE
  process.env.DGII_URL_BASE = sim.url
  A = await prepararEmpresaEcf(t, 'Empresa Alfa')
  B = await prepararEmpresaEcf(t, 'Empresa Beta')
})
after(async () => {
  if (urlAnterior === undefined) delete process.env.DGII_URL_BASE
  else process.env.DGII_URL_BASE = urlAnterior
  await sim.cerrar()
  await t.cerrar()
})
beforeEach(() => sim.reiniciar())

const texto = (xml, ruta) => xpath.select(`string(${ruta})`, new DOMParser().parseFromString(xml, 'text/xml'))
const dd = (iso) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`

/** Emite un e-CF y lo deja aceptado por la DGII (simulada). Devuelve { facturaId, ecfId, encf }. */
async function emitirAceptado(empresa = A, tipo = 'E31', extra = {}) {
  const r = await empresa.emitir(tipo, tipo === 'E32' ? { cliente: 'consumidor', ...extra } : extra)
  assert.equal(r.status, 201, r.data?.mensaje)
  const p = await t.api('POST', '/ecf/procesar', { token: empresa.admin })
  assert.equal(p.status, 200)
  return { facturaId: r.data.data.id, ecfId: r.data.ecf.id, encf: r.data.ecf.encf }
}
const anular = (empresa, ecfId, body = {}) => t.api('POST', `/ecf/${ecfId}/nota-credito`, { token: empresa.admin, body })
const filaEcf = async (id) => (await t.pool.query('SELECT * FROM ecf_emitidos WHERE id = ?', [id]))[0][0]

// ── Camino feliz ──────────────────────────────────────────────

test('una nota de crédito anula un e-CF aceptado: nuevo e-NCF E34, XML firmado con la referencia y factura anulada', async () => {
  const o = await emitirAceptado()
  const r = await anular(A, o.ecfId)
  assert.equal(r.status, 201, r.data?.mensaje)
  const nota = r.data.data
  assert.equal(nota.tipo_ecf, 34)
  assert.match(nota.encf, /^E34\d{10}$/)
  assert.equal(nota.estado, 'generado')

  const fila = await filaEcf(nota.id)
  assert.equal(fila.ecf_referencia_id, o.ecfId)
  assert.equal(fila.factura_id, o.facturaId)
  assert.equal(verificarFirma(fila.xml_firmado).valida, true)

  const xml = fila.xml_firmado
  assert.equal(texto(xml, '//IdDoc/TipoeCF'), '34')
  assert.equal(texto(xml, '//IdDoc/eNCF'), nota.encf)
  assert.equal(texto(xml, '//IdDoc/IndicadorNotaCredito'), '0')
  assert.equal(texto(xml, '//InformacionReferencia/NCFModificado'), o.encf)
  assert.equal(texto(xml, '//InformacionReferencia/FechaNCFModificado'), '27-09-2026')
  assert.equal(texto(xml, '//InformacionReferencia/CodigoModificacion'), '1')
  assert.equal(texto(xml, '//Emisor/FechaEmision'), dd(hoyRD()), 'la nota se emite hoy, no en la fecha de la factura')
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1180.00')
  assert.equal(texto(xml, '//Comprador/RNCComprador'), '101000002')
  assert.equal(texto(xml, '//Item/NombreItem'), 'Soporte técnico')

  const [[f]] = await t.pool.query('SELECT estado FROM facturas WHERE id = ?', [o.facturaId])
  assert.equal(f.estado, 'anulada')
  assert.equal((await filaEcf(o.ecfId)).estado, 'aceptado', 'el e-CF original no cambia')
})

test('la nota repite las retenciones del e-CF original', async () => {
  const o = await emitirAceptado()
  const nota = (await anular(A, o.ecfId)).data.data
  const xml = (await filaEcf(nota.id)).xml_firmado
  assert.equal(texto(xml, '//TotalITBISRetenido'), '180.00')
  assert.equal(texto(xml, '//TotalISRRetencion'), '100.00')
})

test('se puede anular también un e-CF 32 de consumo, sin retenciones', async () => {
  const o = await emitirAceptado(A, 'E32')
  const r = await anular(A, o.ecfId)
  assert.equal(r.status, 201, r.data?.mensaje)
  const xml = (await filaEcf(r.data.data.id)).xml_firmado
  assert.equal(texto(xml, '//IdDoc/TipoeCF'), '34')
  assert.ok(!/Retenido|Retencion/.test(xml))
})

test('la razón de la anulación viaja en el XML', async () => {
  const o = await emitirAceptado()
  const nota = (await anular(A, o.ecfId, { razon: 'Devolución total de la mercancía' })).data.data
  assert.equal(texto((await filaEcf(nota.id)).xml_firmado, '//InformacionReferencia/RazonModificacion'), 'Devolución total de la mercancía')
})

test('la nota entra en la cola, llega a la DGII y queda aceptada', async () => {
  const o = await emitirAceptado()
  const nota = (await anular(A, o.ecfId)).data.data
  await t.api('POST', '/ecf/procesar', { token: A.admin })
  assert.equal((await filaEcf(nota.id)).estado, 'aceptado')
  const enviada = sim.recibidos.find((x) => x.encf === nota.encf)
  assert.ok(enviada, 'la nota llegó a la DGII')
  assert.match(enviada.xml, /<TipoeCF>34<\/TipoeCF>/)
  assert.ok(sim.recibidos.some((x) => x.encf === o.encf), 'y el e-CF original también')
})

test('el detalle de la factura muestra su e-CF y su nota de crédito', async () => {
  const o = await emitirAceptado()
  const nota = (await anular(A, o.ecfId)).data.data
  const d = (await t.api('GET', `/facturas/${o.facturaId}`, { token: A.admin })).data.data
  assert.equal(d.ecf.encf, o.encf)
  assert.equal(d.ecf_nota_credito.encf, nota.encf)
  assert.equal(d.estado, 'anulada')
})

test('la representación impresa de la nota dice qué e-NCF modifica', async () => {
  const o = await emitirAceptado()
  const nota = (await anular(A, o.ecfId)).data.data
  const res = await fetch(`${t.base}/ecf/${nota.id}/representacion`, { headers: { Authorization: `Bearer ${A.admin}` } })
  const h = await res.text()
  assert.match(h, /Nota de Crédito Electrónica/)
  assert.ok(h.includes(`Modifica el e-NCF:</span> ${o.encf}`))
})

test('un e-CF cuya factura ya se anuló en el sistema igual se puede anular ante la DGII con su nota', async () => {
  const o = await emitirAceptado()
  assert.equal((await t.api('PUT', `/facturas/${o.facturaId}/anular`, { token: A.admin })).status, 200)
  assert.equal((await anular(A, o.ecfId)).status, 201)
})

// ── Indicador de los 30 días ──────────────────────────────────

test('el indicador es 0 hasta 30 días después del original y 1 pasado ese plazo', async () => {
  const hoy = hoyRD()
  const a30 = await emitirAceptado(A, 'E31', { fecha: sumarDias(hoy, -30) })
  const a31 = await emitirAceptado(A, 'E31', { fecha: sumarDias(hoy, -31) })
  const n30 = (await anular(A, a30.ecfId)).data.data
  const n31 = (await anular(A, a31.ecfId)).data.data
  assert.equal(texto((await filaEcf(n30.id)).xml_firmado, '//IdDoc/IndicadorNotaCredito'), '0')
  assert.equal(texto((await filaEcf(n31.id)).xml_firmado, '//IdDoc/IndicadorNotaCredito'), '1')
})

// ── Solo sobre lo aceptado, y una vez ─────────────────────────

test('un e-CF que la DGII aún no aceptó no se puede anular y no se consume nada', async () => {
  const r0 = await A.emitir('E31')
  const antes = await contadores(t, A.tenantId)
  const r = await anular(A, r0.data.ecf.id)
  assert.equal(r.status, 409)
  assert.match(r.data.mensaje, /ya aceptó/i)
  assert.deepEqual(await contadores(t, A.tenantId), antes)
})

test('un e-CF rechazado tampoco se anula: nunca existió para la DGII', async () => {
  sim.config.resultado = 'rechazado'
  const o = await emitirAceptado()
  const r = await anular(A, o.ecfId)
  assert.equal(r.status, 409)
})

test('el e-CF aceptado condicional sí se puede anular', async () => {
  sim.config.resultado = 'aceptado_condicional'
  const o = await emitirAceptado()
  assert.equal((await anular(A, o.ecfId)).status, 201)
})

test('una nota se emite una sola vez por e-CF y consume un solo número', async () => {
  const o = await emitirAceptado()
  assert.equal((await anular(A, o.ecfId)).status, 201)
  const antes = await contadores(t, A.tenantId)
  const otra = await anular(A, o.ecfId)
  assert.equal(otra.status, 409)
  assert.match(otra.data.mensaje, /ya tiene una nota de crédito/i)
  assert.deepEqual(await contadores(t, A.tenantId), antes)
})

test('dos anulaciones simultáneas del mismo e-CF: solo una prospera', async () => {
  const o = await emitirAceptado()
  const antes = await contadores(t, A.tenantId)
  const rs = await Promise.all([anular(A, o.ecfId), anular(A, o.ecfId), anular(A, o.ecfId)])
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409])
  const despues = await contadores(t, A.tenantId)
  assert.equal(despues.secuencias.E34, (antes.secuencias.E34 ?? 0) + 1)
})

test('una nota de crédito no se anula con otra nota', async () => {
  const o = await emitirAceptado()
  const nota = (await anular(A, o.ecfId)).data.data
  await t.api('POST', '/ecf/procesar', { token: A.admin })
  const r = await anular(A, nota.id)
  assert.equal(r.status, 409)
  assert.match(r.data.mensaje, /nota de crédito/i)
})

// ── Sin consumir nada cuando no se puede ──────────────────────

test('sin secuencia E34 activa no se emite y no cambia nada', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin E34')
  const o = await emitirAceptado(C)
  await t.pool.query("UPDATE nfc_secuencias SET activo = 0 WHERE tenant_id = ? AND tipo_ncf = 'E34'", [C.tenantId])
  const antes = await contadores(t, C.tenantId)
  const r = await anular(C, o.ecfId)
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /secuencia NCF activa del tipo E34/)
  assert.deepEqual(await contadores(t, C.tenantId), antes)
  const [[f]] = await t.pool.query('SELECT estado FROM facturas WHERE id = ?', [o.facturaId])
  assert.equal(f.estado, 'emitida')
})

test('sin certificado vigente no se emite la nota', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin Certificado')
  const o = await emitirAceptado(C)
  await t.pool.query('DELETE FROM certificados_digitales WHERE tenant_id = ?', [C.tenantId])
  const antes = await contadores(t, C.tenantId)
  const r = await anular(C, o.ecfId)
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /certificado/i)
  assert.deepEqual(await contadores(t, C.tenantId), antes)
})

test('la nota también cuenta contra el límite mensual de e-CF del plan', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Con Tope')
  const o = await emitirAceptado(C)
  const [[{ plan_id: original }]] = await t.pool.query('SELECT plan_id FROM tenants WHERE id = ?', [C.tenantId])
  const [nuevo] = await t.pool.query(
    `INSERT INTO planes (nombre, slug, precio_mensual, max_usuarios, max_clientes, max_ecf_mes) VALUES ('Tope', ?, 0, 5, 100, 1)`, [`tope-${Date.now()}`])
  await t.pool.query('UPDATE tenants SET plan_id = ? WHERE id = ?', [nuevo.insertId, C.tenantId])
  try {
    const r = await anular(C, o.ecfId)
    assert.equal(r.status, 403)
    assert.equal(r.data.limite_alcanzado, true)
  } finally {
    await t.pool.query('UPDATE tenants SET plan_id = ? WHERE id = ?', [original, C.tenantId])
    await t.pool.query('DELETE FROM planes WHERE id = ?', [nuevo.insertId])
  }
})

// ── Permisos y aislamiento ────────────────────────────────────

test('solo el administrador emite notas de crédito', async () => {
  const o = await emitirAceptado()
  for (const token of [A.facturador, A.visor]) {
    assert.equal((await t.api('POST', `/ecf/${o.ecfId}/nota-credito`, { token, body: {} })).status, 403)
  }
})

test('no se puede anular el e-CF de otra empresa', async () => {
  const o = await emitirAceptado(A)
  const r = await t.api('POST', `/ecf/${o.ecfId}/nota-credito`, { token: B.admin, body: {} })
  assert.equal(r.status, 404)
  const [[f]] = await t.pool.query('SELECT estado FROM facturas WHERE id = ?', [o.facturaId])
  assert.equal(f.estado, 'emitida')
})

test('un e-CF inexistente da 404', async () => {
  assert.equal((await t.api('POST', '/ecf/999999/nota-credito', { token: A.admin, body: {} })).status, 404)
  assert.equal((await t.api('POST', '/ecf/abc/nota-credito', { token: A.admin, body: {} })).status, 404)
})

test('una empresa suspendida no emite notas de crédito', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Suspendida')
  const o = await emitirAceptado(C)
  await t.pool.query("UPDATE tenants SET estado = 'suspendido' WHERE id = ?", [C.tenantId])
  const r = await anular(C, o.ecfId)
  assert.equal(r.status, 403)
  assert.equal(r.data.suscripcion_bloqueada, true)
})
