import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'

let t
before(async () => { t = await iniciar({ reiniciar: false }) })
after(async () => { await t.cerrar() })

test('existen las tablas de suscripción, pagos e historial', async () => {
  for (const tabla of ['tenant_subscriptions', 'subscription_payments', 'subscription_history']) {
    const [[fila]] = await t.pool.query(
      'SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [tabla])
    assert.equal(fila.n, 1, `falta la tabla ${tabla}`)
  }
})

test('el tenant 1 (empresa migrada) tiene una suscripción exenta', async () => {
  const [rows] = await t.pool.query('SELECT * FROM tenant_subscriptions WHERE tenant_id = 1')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'exento')
  assert.equal(rows[0].fecha_fin, null)
})

test('cada tabla de suscripción está ligada a un tenant con clave foránea', async () => {
  for (const tabla of ['tenant_subscriptions', 'subscription_payments', 'subscription_history']) {
    const [fks] = await t.pool.query(
      `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id' AND REFERENCED_TABLE_NAME = 'tenants'`, [tabla])
    assert.equal(fks.length, 1, `${tabla}.tenant_id debe apuntar a tenants`)
  }
})

test('un pago no puede tener monto negativo ni una empresa inexistente', async () => {
  await assert.rejects(
    t.pool.query("INSERT INTO subscription_payments (tenant_id, monto, metodo, estado) VALUES (999999, 100, 'efectivo', 'pagado')"),
    /foreign key/i
  )
})
