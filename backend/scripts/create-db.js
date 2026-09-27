/**
 * Crea la base de datos de la plataforma si no existe (vacía, utf8mb4).
 * Las tablas las crean las migraciones:  npm run db:create && npm run db:migrate
 */
import mysql from 'mysql2/promise'
import { conexion, DB_NAME } from '../knexfile.js'

const cn = await mysql.createConnection(conexion)
await cn.query(
  `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
)
await cn.end()
console.log(`✔  Base de datos "${DB_NAME}" lista`)
