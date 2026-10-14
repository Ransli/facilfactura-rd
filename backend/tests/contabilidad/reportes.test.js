// DÓNDE VA: backend/tests/contabilidad/
// Pruebas de los endpoints de descarga 607, 608, 609 y del borrador del IT-1 (el 606 ya se cubre en gastos.test.js).
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { hoyRD } from '../../services/suscripcion/estado.js'

let t, A, adminA, categoriaId

async function datosDeFacturacion(token) {
  const cliente = (await t.api('POST', '/clientes', { token, body: { nombre: 'Cliente de prueba', rnc: '131-00000-2' } })).data.data
  const categoria = (await t.api('POST', '/categorias', { token, body: { nombre: 'General' } })).data.data
  const unidad = (await t.api('GET', '/unidades-medida', { token })).data.data.find((u) => u.abreviatura === 'und')
  const articulo = (await t.api('POST', '/articulos', {
    token, body: { categoria_id: categoria.id, nombre: 'Servicio', unidad_medida_id: unidad.id, precios: [{ unidad_medida_id: unidad.id, precio_unitario: 1000 }] },
  })).data.data
  return { cliente, unidad, articulo }
}

before(async () => {
  t = await iniciar()
  const [[cat]] = await t.pool.query("SELECT id FROM categorias_606 WHERE codigo = '02'")
  categoriaId = cat.id
  A = await t.crearEmpresa('Empresa Reportes')
  adminA = (await t.sesionDe(A, 'admin')).token
})
after(async () => { await t.cerrar() })

test('el 607 incluye una factura emitida del período y excluye una anulada', async () => {
  const ctx = await datosDeFacturacion(adminA)
  const emitida = (await t.api('POST', '/facturas', {
    token: adminA, body: { cliente_id: ctx.cliente.id, empresa_id: A.empresaId, fecha: hoyRD(), items: [{ articulo_id: ctx.articulo.id, cantidad: 1, unidad_medida_id: ctx.unidad.id, precio_unitario: 1000 }] },
  })).data.data
  const paraAnular = (await t.api('POST', '/facturas', {
    token: adminA, body: { cliente_id: ctx.cliente.id, empresa_id: A.empresaId, fecha: hoyRD(), items: [{ articulo_id: ctx.articulo.id, cantidad: 1, unidad_medida_id: ctx.unidad.id, precio_unitario: 500 }] },
  })).data.data
  await t.api('PUT', `/facturas/${paraAnular.id}/anular`, { token: adminA })

  const periodo = hoyRD().slice(0, 7).replace('-', '')
  const r = await fetch(`${t.base}/contabilidad/reportes/607?periodo=${periodo}`, { headers: { Authorization: `Bearer ${adminA}` } })
  const txt = await r.text()
  assert.equal(r.status, 200)
  assert.ok(txt.includes(emitida.nfc_numero))
  assert.ok(!txt.includes(paraAnular.nfc_numero))
})

test('el 608 incluye la factura anulada del período', async () => {
  const ctx = await datosDeFacturacion(adminA)
  const f = (await t.api('POST', '/facturas', {
    token: adminA, body: { cliente_id: ctx.cliente.id, empresa_id: A.empresaId, fecha: hoyRD(), items: [{ articulo_id: ctx.articulo.id, cantidad: 1, unidad_medida_id: ctx.unidad.id, precio_unitario: 700 }] },
  })).data.data
  await t.api('PUT', `/facturas/${f.id}/anular`, { token: adminA })

  const periodo = hoyRD().slice(0, 7).replace('-', '')
  const r = await fetch(`${t.base}/contabilidad/reportes/608?periodo=${periodo}`, { headers: { Authorization: `Bearer ${adminA}` } })
  const txt = await r.text()
  assert.equal(r.status, 200)
  assert.ok(txt.includes(f.nfc_numero))
  assert.ok(txt.includes('|05')) // código de anulación por omisión
})

test('el 609 incluye un gasto marcado como pago al exterior', async () => {
  const creado = await t.api('POST', '/contabilidad/gastos', {
    token: adminA,
    body: {
      proveedor_rnc: '', proveedor_nombre: 'Consultora LLC', categoria_606_id: categoriaId, ncf: 'B0100000080',
      fecha_comprobante: hoyRD(), monto_servicios: 2000, itbis_facturado: 0, es_pago_exterior: true,
      pais_beneficiario: 'US', tipo_renta_exterior: '01', monto_retencion_renta: 190,
    },
  })
  assert.equal(creado.status, 201)

  const periodo = hoyRD().slice(0, 7).replace('-', '')
  const r = await fetch(`${t.base}/contabilidad/reportes/609?periodo=${periodo}`, { headers: { Authorization: `Bearer ${adminA}` } })
  const txt = await r.text()
  assert.equal(r.status, 200)
  assert.ok(txt.includes('Consultora LLC'))
  assert.ok(txt.includes('2000.00'))
})

test('el borrador del IT-1 cuadra el ITBIS facturado en ventas contra el adelantado en compras', async () => {
  const periodo = hoyRD().slice(0, 7).replace('-', '')
  const r = await t.api('GET', `/contabilidad/reportes/it1?periodo=${periodo}`, { token: adminA })
  assert.equal(r.status, 200)
  assert.ok('itbis_a_pagar' in r.data.data)
  assert.equal(r.data.data.ventas.itbis_facturado - r.data.data.compras.itbis_adelantado - r.data.data.ventas.itbis_retenido_por_terceros, r.data.data.itbis_a_pagar)
})
