/**
 * Crea los usuarios iniciales del sistema.
 * Ejecutar desde la carpeta backend/:
 *   node seed-usuarios.js
 */

import bcrypt from 'bcryptjs'
import pool from './config/database.js'

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

process.exit(0)
