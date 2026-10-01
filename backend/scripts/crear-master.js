/**
 * Crea (o actualiza la contraseña de) un usuario de la consola master.
 *
 *   node scripts/crear-master.js "Ransli García" ransli@facilfactura.com "una-clave-larga"
 *
 * Si el email ya existe, actualiza su nombre y su contraseña (sirve para el primer master y para recuperar el
 * acceso). No se puede correr sin argumentos: no interactúa, para poder usarse también en un script de despliegue.
 */
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import pool from '../config/database.js'

dotenv.config()

const [, , nombre, email, password] = process.argv
if (!nombre || !email || !password) {
  console.error('Uso: node scripts/crear-master.js "Nombre completo" email@dominio.com "contraseña"')
  process.exit(1)
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres')
  process.exit(1)
}

const hash = await bcrypt.hash(password, 10)
const [r] = await pool.query(
  `INSERT INTO usuarios_plataforma (nombre, email, password_hash) VALUES (?, ?, ?)
   ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password_hash = VALUES(password_hash), activo = 1`,
  [nombre, email, hash])
await pool.end()

console.log(`✔  Master "${nombre}" (${email}) listo. id=${r.insertId || '(actualizado)'}`)
