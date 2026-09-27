/**
 * Prepara la base de pruebas desde cero: la borra, la crea y aplica todas las migraciones.
 * Lo ejecuta `npm test` (pretest). Solo actúa sobre facilfactura_test.
 */
import { BD_PRUEBAS } from './helpers/entorno.js'
import mysql from 'mysql2/promise'
import knex from 'knex'
import configKnex, { conexion, DB_NAME } from '../knexfile.js'

if (DB_NAME !== BD_PRUEBAS) {
  console.error(`✘  Se esperaba ${BD_PRUEBAS} y se obtuvo ${DB_NAME}. No se toca nada.`)
  process.exit(1)
}

const admin = await mysql.createConnection(conexion)
await admin.query(`DROP DATABASE IF EXISTS \`${BD_PRUEBAS}\``)
await admin.query(`CREATE DATABASE \`${BD_PRUEBAS}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
await admin.end()

const db = knex(configKnex)
const [, migraciones] = await db.migrate.latest()
await db.destroy()
console.log(`✔  ${BD_PRUEBAS} lista (${migraciones.length} migraciones aplicadas)`)
