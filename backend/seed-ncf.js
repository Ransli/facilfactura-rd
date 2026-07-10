/**
 * Registra las secuencias NCF iniciales, una por cada tipo de comprobante.
 * Ejecutar desde la carpeta backend/:
 *   node seed-ncf.js
 *
 * Los códigos siguen la Norma General 06-2018 de la DGII.
 */

import pool from './config/database.js'

const VENCIMIENTO = '2026-12-31'
const DESDE = 1
const HASTA = 500

const SECUENCIAS = [
  { tipo_ncf: 'B01', descripcion: 'Crédito Fiscal' },
  { tipo_ncf: 'B02', descripcion: 'Consumidor Final' },
  { tipo_ncf: 'B11', descripcion: 'Proveedores Informales' },
  { tipo_ncf: 'B14', descripcion: 'Regímenes Especiales' },
  { tipo_ncf: 'B15', descripcion: 'Gubernamental' },
  { tipo_ncf: 'B16', descripcion: 'Exportaciones' },
]

// El sistema alerta cuando se consume el 80% del rango, igual que hace
// el endpoint POST /api/nfc.
const alertaDesde = Math.floor(HASTA * 0.8)

console.log('\nRegistrando secuencias NCF en facilfactura_db...\n')

for (const s of SECUENCIAS) {
  const [existe] = await pool.query(
    'SELECT id FROM nfc_secuencias WHERE tipo_ncf = ? AND desde = ? AND hasta = ?',
    [s.tipo_ncf, DESDE, HASTA]
  )
  if (existe.length > 0) {
    console.log(`  [omitido]  ${s.tipo_ncf} ${DESDE}-${HASTA} ya existe`)
    continue
  }

  await pool.query(
    `INSERT INTO nfc_secuencias
       (tipo_ncf, descripcion, desde, hasta, ultimo_usado, alerta_desde, fecha_vencimiento, activo)
     VALUES (?, ?, ?, ?, 0, ?, ?, 1)`,
    [s.tipo_ncf, s.descripcion, DESDE, HASTA, alertaDesde, VENCIMIENTO]
  )
  console.log(
    `  [creado]   ${s.tipo_ncf} | ${s.descripcion.padEnd(23)} | ${DESDE}-${HASTA} | alerta al ${alertaDesde} | vence ${VENCIMIENTO}`
  )
}

console.log('\nListo. Las secuencias quedan activas y disponibles al facturar.\n')

process.exit(0)
