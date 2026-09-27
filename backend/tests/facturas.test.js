import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'
import { prepararNegocio } from './helpers/negocio.js'

let t, n, facturador, visor
let f1, f2
before(async () => {
  t = await iniciar()
  n = await prepararNegocio(t)
  facturador = (await t.sesion('facturador')).token
  visor = (await t.sesion('visor')).token
})
after(async () => { await t.cerrar() })

// ── Emisión y cálculo ─────────────────────────────────────────

test('FAC-01 emite una factura con dos ítems, uno con dimensiones: subtotal 4,500.00', async () => {
  const r = await n.emitir([n.itemA(3), n.itemB(2, 2, 1.5)], {}, facturador)
  assert.equal(r.status, 201)
  f1 = r.data.data
  assert.equal(Number(f1.subtotal), 4500)   // 3 × 1,000 + 2 × 250 × (2 × 1.5)
})

test('FAC-02 calcula ITBIS 18 %, retención de ITBIS 100 %, retención de ISR 10 % y total', () => {
  assert.equal(Number(f1.itbis), 810)
  assert.equal(Number(f1.ret_itbis), 810)
  assert.equal(Number(f1.ret_isr), 450)
  assert.equal(Number(f1.total), 4050)
})

test('FAC-03 asigna el NCF y el número de factura correlativos', () => {
  assert.equal(f1.nfc_numero, 'B010000000001')
  assert.equal(f1.numero, 'F000001')
})

test('FAC-04 la factura queda en estado emitida', () => {
  assert.equal(f1.estado, 'emitida')
})

test('FAC-05 la segunda factura recibe el NCF y el número siguientes', async () => {
  const r = await n.emitir([n.itemA(1)], {}, facturador)
  f2 = r.data.data
  assert.equal(f2.nfc_numero, 'B010000000002')
  assert.equal(f2.numero, 'F000002')
})

test('FAC-06 redondea a dos decimales (3 × 33.33)', async () => {
  const r = await n.emitir([n.itemA(3, 33.33)], {}, facturador)
  const f = r.data.data
  assert.equal(Number(f.subtotal), 99.99)
  assert.equal(Number(f.itbis), 18)
  assert.equal(Number(f.ret_isr), 10)
  assert.equal(Number(f.total), 89.99)
})

test('FAC-07 emite con el tipo de comprobante pedido (B02)', async () => {
  const r = await n.emitir([n.itemA(1)], { tipo_ncf: 'B02' }, facturador)
  assert.equal(r.data.data.nfc_numero, 'B020000000001')
})

test('FAC-08 no emite una factura sin artículos', async () => {
  const r = await n.emitir([], {}, facturador)
  assert.equal(r.status, 400)
})

test('FAC-09 no emite una factura sin cliente ni empresa', async () => {
  const r = await t.api('POST', '/facturas', { token: facturador, body: { items: [n.itemA(1)], fecha: '2026-01-01' } })
  assert.equal(r.status, 400)
})

test('ROL-05 un visor no puede emitir facturas', async () => {
  const r = await n.emitir([n.itemA(1)], {}, visor)
  assert.equal(r.status, 403)
})

test('ROL-06 un facturador no puede anular facturas', async () => {
  const r = await t.api('PUT', `/facturas/${f2.id}/anular`, { token: facturador })
  assert.equal(r.status, 403)
})

// ── Historial y anulación ─────────────────────────────────────

test('HIS-01 busca una factura por NCF', async () => {
  const r = await t.api('GET', '/facturas?buscar=B010000000001', { token: visor })
  assert.equal(r.data.data.length, 1)
  assert.equal(r.data.data[0].numero, 'F000001')
})

test('HIS-02 el detalle trae ítems, cliente y empresa', async () => {
  const r = await t.api('GET', `/facturas/${f1.id}`, { token: visor })
  const d = r.data.data
  assert.equal(d.items.length, 2)
  assert.equal(d.cliente_nombre, 'Cliente Uno SRL')
  assert.equal(d.empresa_nombre, 'Empresa de Prueba SRL')
  assert.ok(d.items[0].articulo_nombre)
})

test('HIS-03 consultar una factura inexistente da 404', async () => {
  assert.equal((await t.api('GET', '/facturas/999999', { token: visor })).status, 404)
})

test('HIS-04 el filtro de fechas sin coincidencias devuelve una lista vacía', async () => {
  const r = await t.api('GET', '/facturas?desde=2000-01-01&hasta=2000-12-31', { token: visor })
  assert.equal(r.data.data.length, 0)
})

test('HIS-05 el administrador anula una factura', async () => {
  const r = await t.api('PUT', `/facturas/${f2.id}/anular`, { token: n.admin })
  assert.equal(r.status, 200)
})

test('HIS-06 no se puede anular dos veces la misma factura', async () => {
  const r = await t.api('PUT', `/facturas/${f2.id}/anular`, { token: n.admin })
  assert.equal(r.status, 400)
})

test('HIS-07 la factura anulada conserva su NCF', async () => {
  const d = (await t.api('GET', `/facturas/${f2.id}`, { token: n.admin })).data.data
  assert.equal(d.estado, 'anulada')
  assert.equal(d.nfc_numero, 'B010000000002')
})

test('HIS-08 la siguiente factura no reutiliza ningún NCF ya emitido', async () => {
  const previos = (await t.api('GET', '/facturas?buscar=B01', { token: n.admin })).data.data.map((f) => f.nfc_numero)
  const nueva = (await n.emitir([n.itemA(1)], {}, facturador)).data.data
  assert.ok(nueva.nfc_numero)
  assert.equal(previos.includes(nueva.nfc_numero), false)
})

test('HIS-09 anular una factura inexistente da 404', async () => {
  assert.equal((await t.api('PUT', '/facturas/999999/anular', { token: n.admin })).status, 404)
})

test('DAS-01 el panel de control responde con indicadores', async () => {
  const r = await t.api('GET', '/dashboard', { token: visor })
  assert.equal(r.status, 200)
  assert.equal(r.data.ok, true)
})
