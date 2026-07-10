/**
 * Repara los acentos que se perdieron al importar schema.sql con un cliente
 * mysql que no anunciaba utf8mb4 (el de Windows usa cp850 por defecto).
 * Los caracteres no representables llegaron a la base como '?' literal.
 *
 * Ejecutar desde la carpeta backend/:
 *   node fix-acentos.js
 *
 * Es idempotente: si los textos ya están bien, no cambia nada.
 */

import pool from './config/database.js'

// Los valores correctos, tal como aparecen en database/schema.sql.
const TIPOS_SERVICIO = [
  ['Instalación de rótulos y señalización', 'Servicio de instalación de materiales publicitarios y señalización'],
  ['Impresión de materiales publicitarios', 'Impresión de banners, lonas, vinilos y materiales gráficos'],
  ['Diseño gráfico',                        'Creación y diseño de artes, logos y materiales gráficos'],
  ['Alquiler de equipos',                   'Renta de grúas, plataformas y equipos especiales para instalación'],
  ['Venta de materiales',                   'Venta al detalle de materiales: lonas, yaldas, vinilos y similares'],
  ['Mano de obra',                          'Servicios de instalación, montaje y trabajo manual'],
  ['Servicio general',                      'Servicio de naturaleza general'],
]

const UNIDADES = [
  ['m²',  'Metro cuadrado'],
  ['cm',  'Centímetro'],
  ['día', 'Día'],
]

// 'Diseño gráfico' → 'Dise_o gr_fico': el patrón que MySQL guardó, con '?'
// donde iba el carácter no representable. Se compara por posición para no
// pisar otra fila. Incluye el superíndice de 'm²', no solo los acentos.
const comoPatron = (texto) => texto.replace(/[^\x20-\x7E]/g, '_')

console.log('\nReparando acentos en facilfactura_db...\n')

let arreglados = 0

for (const [nombre, descripcion] of TIPOS_SERVICIO) {
  const [res] = await pool.query(
    `UPDATE tipos_servicio SET nombre = ?, descripcion = ?
     WHERE nombre LIKE ? AND (nombre <> ? OR descripcion <> ?)`,
    [nombre, descripcion, comoPatron(nombre), nombre, descripcion]
  )
  if (res.affectedRows > 0) {
    console.log(`  [reparado] tipos_servicio  → ${nombre}`)
    arreglados += res.affectedRows
  }
}

for (const [abreviatura, nombre] of UNIDADES) {
  const [res] = await pool.query(
    `UPDATE unidades_medida SET nombre = ?, abreviatura = ?
     WHERE abreviatura LIKE ? AND (nombre <> ? OR abreviatura <> ?)`,
    [nombre, abreviatura, comoPatron(abreviatura), nombre, abreviatura]
  )
  if (res.affectedRows > 0) {
    console.log(`  [reparado] unidades_medida → ${nombre} (${abreviatura})`)
    arreglados += res.affectedRows
  }
}

console.log(
  arreglados === 0
    ? '\nNada que reparar: los textos ya estaban correctos.\n'
    : `\nListo. ${arreglados} fila(s) reparada(s).\n`
)

process.exit(0)
