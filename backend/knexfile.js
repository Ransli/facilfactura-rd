import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.join(__dirname, '..', 'database')

// La base de la plataforma SaaS. La v1 (mono-empresa) sigue en facilfactura_db
// y queda intacta como evidencia de Seminario de Proyecto I.
export const DB_NAME = process.env.DB_NAME || 'facilfactura_saas'

export const conexion = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  charset:  'utf8mb4',
}

export default {
  client: 'mysql2',
  connection: { ...conexion, database: DB_NAME },
  migrations: { directory: path.join(raiz, 'migrations'), tableName: 'knex_migrations', extension: 'js' },
  seeds:      { directory: path.join(raiz, 'seeds') },
}
