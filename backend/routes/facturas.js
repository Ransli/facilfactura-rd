import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloFacturador, soloAdmin } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Calcula el subtotal de un ítem replicando la lógica de la factura:
// si el artículo tiene dimensiones (ancho y alto), se multiplica por el área.
function subtotalItem({ cantidad, precio_unitario, ancho, alto }) {
  const area = ancho && alto ? Number(ancho) * Number(alto) : 1
  return round2(Number(cantidad) * Number(precio_unitario) * area)
}

// GET /api/facturas?estado=&cliente_id=&desde=&hasta=&buscar=
router.get('/', async (req, res) => {
  const { estado, cliente_id, desde, hasta, buscar } = req.query
  try {
    let sql = `
      SELECT f.*, c.nombre AS cliente_nombre, c.rnc AS cliente_rnc
      FROM facturas f
      JOIN clientes c ON c.id = f.cliente_id
      WHERE 1 = 1`
    const params = []

    if (estado)     { sql += ` AND f.estado = ?`;     params.push(estado) }
    if (cliente_id) { sql += ` AND f.cliente_id = ?`; params.push(cliente_id) }
    if (desde)      { sql += ` AND f.fecha >= ?`;     params.push(desde) }
    if (hasta)      { sql += ` AND f.fecha <= ?`;     params.push(hasta) }
    if (buscar)     { sql += ` AND (f.numero LIKE ? OR f.nfc_numero LIKE ?)`; params.push(`%${buscar}%`, `%${buscar}%`) }

    sql += ` ORDER BY f.fecha DESC, f.id DESC`
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// GET /api/facturas/:id — factura con sus ítems, cliente y empresa
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, c.nombre AS cliente_nombre, c.rnc AS cliente_rnc,
              c.telefono AS cliente_telefono, c.celular AS cliente_celular, c.direccion AS cliente_direccion,
              e.nombre AS empresa_nombre, e.rnc AS empresa_rnc, e.logo_path,
              ts.nombre AS tipo_servicio_nombre
       FROM facturas f
       JOIN clientes c ON c.id = f.cliente_id
       LEFT JOIN empresas e ON e.id = f.empresa_id
       LEFT JOIN tipos_servicio ts ON ts.id = f.tipo_servicio_id
       WHERE f.id = ?`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Factura no encontrada' })

    const [items] = await pool.query(
      `SELECT fi.*, a.nombre AS articulo_nombre, a.categoria_id,
              cat.nombre AS categoria_nombre, cat.orden AS categoria_orden,
              u.nombre AS unidad_nombre, u.abreviatura AS unidad_abreviatura
       FROM factura_items fi
       JOIN articulos a ON a.id = fi.articulo_id
       JOIN categorias cat ON cat.id = a.categoria_id
       JOIN unidades_medida u ON u.id = fi.unidad_medida_id
       WHERE fi.factura_id = ?
       ORDER BY fi.orden, fi.id`,
      [req.params.id]
    )
    rows[0].items = items

    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/facturas — emite una factura: asigna NCF, calcula impuestos y guarda
router.post('/', soloFacturador, async (req, res) => {
  const { cliente_id, empresa_id, tipo_servicio_id, fecha, vencimiento, servicio, items } = req.body

  if (!cliente_id || !empresa_id) {
    return res.status(400).json({ ok: false, mensaje: 'cliente_id y empresa_id son requeridos' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'La factura debe tener al menos un artículo' })
  }

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    // 1. Configuración fiscal
    const [cfgRows] = await conn.query('SELECT * FROM configuracion ORDER BY id LIMIT 1')
    const config = cfgRows[0]
    if (!config) {
      await conn.rollback()
      return res.status(400).json({ ok: false, mensaje: 'No hay configuración del sistema. Configúrala primero.' })
    }

    // 2. Secuencia NCF activa (bloqueada para la transacción)
    const [seqRows] = await conn.query(
      'SELECT * FROM nfc_secuencias WHERE activo = 1 LIMIT 1 FOR UPDATE'
    )
    const seq = seqRows[0]
    if (!seq) {
      await conn.rollback()
      return res.status(400).json({ ok: false, mensaje: 'No hay una secuencia NCF activa. Registra una en la sección NCF.' })
    }

    const siguienteNcf = Math.max(seq.ultimo_usado + 1, seq.desde)
    if (siguienteNcf > seq.hasta) {
      await conn.rollback()
      return res.status(400).json({
        ok: false,
        mensaje: 'La secuencia NCF activa está agotada. Registra una nueva secuencia autorizada por la DGII.',
      })
    }
    const nfc_numero = `${seq.tipo_ncf}${String(siguienteNcf).padStart(10, '0')}`

    // 3. Número de factura correlativo
    const siguienteFactura = (config.factura_ultimo_numero || 0) + 1
    const numero = `${config.factura_prefijo || 'F'}${String(siguienteFactura).padStart(6, '0')}`

    // 4. Cálculo de impuestos (misma lógica que la vista de factura)
    const subtotal  = round2(items.reduce((s, i) => s + subtotalItem(i), 0))
    const itbis     = round2(subtotal * (Number(config.itbis_porcentaje) / 100))
    const ret_itbis = round2(itbis * (Number(config.ret_itbis_porcentaje) / 100))
    const ret_isr   = round2(subtotal * (Number(config.ret_isr_porcentaje) / 100))
    const total     = round2(subtotal - ret_isr)

    // 5. Insertar la factura
    const [facResult] = await conn.query(
      `INSERT INTO facturas
        (numero, nfc_secuencia_id, nfc_numero, tipo_servicio_id, fecha, vencimiento,
         cliente_id, empresa_id, servicio, subtotal, itbis, ret_itbis, ret_isr, total, estado, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?)`,
      [numero, seq.id, nfc_numero, tipo_servicio_id || null, fecha, vencimiento || null,
       cliente_id, empresa_id, servicio || null, subtotal, itbis, ret_itbis, ret_isr, total,
       req.usuario?.id || null]
    )
    const facturaId = facResult.insertId

    // 6. Insertar los ítems
    let orden = 1
    for (const i of items) {
      await conn.query(
        `INSERT INTO factura_items
          (factura_id, articulo_id, descripcion_custom, cantidad, ancho, alto,
           unidad_medida_id, precio_unitario, tipo_precio, subtotal, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [facturaId, i.articulo_id, i.descripcion_custom || null, i.cantidad,
         i.ancho || null, i.alto || null, i.unidad_medida_id, i.precio_unitario,
         i.tipo_precio || 'unitario', subtotalItem(i), orden++]
      )
    }

    // 7. Avanzar contadores (NCF y número de factura)
    await conn.query('UPDATE nfc_secuencias SET ultimo_usado = ? WHERE id = ?', [siguienteNcf, seq.id])
    await conn.query('UPDATE configuracion SET factura_ultimo_numero = ? WHERE id = ?', [siguienteFactura, config.id])

    await conn.commit()

    const [rows] = await pool.query('SELECT * FROM facturas WHERE id = ?', [facturaId])

    // 8. Alerta si la secuencia NCF se está agotando
    const disponibles = seq.hasta - siguienteNcf
    const alerta_ncf = siguienteNcf >= seq.alerta_desde
    res.status(201).json({
      ok: true,
      data: rows[0],
      alerta_ncf,
      alerta_ncf_mensaje: alerta_ncf
        ? `⚠️ Te quedan ${disponibles} comprobantes fiscales. Solicita una nueva secuencia NCF a la DGII.`
        : null,
    })
  } catch (err) {
    await conn.rollback()
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conn.release()
  }
})

// PUT /api/facturas/:id/anular — anula una factura (solo admin)
router.put('/:id/anular', soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT estado FROM facturas WHERE id = ?', [req.params.id])
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Factura no encontrada' })
    if (rows[0].estado === 'anulada') {
      return res.status(400).json({ ok: false, mensaje: 'La factura ya está anulada' })
    }

    await pool.query("UPDATE facturas SET estado = 'anulada', updated_at = NOW() WHERE id = ?", [req.params.id])
    res.json({ ok: true, mensaje: 'Factura anulada' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
