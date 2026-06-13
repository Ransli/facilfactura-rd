/**
 * Crea los usuarios iniciales del sistema.
 * Ejecutar desde la carpeta backend/:
 *   cd backend && node ../database/seed-usuarios.js
 */

import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '../backend/.env') })

const pool = await mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'facilfactura_db',
})

const USUARIOS = [
  { nombre: 'Administrador',  email: 'admin@facilfactura.com',      password: 'Admin2025!',   rol_id: 1 },
  { nombre: 'Facturador',     email: 'facturador@facilfactura.com', password: 'Factura2025!', rol_id: 2 },
  { nombre: 'Visor',          email: 'visor@facilfactura.com',      password: 'Visor2025!',   rol_id: 3 },
]

console.log('\nCreando usuarios iniciales en facilfactura_db...\n')

for (const u of USUARIOS) {
  const hash = await bcrypt.hash(u.password, 10)

  const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [u.email])
  if (existe.length > 0) {
    console.log(`  [omitido]  ${u.email} ya existe`)
    continue
  }

  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)`,
    [u.nombre, u.email, hash, u.rol_id]
  )
  console.log(`  [creado]   ${u.nombre.padEnd(15)} | ${u.email.padEnd(38)} | pass: ${u.password}`)
}

console.log('\nListo. Puedes iniciar sesion con cualquiera de los usuarios anteriores.\n')

await pool.end()
