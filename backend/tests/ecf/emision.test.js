import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'
import { iniciar } from '../helpers/contexto.js'
import { prepararEmpresaEcf, contadores } from '../helpers/ecf.js'
import { verificarFirma, codigoSeguridad } from '../../services/ecf/firma.js'

let t, A, B
before(async () => {
  t = await iniciar()
  A = await prepararEmpresaEcf(t, 'Empresa Alfa')
  B = await prepararEmpresaEcf(t, 'Empresa Beta')
})
after(async () => { await t.cerrar() })

const texto = (xml, ruta) => xpath.select(`string(${ruta})`, new DOMParser().parseFromString(xml, 'text/xml'))
const filaEcf = async (facturaId) => (await t.pool.query('SELECT * FROM ecf_emitidos WHERE factura_id = ?', [facturaId]))[0][0]

// ── E31: crédito fiscal ───────────────────────────────────────

test('una factura E31 recibe su e-NCF, un XML firmado y queda generada', async () => {
  const r = await A.emitir('E31')
  assert.equal(r.status, 201, r.data?.mensaje)
  const factura = r.data.data
  assert.equal(factura.nfc_numero, 'E310000000001')
  assert.equal(factura.numero, 'F000001')
  assert.equal(factura.estado, 'emitida')

  assert.equal(r.data.ecf.encf, 'E310000000001')
  assert.equal(r.data.ecf.tipo_ecf, 31)
  assert.equal(r.data.ecf.estado, 'generado')
  assert.match(r.data.ecf.codigo_seguridad, /^.{6}$/)

  const fila = await filaEcf(factura.id)
  assert.equal(fila.tenant_id, A.tenantId)
  assert.equal(fila.encf, 'E310000000001')
  assert.equal(fila.estado, 'generado')
  assert.ok(fila.proximo_intento, 'queda en la cola para enviarse')
  assert.equal(verificarFirma(fila.xml_firmado).valida, true)
  assert.equal(fila.codigo_seguridad, codigoSeguridad(fila.xml_firmado))
})

test('el XML de un E31 lleva los datos de la factura, del emisor y del comprador', async () => {
  const r = await A.emitir('E31')
  const { xml_firmado: xml } = await filaEcf(r.data.data.id)
  assert.equal(texto(xml, '//IdDoc/TipoeCF'), '31')
  assert.equal(texto(xml, '//IdDoc/eNCF'), r.data.data.nfc_numero)
  assert.equal(texto(xml, '//IdDoc/FechaVencimientoSecuencia'), '31-12-2030')
  assert.equal(texto(xml, '//Emisor/RNCEmisor'), A.rnc)
  assert.equal(texto(xml, '//Emisor/RazonSocialEmisor'), 'Empresa Alfa')
  assert.equal(texto(xml, '//Emisor/DireccionEmisor'), 'Calle Duarte 10, Santo Domingo')
  assert.equal(texto(xml, '//Emisor/NumeroFacturaInterna'), r.data.data.numero)
  assert.equal(texto(xml, '//Emisor/FechaEmision'), '27-09-2026')
  assert.equal(texto(xml, '//Comprador/RNCComprador'), '101000002')
  assert.equal(texto(xml, '//Comprador/RazonSocialComprador'), 'Cliente Beta SRL')
  assert.equal(texto(xml, '//Item/NombreItem'), 'Soporte técnico')
  assert.equal(texto(xml, '//Item/IndicadorBienoServicio'), '2')
  assert.equal(texto(xml, '//Item/MontoItem'), '1000.00')
  assert.equal(texto(xml, '//Totales/MontoGravadoI1'), '1000.00')
  assert.equal(texto(xml, '//Totales/TotalITBIS'), '180.00')
})

test('en un E31 las retenciones van informadas y el total del XML no las descuenta', async () => {
  const r = await A.emitir('E31')
  const f = r.data.data
  assert.equal(Number(f.ret_itbis), 180)
  assert.equal(Number(f.ret_isr), 100)
  assert.equal(Number(f.total), 900, 'la factura sigue calculando su total a pagar como en la v1')
  const { xml_firmado: xml, monto_total } = await filaEcf(f.id)
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1180.00')
  assert.equal(texto(xml, '//Totales/TotalITBISRetenido'), '180.00')
  assert.equal(texto(xml, '//Totales/TotalISRRetencion'), '100.00')
  assert.equal(Number(monto_total), 1180)
})

test('los artículos con dimensiones salen con su precio por área y sus medidas en la descripción', async () => {
  const r = await A.emitir('E31', { items: [A.itemConDimensiones(2, 2, 1.5)] })   // 2 × (2 × 1.5) × 250 = 1,500
  assert.equal(r.status, 201, r.data?.mensaje)
  const { xml_firmado: xml } = await filaEcf(r.data.data.id)
  assert.equal(texto(xml, '//Item/NombreItem'), 'Lona impresa')
  assert.equal(texto(xml, '//Item/IndicadorBienoServicio'), '1')
  assert.equal(texto(xml, '//Item/MontoItem'), '1500.00')
  assert.equal(texto(xml, '//Item/PrecioUnitarioItem'), '750.00')
  assert.match(texto(xml, '//Item/DescripcionItem'), /2 x 1\.5/)
})

test('varias líneas suman bien y numeran sus ítems', async () => {
  const r = await A.emitir('E31', { items: [A.itemServicio(1, 1000), A.itemServicio(3, 250)] })
  const { xml_firmado: xml } = await filaEcf(r.data.data.id)
  assert.equal(texto(xml, '//Item[2]/NumeroLinea'), '2')
  assert.equal(texto(xml, '//Totales/MontoGravadoTotal'), '1750.00')
  assert.equal(texto(xml, '//Totales/TotalITBIS'), '315.00')
})

test('una factura a crédito lleva la fecha límite de pago', async () => {
  const r = await A.emitir('E31', { vencimiento: '2026-10-27' })
  const { xml_firmado: xml } = await filaEcf(r.data.data.id)
  assert.equal(texto(xml, '//IdDoc/TipoPago'), '2')
  assert.equal(texto(xml, '//IdDoc/FechaLimitePago'), '27-10-2026')
})

// ── E32: consumo ──────────────────────────────────────────────

test('una factura E32 a un consumidor sin RNC se emite y no lleva retenciones', async () => {
  const r = await A.emitir('E32', { cliente: 'consumidor' })
  assert.equal(r.status, 201, r.data?.mensaje)
  const f = r.data.data
  assert.match(f.nfc_numero, /^E320000000\d{3}$/)
  assert.equal(Number(f.ret_itbis), 0)
  assert.equal(Number(f.ret_isr), 0)
  assert.equal(Number(f.total), 1180)
  const { xml_firmado: xml } = await filaEcf(f.id)
  assert.equal(texto(xml, '//IdDoc/TipoeCF'), '32')
  assert.ok(!/Retenido|Retencion/.test(xml))
  assert.equal(texto(xml, '//Totales/MontoTotal'), '1180.00')
  assert.equal(texto(xml, '//Comprador/RNCComprador'), '')
  assert.equal(verificarFirma(xml).valida, true)
})

test('E32 desde RD$ 250,000 sin RNC del comprador se rechaza sin consumir nada', async () => {
  const antes = await contadores(t, A.tenantId)
  const r = await A.emitir('E32', { cliente: 'consumidor', items: [A.itemServicio(1, 250000)] })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /250,000/)
  assert.deepEqual(await contadores(t, A.tenantId), antes)
})

// ── Numeración ────────────────────────────────────────────────

test('los e-NCF son consecutivos por tipo y avanzan la secuencia', async () => {
  const antes = await contadores(t, A.tenantId)
  const a = (await A.emitir('E31')).data.data
  const b = (await A.emitir('E31')).data.data
  const c = (await A.emitir('E32', { cliente: 'consumidor' })).data.data
  const n31 = Number(antes.secuencias.E31)
  assert.equal(a.nfc_numero, `E31${String(n31 + 1).padStart(10, '0')}`)
  assert.equal(b.nfc_numero, `E31${String(n31 + 2).padStart(10, '0')}`)
  assert.equal(c.nfc_numero, `E32${String(Number(antes.secuencias.E32) + 1).padStart(10, '0')}`)
  const despues = await contadores(t, A.tenantId)
  assert.equal(despues.secuencias.E31, n31 + 2)
  assert.equal(despues.facturas, antes.facturas + 3)
})

test('la numeración de cada empresa es independiente', async () => {
  const b = (await B.emitir('E31')).data.data
  assert.equal(b.nfc_numero, 'E310000000001')
  assert.equal(b.numero, 'F000001')
})

test('ocho emisiones simultáneas dan e-NCF distintos y consecutivos, todos con firma válida', async () => {
  const antes = await contadores(t, B.tenantId)
  const resultados = await Promise.all(Array.from({ length: 8 }, () => B.emitir('E32', { cliente: 'consumidor' })))
  assert.ok(resultados.every((r) => r.status === 201), resultados.map((r) => r.status).join(','))
  const numeros = resultados.map((r) => Number(r.data.data.nfc_numero.slice(3))).sort((x, y) => x - y)
  const inicio = Number(antes.secuencias.E32) + 1
  assert.deepEqual(numeros, Array.from({ length: 8 }, (_, i) => inicio + i))
  for (const r of resultados) assert.equal(verificarFirma((await filaEcf(r.data.data.id)).xml_firmado).valida, true)
})

// ── Rechazos: no se consume ningún número ─────────────────────

async function sinConsumir(emision, estado, motivo) {
  const antes = await contadores(t, A.tenantId)
  const r = await emision()
  assert.equal(r.status, estado, r.data?.mensaje)
  assert.match(r.data.mensaje, motivo)
  assert.deepEqual(await contadores(t, A.tenantId), antes, 'no debe quedar ninguna factura, e-CF ni número consumido')
  return r
}

test('sin certificado digital no se emite y no se consume nada', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin Certificado')
  await t.api('DELETE', '/ecf/certificado', { token: C.admin })
  const antes = await contadores(t, C.tenantId)
  const r = await C.emitir('E31')
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /certificado digital/i)
  assert.deepEqual(await contadores(t, C.tenantId), antes)
})

test('sin secuencia E31 activa no se emite y no se consume nada', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin Secuencia')
  await t.pool.query("UPDATE nfc_secuencias SET activo = 0 WHERE tenant_id = ? AND tipo_ncf = 'E31'", [C.tenantId])
  const antes = await contadores(t, C.tenantId)
  const r = await C.emitir('E31')
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /secuencia NCF activa del tipo E31/)
  assert.deepEqual(await contadores(t, C.tenantId), antes)
})

test('una secuencia agotada no emite', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Agotada')
  await t.pool.query("UPDATE nfc_secuencias SET ultimo_usado = hasta WHERE tenant_id = ? AND tipo_ncf = 'E32'", [C.tenantId])
  const r = await C.emitir('E32', { cliente: 'consumidor' })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /agotada/)
})

test('E31 a un cliente sin RNC se rechaza y no consume nada', async () => {
  await sinConsumir(() => A.emitir('E31', { cliente: 'consumidor' }), 400, /RNC del comprador/)
})

test('sin dirección del emisor no se emite: se pide completar la configuración', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin Direccion')
  await t.pool.query('UPDATE empresas SET direccion = NULL WHERE id = ?', [C.empresaId])
  const antes = await contadores(t, C.tenantId)
  const r = await C.emitir('E31')
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /dirección del emisor/i)
  assert.deepEqual(await contadores(t, C.tenantId), antes)
})

test('una tasa de ITBIS que el e-CF no admite (10 %) se rechaza sin consumir nada', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Tasa Rara')
  await C.configurar({ itbis_porcentaje: 10 })
  const antes = await contadores(t, C.tenantId)
  const r = await C.emitir('E31')
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /18%, 16% o 0%/)
  assert.deepEqual(await contadores(t, C.tenantId), antes)
  const paper = await C.emitir('B01')   // en papel sí se puede: la regla es solo del e-CF
  assert.notEqual(paper.status, 500)
})

test('las tasas de 16 % y de 0 % sí se emiten', async () => {
  for (const [tasa, esperado] of [[16, '160.00'], [0, '0.00']]) {
    const C = await prepararEmpresaEcf(t, `Empresa Tasa ${tasa}`)
    await C.configurar({ itbis_porcentaje: tasa })
    const r = await C.emitir('E32', { cliente: 'consumidor' })
    assert.equal(r.status, 201, r.data?.mensaje)
    const { xml_firmado: xml } = await filaEcf(r.data.data.id)
    assert.equal(texto(xml, '//Totales/TotalITBIS'), esperado)
  }
})

// ── Límite mensual del plan ───────────────────────────────────

async function conPlanDeLimite(empresa, max, prueba) {
  const [[{ plan_id: original }]] = await t.pool.query('SELECT plan_id FROM tenants WHERE id = ?', [empresa.tenantId])
  const [nuevo] = await t.pool.query(
    `INSERT INTO planes (nombre, slug, precio_mensual, max_usuarios, max_clientes, max_ecf_mes) VALUES ('Limite e-CF', ?, 0, 5, 100, ?)`,
    [`limite-ecf-${Date.now()}`, max])
  await t.pool.query('UPDATE tenants SET plan_id = ? WHERE id = ?', [nuevo.insertId, empresa.tenantId])
  try { await prueba() } finally {
    await t.pool.query('UPDATE tenants SET plan_id = ? WHERE id = ?', [original, empresa.tenantId])
    await t.pool.query('DELETE FROM planes WHERE id = ?', [nuevo.insertId])
  }
}

test('al llegar al máximo de e-CF del plan no se emite otro y no se consume nada', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Con Limite')
  await conPlanDeLimite(C, 2, async () => {
    assert.equal((await C.emitir('E32', { cliente: 'consumidor' })).status, 201)
    assert.equal((await C.emitir('E31')).status, 201)
    const antes = await contadores(t, C.tenantId)
    const r = await C.emitir('E32', { cliente: 'consumidor' })
    assert.equal(r.status, 403)
    assert.equal(r.data.limite_alcanzado, true)
    assert.match(r.data.mensaje, /límite/i)
    assert.deepEqual(await contadores(t, C.tenantId), antes)
    const b01 = await C.emitir('B01')
    assert.equal(b01.status, 201, 'las facturas en papel no cuentan contra el límite de e-CF')
  })
})

test('con plan ilimitado (-1) no hay tope', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin Tope')
  await conPlanDeLimite(C, -1, async () => {
    for (let i = 0; i < 3; i++) assert.equal((await C.emitir('E32', { cliente: 'consumidor' })).status, 201)
  })
})

test('el uso del mes aparece en /suscripcion/limites', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Con Uso')
  await C.emitir('E32', { cliente: 'consumidor' })
  await C.emitir('E31')
  const r = await t.api('GET', '/suscripcion/limites', { token: C.admin })
  assert.equal(r.data.data.ecf_mes.actual, 2)
  assert.equal(r.data.data.ecf_mes.max, 300)
})

// ── Permisos y consultas ──────────────────────────────────────

test('un visor no puede emitir; una empresa suspendida tampoco', async () => {
  assert.equal((await A.emitir('E31', { token: A.visor })).status, 403)
  await t.pool.query("UPDATE tenants SET estado = 'suspendido' WHERE id = ?", [B.tenantId])
  try {
    const r = await B.emitir('E31')
    assert.equal(r.status, 403)
    assert.equal(r.data.suscripcion_bloqueada, true)
  } finally {
    await t.pool.query("UPDATE tenants SET estado = 'activo' WHERE id = ?", [B.tenantId])
  }
})

test('la factura muestra su e-CF: en el listado su estado y en el detalle su e-NCF y código de seguridad', async () => {
  const f = (await A.emitir('E31')).data.data
  const lista = (await t.api('GET', '/facturas', { token: A.admin })).data.data
  assert.equal(lista.find((x) => x.id === f.id).ecf_estado, 'generado')
  const detalle = (await t.api('GET', `/facturas/${f.id}`, { token: A.admin })).data.data
  assert.equal(detalle.ecf.encf, f.nfc_numero)
  assert.match(detalle.ecf.codigo_seguridad, /^.{6}$/)
  assert.ok(!('xml_firmado' in detalle.ecf), 'el listado y el detalle no arrastran el XML')
})

test('las facturas en papel (B01) siguen igual: sin e-CF y sin necesitar certificado', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Solo Papel')
  await t.api('DELETE', '/ecf/certificado', { token: C.admin })
  const r = await C.emitir('B01')
  assert.equal(r.status, 201)
  assert.equal(r.data.ecf, undefined)
  assert.equal((await t.pool.query('SELECT COUNT(*) n FROM ecf_emitidos WHERE tenant_id = ?', [C.tenantId]))[0][0].n, 0)
})
