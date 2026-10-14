// DÓNDE VA: backend/tests/contabilidad/
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'

let t, A, B, adminA, facturadorA, visorA, adminB, categoriaId

const gasto = (extra = {}) => ({
  proveedor_rnc: '130-88170-7', proveedor_nombre: 'Proveedor Secreto de Alfa', categoria_606_id: categoriaId,
  ncf: 'B0100000099', fecha_comprobante: '2026-09-05', monto_servicios: 1000, monto_bienes: 0,
  itbis_facturado: 180, ...extra,
})

before(async () => {
  t = await iniciar()
  const [[cat]] = await t.pool.query("SELECT id FROM categorias_606 WHERE codigo = '02'")
  categoriaId = cat.id
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  facturadorA = (await t.sesionDe(A, 'facturador')).token
  visorA = (await t.sesionDe(A, 'visor')).token
  adminB = (await t.sesionDe(B, 'admin')).token
})
after(async () => { await t.cerrar() })

test('un facturador registra un gasto y queda asociado a su empresa', async () => {
  const r = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto() })
  assert.equal(r.status, 201)
  const [[fila]] = await t.pool.query('SELECT tenant_id FROM gastos WHERE id = ?', [r.data.data.id])
  assert.equal(fila.tenant_id, A.tenantId)
})

test('no permite registrar dos veces el mismo NCF del mismo proveedor en la misma empresa', async () => {
  await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000050' }) })
  const r = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000050' }) })
  assert.equal(r.status, 400)
})

test('rechaza un RNC de proveedor con formato inválido', async () => {
  const r = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ proveedor_rnc: '12345', ncf: 'B0100000051' }) })
  assert.equal(r.status, 400)
})

test('rechaza un NCF con longitud inválida', async () => {
  const r = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'X1' }) })
  assert.equal(r.status, 400)
})

test('rechaza montos negativos', async () => {
  const r = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000052', monto_servicios: -10 }) })
  assert.equal(r.status, 400)
})

test('rechaza una fecha de comprobante inexistente', async () => {
  const r = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000053', fecha_comprobante: 'no-es-una-fecha' }) })
  assert.equal(r.status, 400)
})

test('un visor puede listar gastos pero no crearlos (403)', async () => {
  const lista = await t.api('GET', '/contabilidad/gastos', { token: visorA })
  assert.equal(lista.status, 200)
  const crear = await t.api('POST', '/contabilidad/gastos', { token: visorA, body: gasto({ ncf: 'B0100000054' }) })
  assert.equal(crear.status, 403)
})

test('AISLAMIENTO: la empresa B no ve los gastos de la empresa A en el listado', async () => {
  const r = await t.api('GET', '/contabilidad/gastos', { token: adminB })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.length, 0)
})

test('AISLAMIENTO: la empresa B recibe 404 al pedir, editar o anular un gasto de la empresa A', async () => {
  const creado = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000055' }) })
  const id = creado.data.data.id

  const ver = await t.api('GET', `/contabilidad/gastos/${id}`, { token: adminB })
  assert.equal(ver.status, 404)

  const editar = await t.api('PUT', `/contabilidad/gastos/${id}`, { token: adminB, body: gasto({ ncf: 'B0100000055', proveedor_nombre: 'Hackeado' }) })
  assert.equal(editar.status, 404)

  const anular = await t.api('DELETE', `/contabilidad/gastos/${id}`, { token: adminB })
  assert.equal(anular.status, 404)

  const [[fila]] = await t.pool.query('SELECT proveedor_nombre, estado FROM gastos WHERE id = ?', [id])
  assert.equal(fila.proveedor_nombre, 'Proveedor Secreto de Alfa')
  assert.equal(fila.estado, 'registrado')
})

test('el 606 de un período incluye solo los gastos registrados de esa empresa y ese mes, y excluye los anulados', async () => {
  const dentro = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000060', fecha_comprobante: '2026-08-15' }) })
  await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000061', fecha_comprobante: '2026-07-01' }) }) // fuera del período
  const anulado = await t.api('POST', '/contabilidad/gastos', { token: facturadorA, body: gasto({ ncf: 'B0100000062', fecha_comprobante: '2026-08-20' }) })
  await t.api('DELETE', `/contabilidad/gastos/${anulado.data.data.id}`, { token: facturadorA })

  const r = await fetch(`${t.base}/contabilidad/reportes/606?periodo=202608`, { headers: { Authorization: `Bearer ${facturadorA}` } })
  const txt = await r.text()
  assert.equal(r.status, 200)
  const lineas = txt.trim().split('\r\n')
  assert.equal(lineas[0].split('|')[3], '1') // cantidad de registros del encabezado
  assert.ok(txt.includes('B0100000060'))
  assert.ok(!txt.includes('B0100000061'))
  assert.ok(!txt.includes('B0100000062'))
  // Y la empresa B, sin gastos, recibe un 606 con cero registros
  const rB = await fetch(`${t.base}/contabilidad/reportes/606?periodo=202608`, { headers: { Authorization: `Bearer ${adminB}` } })
  const txtB = await rB.text()
  assert.equal(txtB.trim().split('|')[3], '0')
})
