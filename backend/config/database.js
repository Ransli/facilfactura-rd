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

// La opción `timezone` de arriba solo afecta cómo el driver convierte DATETIME/TIMESTAMP hacia y desde JS: NO
// cambia la hora que usa el propio servidor en NOW()/CURDATE() (sigue la del sistema donde corre MySQL, que en
// un servidor en la nube suele ser UTC). Sin esto, "hoy" y "este mes" del panel de control quedarían calculados
// en UTC en vez de en la hora de República Dominicana (UTC-4, sin horario de verano) — mal durante las primeras
// horas de cada día. Se fija la zona de la SESIÓN en cada conexión física del pool.
pool.on('connection', (conn) => conn.query("SET time_zone = '-04:00'"))

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
