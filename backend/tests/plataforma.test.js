import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'

let t
before(async () => { t = await iniciar({ reiniciar: false }) })
after(async () => { await t.cerrar() })

test('existe el catálogo de planes con exactamente un plan de prueba gratuito', async () => {
  const [planes] = await t.pool.query('SELECT * FROM planes WHERE activo = 1 ORDER BY orden')
  assert.ok(planes.length >= 4, 'debe haber al menos 4 planes activos')
  const pruebas = planes.filter((p) => p.es_plan_prueba === 1)
  assert.equal(pruebas.length, 1)
  assert.equal(Number(pruebas[0].precio_mensual), 0)
  assert.ok(pruebas[0].dias_prueba > 0)
})

test('los planes de pago tienen límites de usuarios, clientes y e-CF por mes (-1 = ilimitado)', async () => {
  const [pagos] = await t.pool.query('SELECT * FROM planes WHERE es_plan_prueba = 0 AND activo = 1')
  assert.ok(pagos.length >= 3)
  for (const p of pagos) {
    assert.ok(Number(p.precio_mensual) > 0, `${p.nombre} debe tener precio`)
    for (const campo of ['max_usuarios', 'max_clientes', 'max_ecf_mes']) {
      assert.ok(Number.isInteger(p[campo]) && (p[campo] === -1 || p[campo] > 0), `${p.nombre}.${campo}`)
    }
  }
})

test('los precios y límites de los planes son distintos entre sí (escalera de planes)', async () => {
  const [pagos] = await t.pool.query('SELECT precio_mensual FROM planes WHERE es_plan_prueba = 0 AND activo = 1')
  const precios = pagos.map((p) => Number(p.precio_mensual))
  assert.equal(new Set(precios).size, precios.length)
})

test('el tenant 1 existe y es la empresa migrada de la v1, exenta de pago', async () => {
  const [[t1]] = await t.pool.query('SELECT * FROM tenants WHERE id = 1')
  assert.ok(t1, 'el tenant 1 debe existir')
  assert.equal(t1.estado, 'exento')
  assert.ok(t1.slug && t1.rnc && t1.nombre)
})

test('el RNC y el slug de un tenant son únicos', async () => {
  const [[t1]] = await t.pool.query('SELECT rnc, slug FROM tenants WHERE id = 1')
  await assert.rejects(
    t.pool.query(
      "INSERT INTO tenants (nombre, slug, rnc, plan_id, estado) VALUES ('Duplicada', 'otro-slug', ?, 1, 'activo')", [t1.rnc]),
    /Duplicate entry/
  )
  await assert.rejects(
    t.pool.query(
      "INSERT INTO tenants (nombre, slug, rnc, plan_id, estado) VALUES ('Duplicada', ?, '999999999', 1, 'activo')", [t1.slug]),
    /Duplicate entry/
  )
})
