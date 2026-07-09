import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const DB_NAME = process.env.DB_NAME || 'facilfactura_db'

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               Number(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           DB_NAME,
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '-04:00',
})

export async function testConnection() {
  try {
    const conn = await pool.getConnection()
    console.log('✔  Conectado a MySQL —', DB_NAME)
    conn.release()
  } catch (err) {
    console.error('✘  Error de conexión a MySQL:', err.message)
    process.exit(1)
  }
}

export default pool
