/**
 * Copia los datos de la v1 (facilfactura_db, mono-empresa) a la base de la plataforma
 * para arrancar con la información existente. La v1 no se modifica.
 *
 * Uso (desde backend/):
 *   node scripts/copy-from-v1.js            # origen: facilfactura_db, tenant destino: 1
 *   SOURCE_DB=otra_bd node scripts/copy-from-v1.js --tenant=2
 *
 * Es seguro repetirlo: vacía las tablas de negocio de la base destino antes de copiar.
 * Si la base destino ya tiene la columna tenant_id, los datos copiados se asignan al tenant indicado.
 */
import mysql from 'mysql2/promise'
import { conexion, DB_NAME } from '../knexfile.js'

const ORIGEN = process.env.SOURCE_DB || 'facilfactura_db'
const tenantArg = process.argv.find(a => a.startsWith('--tenant='))
const TENANT_ID = tenantArg ? Number(tenantArg.split('=')[1]) : 1

if (ORIGEN === DB_NAME) {
  console.error('✘  El origen y el destino son la misma base de datos.')
  process.exit(1)
}

// Orden que respeta las claves foráneas (padres antes que hijos)
const TABLAS = [
  'roles', 'usuarios', 'empresas', 'clientes', 'metodos_pago', 'categorias', 'tipos_servicio',
  'unidades_medida', 'articulos', 'articulo_precios', 'nfc_secuencias', 'configuracion',
  'facturas', 'factura_items',
]

const cn = await mysql.createConnection({ ...conexion, multipleStatements: false })
const columnas = async (bd, tabla) => {
  const [rows] = await cn.query(
    'SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [bd, tabla]
  )
  return rows.map(r => r.c)
}

await cn.query('SET FOREIGN_KEY_CHECKS = 0')
for (const t of [...TABLAS].reverse()) await cn.query(`TRUNCATE TABLE \`${DB_NAME}\`.\`${t}\``)

for (const t of TABLAS) {
  const src = await columnas(ORIGEN, t)
  const dst = await columnas(DB_NAME, t)
  const comunes = dst.filter(c => src.includes(c))
  const extra = dst.includes('tenant_id') && !src.includes('tenant_id') ? ['tenant_id'] : []
  const lista = [...comunes, ...extra].map(c => `\`${c}\``).join(', ')
  const valores = [...comunes.map(c => `\`${c}\``), ...extra.map(() => String(TENANT_ID))].join(', ')
  const [r] = await cn.query(`INSERT INTO \`${DB_NAME}\`.\`${t}\` (${lista}) SELECT ${valores} FROM \`${ORIGEN}\`.\`${t}\``)
  console.log(`  ${t.padEnd(18)} ${String(r.affectedRows).padStart(4)} filas`)
}
await cn.query('SET FOREIGN_KEY_CHECKS = 1')
await cn.end()
console.log(`✔  Datos de ${ORIGEN} copiados a ${DB_NAME}`)
