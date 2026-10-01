import '../helpers/entorno.js'
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pool from '../../config/database.js'
import { hoyRD } from '../../services/suscripcion/estado.js'

after(async () => { await pool.end() })

// El servidor de MySQL puede estar en cualquier zona horaria (en un servidor en la nube, normalmente UTC);
// la sesión de la aplicación siempre debe quedar fijada a la de República Dominicana (UTC-4), para que NOW() y
// CURDATE() del lado de la base de datos coincidan con hoyRD() del lado de Node. Ver config/database.js.
test('cada conexión del pool queda en la zona horaria de RD (UTC-4), sin importar la del servidor', async () => {
  const [[fila]] = await pool.query('SELECT @@session.time_zone AS zona')
  assert.equal(fila.zona, '-04:00')
})

test('CURDATE() en la base de datos coincide con hoyRD() de la aplicación', async () => {
  const [[fila]] = await pool.query('SELECT CURDATE() AS hoy')
  const curdate = fila.hoy instanceof Date ? fila.hoy.toLocaleDateString('en-CA') : String(fila.hoy).slice(0, 10)
  assert.equal(curdate, hoyRD())
})

test('una conexión nueva del pool también queda fijada (no solo la primera)', async () => {
  const conexiones = await Promise.all(Array.from({ length: 5 }, () => pool.getConnection()))
  try {
    for (const conn of conexiones) {
      const [[fila]] = await conn.query('SELECT @@session.time_zone AS zona')
      assert.equal(fila.zona, '-04:00')
    }
  } finally {
    for (const conn of conexiones) conn.release()
  }
})
