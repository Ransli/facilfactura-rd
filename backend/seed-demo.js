/**
 * Carga datos de demostración del rubro de TI: empresa emisora, categorías,
 * clientes dominicanos, catálogo de productos y servicios con precios, y
 * facturas repartidas en los últimos meses.
 *
 * Ejecutar desde la carpeta backend/:
 *   node seed-demo.js
 *
 * Requiere que ya existan los usuarios (seed-usuarios.js) y las secuencias
 * NCF (seed-ncf.js). Es idempotente: no duplica nada si se corre dos veces.
 */

import pool from './config/database.js'

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// ─── Empresa emisora ──────────────────────────────────────────
const EMPRESA = {
  nombre: 'Soluciones Digitales RD SRL',
  rnc: '131-45678-9',
  telefono: '809-555-0142',
  celular: '829-555-0142',
  email: 'facturacion@solucionesdigitalesrd.com',
  direccion: 'Av. Winston Churchill 1099, Piantini',
  ciudad: 'Santo Domingo',
  sitio_web: 'www.solucionesdigitalesrd.com',
}

// ─── Categorías ───────────────────────────────────────────────
const CATEGORIAS = [
  { nombre: 'Desarrollo Web',          tipo: 'servicio', descripcion: 'Sitios web, tiendas en línea y landing pages',       orden: 1 },
  { nombre: 'Software a la Medida',    tipo: 'servicio', descripcion: 'Sistemas de escritorio, móviles y de gestión',       orden: 2 },
  { nombre: 'Infraestructura y Nube',  tipo: 'ambos',    descripcion: 'Hosting, dominios, servidores y respaldos',          orden: 3 },
  { nombre: 'Soporte y Mantenimiento', tipo: 'servicio', descripcion: 'Soporte técnico, mantenimiento y consultoría',       orden: 4 },
  { nombre: 'Equipos y Licencias',     tipo: 'producto', descripcion: 'Hardware, periféricos y licencias de software',      orden: 5 },
]

// ─── Clientes ─────────────────────────────────────────────────
const CLIENTES = [
  { nombre: 'Ferretería El Constructor SRL', rnc: '130-11223-4', tipo: 'empresa', telefono: '809-555-0110', celular: '829-555-0110', email: 'compras@elconstructor.com.do',   direccion: 'Av. Duarte 45',            ciudad: 'Santo Domingo' },
  { nombre: 'Farmacia La Salud EIRL',        rnc: '130-22334-5', tipo: 'empresa', telefono: '809-555-0121', celular: '849-555-0121', email: 'admin@farmacialasalud.do',        direccion: 'Calle El Sol 12',          ciudad: 'Santiago' },
  { nombre: 'Transporte Caribe SRL',         rnc: '130-33445-6', tipo: 'empresa', telefono: '809-555-0132', celular: '829-555-0132', email: 'contabilidad@transportecaribe.do', direccion: 'Autopista Duarte Km 8',    ciudad: 'Santo Domingo' },
  { nombre: 'Colegio Nueva Esperanza',       rnc: '130-44556-7', tipo: 'empresa', telefono: '809-555-0143', celular: '809-555-0143', email: 'direccion@nuevaesperanza.edu.do',  direccion: 'Calle Las Palmas 8',       ciudad: 'La Vega' },
  { nombre: 'Restaurante Sabor Criollo',     rnc: '130-55667-8', tipo: 'empresa', telefono: '809-555-0154', celular: '829-555-0154', email: 'gerencia@saborcriollo.do',         direccion: 'Malecón Center, Local 4',  ciudad: 'Puerto Plata' },
  { nombre: 'Ana Mercedes Peña Rosario',     rnc: '001-1234567-8', tipo: 'persona', telefono: '809-555-0165', celular: '829-555-0165', email: 'ana.pena@correo.com',           direccion: 'Res. Los Jardines, Apt 3B', ciudad: 'Santo Domingo' },
  { nombre: 'Juan Carlos Reyes Núñez',       rnc: '402-2345678-9', tipo: 'persona', telefono: '809-555-0176', celular: '849-555-0176', email: 'jcreyes@correo.com',            direccion: 'Calle Principal 22',        ciudad: 'San Cristóbal' },
  { nombre: 'Distribuidora Del Este SRL',    rnc: '130-66778-9', tipo: 'empresa', telefono: '809-555-0187', celular: '829-555-0187', email: 'ventas@distdeleste.com.do',       direccion: 'Zona Industrial, Nave 7',  ciudad: 'San Pedro de Macorís' },
]

// ─── Catálogo. `unidad` es la abreviatura en unidades_medida ──
const ARTICULOS = [
  // Desarrollo Web
  { cat: 'Desarrollo Web', tipo: 'servicio', codigo: 'WEB-001', nombre: 'Construcción de sitio web corporativo', descripcion: 'Sitio institucional de hasta 8 páginas, responsivo y optimizado para buscadores', unidad: 'svc', precio: 85000 },
  { cat: 'Desarrollo Web', tipo: 'servicio', codigo: 'WEB-002', nombre: 'Tienda en línea (e-commerce)',          descripcion: 'Catálogo, carrito, pasarela de pago y panel de administración',                  unidad: 'svc', precio: 145000 },
  { cat: 'Desarrollo Web', tipo: 'servicio', codigo: 'WEB-003', nombre: 'Landing page promocional',              descripcion: 'Página única de campaña con formulario de captación',                            unidad: 'svc', precio: 28000 },
  { cat: 'Desarrollo Web', tipo: 'servicio', codigo: 'WEB-004', nombre: 'Rediseño de sitio existente',           descripcion: 'Renovación visual y migración de contenido',                                     unidad: 'svc', precio: 52000 },

  // Software a la medida
  { cat: 'Software a la Medida', tipo: 'servicio', codigo: 'SOF-001', nombre: 'Sistema de facturación fiscal',   descripcion: 'Sistema con NCF, reportes DGII y control de inventario',                         unidad: 'svc', precio: 195000 },
  { cat: 'Software a la Medida', tipo: 'servicio', codigo: 'SOF-002', nombre: 'Aplicación móvil (Android/iOS)',  descripcion: 'App híbrida publicada en ambas tiendas',                                         unidad: 'svc', precio: 165000 },
  { cat: 'Software a la Medida', tipo: 'servicio', codigo: 'SOF-003', nombre: 'Integración de API externa',      descripcion: 'Conexión con servicios de terceros y pasarelas',                                 unidad: 'hr',  precio: 2200 },
  { cat: 'Software a la Medida', tipo: 'servicio', codigo: 'SOF-004', nombre: 'Desarrollo por hora',             descripcion: 'Horas de desarrollo bajo demanda',                                               unidad: 'hr',  precio: 1800 },

  // Infraestructura y nube
  { cat: 'Infraestructura y Nube', tipo: 'servicio', codigo: 'INF-001', nombre: 'Hosting web anual',             descripcion: 'Alojamiento con SSL, respaldos diarios y 99.9% de disponibilidad',               unidad: 'svc', precio: 18000 },
  { cat: 'Infraestructura y Nube', tipo: 'servicio', codigo: 'INF-002', nombre: 'Registro de dominio .com.do',   descripcion: 'Registro y renovación anual del dominio',                                        unidad: 'und', precio: 3500 },
  { cat: 'Infraestructura y Nube', tipo: 'servicio', codigo: 'INF-003', nombre: 'Migración a la nube',           descripcion: 'Traslado de servidores y datos a infraestructura en la nube',                    unidad: 'svc', precio: 68000 },
  { cat: 'Infraestructura y Nube', tipo: 'producto', codigo: 'INF-004', nombre: 'Servidor NAS de respaldo 8TB',  descripcion: 'Unidad de almacenamiento en red para respaldos locales',                         unidad: 'und', precio: 47500 },

  // Soporte y mantenimiento
  { cat: 'Soporte y Mantenimiento', tipo: 'servicio', codigo: 'SOP-001', nombre: 'Mantenimiento web mensual',    descripcion: 'Actualizaciones, monitoreo y respaldo del sitio',                                unidad: 'svc', precio: 7500 },
  { cat: 'Soporte y Mantenimiento', tipo: 'servicio', codigo: 'SOP-002', nombre: 'Soporte técnico presencial',   descripcion: 'Visita técnica en sitio',                                                        unidad: 'hr',  precio: 1500 },
  { cat: 'Soporte y Mantenimiento', tipo: 'servicio', codigo: 'SOP-003', nombre: 'Consultoría en TI',            descripcion: 'Asesoría en arquitectura, seguridad y procesos',                                 unidad: 'hr',  precio: 3200 },

  // Equipos y licencias
  { cat: 'Equipos y Licencias', tipo: 'producto', codigo: 'EQP-001', nombre: 'Laptop empresarial i7 16GB',       descripcion: 'Portátil de gama corporativa con garantía de 2 años',                            unidad: 'und', precio: 78000 },
  { cat: 'Equipos y Licencias', tipo: 'producto', codigo: 'EQP-002', nombre: 'Licencia antivirus corporativo',   descripcion: 'Licencia anual por equipo',                                                      unidad: 'und', precio: 2400 },
  { cat: 'Equipos y Licencias', tipo: 'producto', codigo: 'EQP-003', nombre: 'Impresora fiscal térmica',         descripcion: 'Impresora de comprobantes compatible con DGII',                                  unidad: 'und', precio: 22500 },
]

// ─── Facturas. `mesesAtras` 0 = mes actual ────────────────────
// Los ítems son [codigo, cantidad].
const FACTURAS = [
  { cliente: '130-11223-4', mesesAtras: 5, dia: 8,  estado: 'emitida', tipo_ncf: 'B01', items: [['WEB-001', 1], ['INF-001', 1], ['INF-002', 1]] },
  { cliente: '130-22334-5', mesesAtras: 5, dia: 21, estado: 'emitida', tipo_ncf: 'B01', items: [['SOP-001', 3], ['SOP-002', 4]] },
  { cliente: '130-33445-6', mesesAtras: 4, dia: 5,  estado: 'emitida', tipo_ncf: 'B01', items: [['SOF-002', 1], ['SOF-003', 12]] },
  { cliente: '130-44556-7', mesesAtras: 4, dia: 17, estado: 'emitida', tipo_ncf: 'B01', items: [['WEB-003', 1], ['INF-001', 1]] },
  { cliente: '001-1234567-8', mesesAtras: 4, dia: 26, estado: 'emitida', tipo_ncf: 'B02', items: [['SOP-003', 5]] },
  { cliente: '130-55667-8', mesesAtras: 3, dia: 9,  estado: 'emitida', tipo_ncf: 'B01', items: [['WEB-002', 1], ['EQP-003', 2]] },
  { cliente: '130-66778-9', mesesAtras: 3, dia: 23, estado: 'emitida', tipo_ncf: 'B01', items: [['EQP-001', 4], ['EQP-002', 12]] },
  { cliente: '130-11223-4', mesesAtras: 2, dia: 6,  estado: 'emitida', tipo_ncf: 'B01', items: [['SOP-001', 1], ['SOF-004', 20]] },
  { cliente: '130-33445-6', mesesAtras: 2, dia: 14, estado: 'anulada', tipo_ncf: 'B01', items: [['INF-003', 1]] },
  { cliente: '402-2345678-9', mesesAtras: 2, dia: 27, estado: 'emitida', tipo_ncf: 'B02', items: [['WEB-003', 1]] },
  { cliente: '130-22334-5', mesesAtras: 1, dia: 4,  estado: 'emitida', tipo_ncf: 'B01', items: [['SOF-001', 1]] },
  { cliente: '130-44556-7', mesesAtras: 1, dia: 15, estado: 'emitida', tipo_ncf: 'B01', items: [['INF-004', 1], ['INF-003', 1]] },
  { cliente: '130-55667-8', mesesAtras: 1, dia: 28, estado: 'emitida', tipo_ncf: 'B01', items: [['SOP-001', 2], ['SOP-003', 3]] },
  { cliente: '130-66778-9', mesesAtras: 0, dia: 2,  estado: 'emitida', tipo_ncf: 'B01', items: [['WEB-004', 1], ['SOP-001', 1]] },
  { cliente: '130-11223-4', mesesAtras: 0, dia: 6,  estado: 'emitida', tipo_ncf: 'B01', items: [['SOF-003', 8], ['EQP-002', 5]] },
  { cliente: '001-1234567-8', mesesAtras: 0, dia: 7,  estado: 'borrador', tipo_ncf: null, items: [['SOP-002', 2]] },
]

// Fecha determinista: mismo resultado en cada corrida del mismo día.
function fechaDe(mesesAtras, dia) {
  const hoy = new Date()
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - mesesAtras, dia)
  return d.toISOString().split('T')[0]
}

const conn = await pool.getConnection()

try {
  await conn.beginTransaction()
  console.log('\nCargando datos de demostración en facilfactura_db...\n')

  // ── 1. Empresa emisora ──────────────────────────────────────
  let [emp] = await conn.query('SELECT id FROM empresas WHERE rnc = ?', [EMPRESA.rnc])
  let empresaId = emp[0]?.id

  if (!empresaId) {
    const [r] = await conn.query(
      `INSERT INTO empresas (nombre, rnc, telefono, celular, email, direccion, ciudad, sitio_web)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [EMPRESA.nombre, EMPRESA.rnc, EMPRESA.telefono, EMPRESA.celular,
       EMPRESA.email, EMPRESA.direccion, EMPRESA.ciudad, EMPRESA.sitio_web]
    )
    empresaId = r.insertId
    console.log(`  [creado]   empresa emisora → ${EMPRESA.nombre}`)
  } else {
    console.log(`  [omitido]  empresa emisora ya existe`)
  }

  // La configuración debe apuntar a la empresa, o el logo y las facturas fallan.
  const [cfgRows] = await conn.query('SELECT id, empresa_id FROM configuracion ORDER BY id LIMIT 1')
  let config = cfgRows[0]
  if (!config) {
    const [r] = await conn.query('INSERT INTO configuracion (empresa_id) VALUES (?)', [empresaId])
    const [nueva] = await conn.query('SELECT * FROM configuracion WHERE id = ?', [r.insertId])
    config = nueva[0]
    console.log('  [creado]   configuración del sistema')
  } else if (!config.empresa_id) {
    await conn.query('UPDATE configuracion SET empresa_id = ? WHERE id = ?', [empresaId, config.id])
    console.log('  [enlazado] configuración → empresa emisora')
  }

  // ── 2. Categorías ───────────────────────────────────────────
  const catIds = {}
  for (const c of CATEGORIAS) {
    const [existe] = await conn.query('SELECT id FROM categorias WHERE nombre = ?', [c.nombre])
    if (existe[0]) {
      catIds[c.nombre] = existe[0].id
      continue
    }
    const [r] = await conn.query(
      'INSERT INTO categorias (nombre, tipo, descripcion, orden) VALUES (?, ?, ?, ?)',
      [c.nombre, c.tipo, c.descripcion, c.orden]
    )
    catIds[c.nombre] = r.insertId
    console.log(`  [creado]   categoría → ${c.nombre}`)
  }

  // ── 3. Clientes ─────────────────────────────────────────────
  const cliIds = {}
  for (const c of CLIENTES) {
    const [existe] = await conn.query('SELECT id FROM clientes WHERE rnc = ?', [c.rnc])
    if (existe[0]) {
      cliIds[c.rnc] = existe[0].id
      continue
    }
    const [r] = await conn.query(
      `INSERT INTO clientes (nombre, rnc, telefono, celular, email, direccion, ciudad, tipo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.nombre, c.rnc, c.telefono, c.celular, c.email, c.direccion, c.ciudad, c.tipo]
    )
    cliIds[c.rnc] = r.insertId
    console.log(`  [creado]   cliente → ${c.nombre}`)
  }

  // ── 4. Artículos y precios ──────────────────────────────────
  const [uds] = await conn.query('SELECT id, abreviatura FROM unidades_medida')
  const udId = Object.fromEntries(uds.map(u => [u.abreviatura, u.id]))

  const artIds = {}
  for (const a of ARTICULOS) {
    const unidadId = udId[a.unidad]
    if (!unidadId) throw new Error(`No existe la unidad de medida '${a.unidad}'. ¿Corriste schema.sql?`)

    const [existe] = await conn.query('SELECT id FROM articulos WHERE codigo = ?', [a.codigo])
    if (existe[0]) {
      artIds[a.codigo] = { id: existe[0].id, unidadId, precio: a.precio }
      continue
    }

    const [r] = await conn.query(
      `INSERT INTO articulos (categoria_id, tipo, codigo, nombre, descripcion, unidad_medida_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [catIds[a.cat], a.tipo, a.codigo, a.nombre, a.descripcion, unidadId]
    )
    const articuloId = r.insertId

    // Precio por defecto, más un precio de mayoreo con 10% de descuento.
    await conn.query(
      `INSERT INTO articulo_precios
        (articulo_id, unidad_medida_id, precio_unitario, precio_detalle, precio_mayoreo, es_precio_default)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [articuloId, unidadId, a.precio, a.precio, round2(a.precio * 0.9)]
    )

    artIds[a.codigo] = { id: articuloId, unidadId, precio: a.precio }
    console.log(`  [creado]   ${a.tipo === 'servicio' ? 'servicio' : 'producto'} → ${a.codigo} ${a.nombre}`)
  }

  // ── 5. Facturas ─────────────────────────────────────────────
  const [yaHay] = await conn.query('SELECT COUNT(*) AS n FROM facturas')
  if (yaHay[0].n > 0) {
    console.log(`\n  [omitido]  ya existen ${yaHay[0].n} factura(s); no se generan las de demo`)
  } else {
    const itbisPct    = Number(config.itbis_porcentaje ?? 18)
    const retItbisPct = Number(config.ret_itbis_porcentaje ?? 100)
    const retIsrPct   = Number(config.ret_isr_porcentaje ?? 10)
    const prefijo     = config.factura_prefijo || 'F'

    // Un usuario al que atribuir las facturas.
    const [us] = await conn.query("SELECT id FROM usuarios WHERE email = 'admin@facilfactura.com'")
    const usuarioId = us[0]?.id || null

    // Secuencias NCF vigentes, indexadas por tipo.
    const [seqs] = await conn.query('SELECT * FROM nfc_secuencias WHERE activo = 1')
    const porTipo = Object.fromEntries(seqs.map(s => [s.tipo_ncf, { ...s }]))

    let numeroFactura = Number(config.factura_ultimo_numero || 0)
    let creadas = 0

    for (const f of FACTURAS) {
      const clienteId = cliIds[f.cliente]
      if (!clienteId) throw new Error(`Cliente ${f.cliente} no encontrado`)

      // Los borradores no llevan NCF: aún no son comprobantes fiscales.
      let secuenciaId = null
      let ncfNumero   = null

      if (f.tipo_ncf) {
        const seq = porTipo[f.tipo_ncf]
        if (!seq) throw new Error(`No hay secuencia NCF activa del tipo ${f.tipo_ncf}. Corre seed-ncf.js`)

        const siguiente = Math.max(seq.ultimo_usado + 1, seq.desde)
        if (siguiente > seq.hasta) throw new Error(`Secuencia ${f.tipo_ncf} agotada`)

        seq.ultimo_usado = siguiente
        secuenciaId = seq.id
        ncfNumero   = `${seq.tipo_ncf}${String(siguiente).padStart(10, '0')}`
      }

      const lineas = f.items.map(([codigo, cantidad]) => {
        const art = artIds[codigo]
        if (!art) throw new Error(`Artículo ${codigo} no encontrado`)
        return { ...art, cantidad, subtotal: round2(cantidad * art.precio) }
      })

      // Misma fórmula que POST /api/facturas: el total descuenta el ISR.
      const subtotal = round2(lineas.reduce((s, l) => s + l.subtotal, 0))
      const itbis    = round2(subtotal * (itbisPct / 100))
      const retItbis = round2(itbis * (retItbisPct / 100))
      const retIsr   = round2(subtotal * (retIsrPct / 100))
      const total    = round2(subtotal - retIsr)

      numeroFactura += 1
      const numero = `${prefijo}${String(numeroFactura).padStart(6, '0')}`
      const fecha  = fechaDe(f.mesesAtras, f.dia)

      const [r] = await conn.query(
        `INSERT INTO facturas
          (numero, nfc_secuencia_id, nfc_numero, fecha, cliente_id, empresa_id,
           subtotal, itbis, ret_itbis, ret_isr, total, estado, usuario_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero, secuenciaId, ncfNumero, fecha, clienteId, empresaId,
         subtotal, itbis, retItbis, retIsr, total, f.estado, usuarioId, `${fecha} 10:00:00`]
      )

      let orden = 1
      for (const l of lineas) {
        await conn.query(
          `INSERT INTO factura_items
            (factura_id, articulo_id, cantidad, unidad_medida_id, precio_unitario, tipo_precio, subtotal, orden)
           VALUES (?, ?, ?, ?, ?, 'unitario', ?, ?)`,
          [r.insertId, l.id, l.cantidad, l.unidadId, l.precio, l.subtotal, orden++]
        )
      }

      creadas++
      console.log(`  [creado]   factura ${numero} | ${fecha} | ${f.estado.padEnd(8)} | ${ncfNumero || '—'.padEnd(13)} | RD$${total.toLocaleString('es-DO')}`)
    }

    // Persistir los contadores que avanzamos.
    for (const seq of Object.values(porTipo)) {
      await conn.query('UPDATE nfc_secuencias SET ultimo_usado = ? WHERE id = ?', [seq.ultimo_usado, seq.id])
    }
    await conn.query('UPDATE configuracion SET factura_ultimo_numero = ? WHERE id = ?', [numeroFactura, config.id])

    console.log(`\n  ${creadas} facturas generadas`)
  }

  await conn.commit()
  console.log('\nListo. Entra al Panel para ver el resumen con datos.\n')
} catch (err) {
  await conn.rollback()
  console.error('\nError, no se cambió nada:', err.message, '\n')
  process.exitCode = 1
} finally {
  conn.release()
  process.exit()
}
