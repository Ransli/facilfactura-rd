/**
 * Genera database/schema-saas.sql: el esquema COMPLETO de la plataforma (todas las tablas y los datos
 * de referencia) en un solo archivo, para consultarlo o importarlo sin correr las migraciones.
 *
 * No se escribe a mano. Se construye migrando una base temporal vacía, así que no incluye datos de
 * ninguna empresa. Hay que regenerarlo cada vez que se agregue una migración:
 *
 *   npm run db:dump-schema        (desde backend/)
 *
 * Importarlo:  mysql -u root -p < database/schema-saas.sql
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import mysqlSync from 'mysql2'
import knex from 'knex'
import configKnex, { conexion, DB_NAME } from '../knexfile.js'

const SALIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'schema-saas.sql')
const TEMPORAL = `${DB_NAME}_dump_tmp`

// Tablas cuyos datos forman parte del esquema (catálogos que la aplicación necesita para arrancar)
const TABLAS_REFERENCIA = ['roles', 'tipos_servicio', 'unidades_medida', 'configuracion']

const admin = await mysql.createConnection(conexion)
await admin.query(`DROP DATABASE IF EXISTS \`${TEMPORAL}\``)
await admin.query(`CREATE DATABASE \`${TEMPORAL}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)

let sql = ''
try {
  const db = knex({ ...configKnex, connection: { ...configKnex.connection, database: TEMPORAL } })
  await db.migrate.latest()
  const [aplicadas] = await db.migrate.list()
  await db.destroy()

  const cn = await mysql.createConnection({ ...conexion, database: TEMPORAL })
  const [filas] = await cn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"')
  const tablas = filas.map((f) => Object.values(f)[0]).filter((t) => !t.startsWith('knex_')).sort()

  sql += `-- ============================================================
-- FácilFactura RD — esquema de la plataforma SaaS (base ${DB_NAME})
-- ARCHIVO GENERADO con "npm run db:dump-schema": no editar a mano.
-- Fuente de verdad: database/migrations/ (${aplicadas.length} migraciones aplicadas al generar este archivo).
-- Contiene ${tablas.length} tablas y los datos de referencia; no contiene datos de ninguna empresa.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${DB_NAME}\`;

`
  for (const t of tablas) {
    const [[fila]] = await cn.query(`SHOW CREATE TABLE \`${t}\``)
    sql += `-- Tabla ${t}\n${fila['Create Table']};\n\n`
  }

  for (const t of TABLAS_REFERENCIA.filter((x) => tablas.includes(x))) {
    const [datos] = await cn.query(`SELECT * FROM \`${t}\``)
    if (!datos.length) continue
    const columnas = Object.keys(datos[0])
    const valores = datos.map((d) => '  (' + columnas.map((c) => mysqlSync.escape(d[c])).join(', ') + ')')
    sql += `-- Datos de referencia: ${t}\nINSERT INTO \`${t}\` (${columnas.map((c) => `\`${c}\``).join(', ')}) VALUES\n${valores.join(',\n')};\n\n`
  }
  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n'
  await cn.end()
} finally {
  await admin.query(`DROP DATABASE IF EXISTS \`${TEMPORAL}\``)
  await admin.end()
}

fs.writeFileSync(SALIDA, sql, 'utf8')
console.log(`✔  ${path.relative(process.cwd(), SALIDA)} generado (${sql.split('\n').length} líneas)`)
