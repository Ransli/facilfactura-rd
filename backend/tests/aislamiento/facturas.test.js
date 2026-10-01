import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { hoyRD } from '../../services/suscripcion/estado.js'

let t, A, B, adminA, adminB
let ctxA, ctxB           // datos de facturación de cada empresa
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token
  ctxA = await datosDeFacturacion(adminA, A)
  ctxB = await datosDeFacturacion(adminB, B)
})
after(async () => { await t.cerrar() })

// Cliente, categoría y artículo propios de una empresa
async function datosDeFacturacion(token, empresa) {
  const cliente = (await t.api('POST', '/clientes', { token, body: { nombre: `Cliente de ${empresa.nombre}` } })).data.data
  const categoria = (await t.api('POST', '/categorias', { token, body: { nombre: 'General' } })).data.data
  const unidad = (await t.api('GET', '/unidades-medida', { token })).data.data.find((u) => u.abreviatura === 'und')
  const tipoServicio = (await t.api('GET', '/tipos-servicio', { token })).data.data[0]
  const articulo = (await t.api('POST', '/articulos', {
    token, body: { categoria_id: categoria.id, nombre: 'Servicio', unidad_medida_id: unidad.id,
                   precios: [{ unidad_medida_id: unidad.id, precio_unitario: 1000 }] },
  })).data.data
  return { cliente, unidad, tipoServicio, articulo, empresaId: empresa.empresaId }
}

const emitir = (token, ctx, cambios = {}, itemCambios = {}) => t.api('POST', '/facturas', {
  token,
  body: {
    cliente_id: ctx.cliente.id, empresa_id: ctx.empresaId, fecha: hoyRD(),
    items: [{ articulo_id: ctx.articulo.id, cantidad: 1, unidad_medida_id: ctx.unidad.id, precio_unitario: 1000, ...itemCambios }],
    ...cambios,
  },
})

// ── Numeración independiente ──────────────────────────────────

test('cada empresa numera sus facturas y sus NCF desde cero, sin cruzarse', async () => {
  const a1 = (await emitir(adminA, ctxA)).data.data
  const b1 = (await emitir(adminB, ctxB)).data.data
  const a2 = (await emitir(adminA, ctxA)).data.data
  assert.equal(a1.numero, 'F000001')
  assert.equal(b1.numero, 'F000001', 'la empresa B empieza en F000001 aunque A ya facturó')
  assert.equal(a2.numero, 'F000002')
  assert.equal(a1.nfc_numero, 'B010000000001')
  assert.equal(b1.nfc_numero, 'B010000000001', 'el NCF de B es independiente del de A')
  assert.equal(a2.nfc_numero, 'B010000000002')
  assert.equal(a1.tenant_id, A.tenantId)
  assert.equal(b1.tenant_id, B.tenantId)
})

test('las secuencias y el correlativo de A no cambian cuando B factura', async () => {
  const [[antes]] = await t.pool.query('SELECT factura_ultimo_numero n FROM configuracion WHERE tenant_id = ?', [A.tenantId])
  await emitir(adminB, ctxB)
  const [[despues]] = await t.pool.query('SELECT factura_ultimo_numero n FROM configuracion WHERE tenant_id = ?', [A.tenantId])
  assert.equal(despues.n, antes.n)
})

test('dos empresas facturando a la vez reciben cada una su numeración consecutiva', async () => {
  const [[a0]] = await t.pool.query('SELECT factura_ultimo_numero n FROM configuracion WHERE tenant_id = ?', [A.tenantId])
  const [[b0]] = await t.pool.query('SELECT factura_ultimo_numero n FROM configuracion WHERE tenant_id = ?', [B.tenantId])
  const lote = await Promise.all(
    Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? emitir(adminA, ctxA) : emitir(adminB, ctxB)))
  )
  assert.deepEqual(lote.map((r) => r.status), Array(12).fill(201))
  const de = (empresa) => lote.map((r) => r.data.data).filter((f) => f.tenant_id === empresa.tenantId).map((f) => Number(f.numero.slice(1))).sort((x, y) => x - y)
  assert.deepEqual(de(A), Array.from({ length: 6 }, (_, i) => a0.n + 1 + i))
  assert.deepEqual(de(B), Array.from({ length: 6 }, (_, i) => b0.n + 1 + i))
})

// ── Aislamiento de lectura y anulación ────────────────────────

test('B no ve las facturas de A en el historial ni al filtrar por el cliente de A', async () => {
  const b = (await t.api('GET', '/facturas', { token: adminB })).data.data
  assert.ok(b.length > 0)
  assert.ok(b.every((f) => f.tenant_id === B.tenantId))
  const porCliente = await t.api('GET', `/facturas?cliente_id=${ctxA.cliente.id}`, { token: adminB })
  assert.equal(porCliente.data.data.length, 0)
})

test('B recibe 404 al pedir una factura de A', async () => {
  const facturaA = (await t.api('GET', '/facturas', { token: adminA })).data.data[0]
  assert.equal((await t.api('GET', `/facturas/${facturaA.id}`, { token: adminB })).status, 404)
})

test('B recibe 404 al anular una factura de A y esta sigue emitida', async () => {
  const facturaA = (await t.api('GET', '/facturas', { token: adminA })).data.data[0]
  assert.equal((await t.api('PUT', `/facturas/${facturaA.id}/anular`, { token: adminB })).status, 404)
  const [[fila]] = await t.pool.query('SELECT estado FROM facturas WHERE id = ?', [facturaA.id])
  assert.equal(fila.estado, 'emitida')
})

// ── Referencias cruzadas ──────────────────────────────────────

test('B no puede facturar a un cliente de A (400) y no consume número', async () => {
  const [[antes]] = await t.pool.query('SELECT factura_ultimo_numero n FROM configuracion WHERE tenant_id = ?', [B.tenantId])
  const r = await emitir(adminB, ctxB, { cliente_id: ctxA.cliente.id })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /cliente/i)
  const [[despues]] = await t.pool.query('SELECT factura_ultimo_numero n FROM configuracion WHERE tenant_id = ?', [B.tenantId])
  assert.equal(despues.n, antes.n)
})

test('B no puede facturar con la empresa emisora de A (400)', async () => {
  const r = await emitir(adminB, ctxB, { empresa_id: ctxA.empresaId })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /empresa/i)
})

test('B no puede facturar un artículo de A ni usar una unidad de A (400)', async () => {
  const articulo = await emitir(adminB, ctxB, {}, { articulo_id: ctxA.articulo.id })
  assert.equal(articulo.status, 400)
  assert.match(articulo.data.mensaje, /artículo/i)
  const unidad = await emitir(adminB, ctxB, {}, { unidad_medida_id: ctxA.unidad.id })
  assert.equal(unidad.status, 400)
  assert.match(unidad.data.mensaje, /unidad/i)
})

test('B no puede usar el tipo de servicio de A (400)', async () => {
  const r = await emitir(adminB, ctxB, { tipo_servicio_id: ctxA.tipoServicio.id })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /tipo de servicio/i)
})

// ── Panel ─────────────────────────────────────────────────────

test('el panel de cada empresa cuenta solo sus propias facturas y clientes', async () => {
  const a = (await t.api('GET', '/dashboard', { token: adminA })).data
  const b = (await t.api('GET', '/dashboard', { token: adminB })).data
  const [[cuentaA]] = await t.pool.query("SELECT COUNT(*) n FROM facturas WHERE tenant_id = ? AND estado = 'emitida'", [A.tenantId])
  const [[cuentaB]] = await t.pool.query("SELECT COUNT(*) n FROM facturas WHERE tenant_id = ? AND estado = 'emitida'", [B.tenantId])
  assert.equal(a.mesActual.cantidad, cuentaA.n)
  assert.equal(b.mesActual.cantidad, cuentaB.n)
  assert.equal(a.catalogo.clientes, 1)
  assert.equal(b.catalogo.clientes, 1)
  assert.ok(a.topClientes.every((c) => c.nombre.includes('Alfa')))
  assert.ok(b.topClientes.every((c) => c.nombre.includes('Beta')))
  assert.ok(a.ncf.every((s) => s.id))
  assert.equal(a.ncf.length, 6)
})
