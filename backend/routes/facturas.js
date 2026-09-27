import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloFacturador, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'
import { primeraReferenciaAjena, esReferenciaInexistente, mensajeReferencia } from '../utils/referencias.js'
import { esTipoElectronico } from '../services/ecf/secuencias.js'
import { emitirEcf, credencialesDeLaEmpresa, verificarCupoEcf } from '../services/ecf/emision.js'
import { ErrorDeEcf } from '../services/ecf/formato.js'

const router = Router()
router.use(verificarToken, agregarTenantId, verificarSuscripcion)

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Calcula el subtotal de un ítem replicando la lógica de la factura:
// si el artículo tiene dimensiones (ancho y alto), se multiplica por el área.
function subtotalItem({ cantidad, precio_unitario, ancho, alto }) {
  const area = ancho && alto ? Number(ancho) * Number(alto) : 1
  return round2(Number(cantidad) * Number(precio_unitario) * area)
}

// Devuelve el motivo si algún ítem no es facturable, o null si todos son válidos.
// Se valida antes de abrir la transacción para no consumir NCF ni número de factura.
function motivoItemInvalido(items) {
  for (const [i, item] of items.entries()) {
    const n = i + 1
    if (!(Number(item.cantidad) > 0)) return `La cantidad del ítem ${n} debe ser mayor que cero`
    if (!(Number(item.precio_unitario) >= 0)) return `El precio del ítem ${n} no puede ser negativo`
    for (const medida of ['ancho', 'alto']) {
      if (item[medida] != null && item[medida] !== '' && !(Number(item[medida]) > 0)) {
        return `El ${medida} del ítem ${n} debe ser mayor que cero`
      }
    }
  }
  return null
}

// Referencias de la factura que deben existir dentro de la empresa (sin repetir consultas por el mismo id)
function referenciasDeLaFactura({ cliente_id, empresa_id, tipo_servicio_id, items }) {
  const vistas = new Set()
  const lista = []
  const agregar = (columna, id) => {
    if (id === undefined || id === null || id === '') return
    const clave = `${columna}:${id}`
    if (vistas.has(clave)) return
    vistas.add(clave)
    lista.push({ columna, id })
  }
  agregar('cliente_id', cliente_id)
  agregar('empresa_id', empresa_id)
  agregar('tipo_servicio_id', tipo_servicio_id)
  for (const i of items) {
    agregar('articulo_id', i.articulo_id)
    agregar('unidad_medida_id', i.unidad_medida_id)
  }
  return lista
}

// GET /api/facturas?estado=&cliente_id=&desde=&hasta=&buscar=
router.get('/', async (req, res) => {
  const { estado, cliente_id, desde, hasta, buscar } = req.query
  try {
    let sql = `
      SELECT f.*, c.nombre AS cliente_nombre, c.rnc AS cliente_rnc, ee.estado AS ecf_estado, ee.id AS ecf_id
      FROM facturas f
      JOIN clientes c ON c.id = f.cliente_id
      LEFT JOIN ecf_emitidos ee ON ee.factura_id = f.id AND ee.tenant_id = f.tenant_id AND ee.tipo_ecf IN (31, 32)
      WHERE f.tenant_id = ?`
    const params = [req.tenant_id]

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
       WHERE f.id = ? AND f.tenant_id = ?`,
      [req.params.id, req.tenant_id]
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
       WHERE fi.factura_id = ? AND fi.tenant_id = ?
       ORDER BY fi.orden, fi.id`,
      [req.params.id, req.tenant_id]
    )
    rows[0].items = items

    // e-CF de la factura (31 o 32 y, si existe, su nota de crédito 34). Sin el XML: pesa y tiene su propia ruta.
    const [ecf] = await pool.query(
      `SELECT id, tipo_ecf, encf, estado, codigo_seguridad, mensaje_dgii, track_id, ecf_referencia_id
       FROM ecf_emitidos WHERE factura_id = ? AND tenant_id = ? ORDER BY tipo_ecf`,
      [req.params.id, req.tenant_id]
    )
    rows[0].ecf = ecf.find((e) => e.tipo_ecf !== 34) || null
    rows[0].ecf_nota_credito = ecf.find((e) => e.tipo_ecf === 34) || null

    res.json({ ok: true, data: rows[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// POST /api/facturas — emite una factura: asigna NCF, calcula impuestos y guarda
router.post('/', soloFacturador, async (req, res) => {
  const { cliente_id, empresa_id, tipo_servicio_id, tipo_ncf, fecha, vencimiento, servicio, items } = req.body

  if (!cliente_id || !empresa_id) {
    return res.status(400).json({ ok: false, mensaje: 'cliente_id y empresa_id son requeridos' })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, mensaje: 'La factura debe tener al menos un artículo' })
  }
  const motivo = motivoItemInvalido(items)
  if (motivo) return res.status(400).json({ ok: false, mensaje: motivo })

  const conn = await pool.getConnection()
  try {
    // Todo lo que la factura referencia debe ser de esta empresa (una clave foránea sola no lo garantiza)
    const ajena = await primeraReferenciaAjena(conn, req.tenant_id, referenciasDeLaFactura(req.body))
    if (ajena) return res.status(400).json({ ok: false, mensaje: ajena })

    await conn.beginTransaction()

    // Orden de bloqueo fijo (secuencia NCF y luego configuración) para toda emisión: así dos
    // emisiones simultáneas de la misma empresa se turnan en vez de leer el mismo correlativo o interbloquearse.

    // 1. Secuencia NCF del tipo pedido (bloqueada para la transacción).
    // Sin tipo_ncf se toma la primera vigente, que es como se comportaba antes.
    const [seqRows] = await conn.query(
      `SELECT * FROM nfc_secuencias
       WHERE tenant_id = ? AND activo = 1 ${tipo_ncf ? 'AND tipo_ncf = ?' : ''}
       ORDER BY tipo_ncf
       LIMIT 1 FOR UPDATE`,
      tipo_ncf ? [req.tenant_id, tipo_ncf] : [req.tenant_id]
    )
    const seq = seqRows[0]
    if (!seq) {
      await conn.rollback()
      return res.status(400).json({
        ok: false,
        mensaje: tipo_ncf
          ? `No hay una secuencia NCF activa del tipo ${tipo_ncf}. Registra una en la sección NCF.`
          : 'No hay una secuencia NCF activa. Registra una en la sección NCF.',
      })
    }

    // 2. Configuración fiscal y correlativo de facturas de la empresa, leídos con bloqueo tras la secuencia
    const [cfgRows] = await conn.query('SELECT * FROM configuracion WHERE tenant_id = ? LIMIT 1 FOR UPDATE', [req.tenant_id])
    const config = cfgRows[0]
    if (!config) {
      await conn.rollback()
      return res.status(400).json({ ok: false, mensaje: 'No hay configuración del sistema. Configúrala primero.' })
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

    // Comprobante electrónico (E31 / E32): necesita certificado vigente y cupo en el plan. Se comprueba antes de
    // insertar nada; aun así todo va en esta transacción, así que un fallo posterior también lo deshace.
    const electronico = esTipoElectronico(seq.tipo_ncf)
    let credenciales = null
    if (electronico) {
      credenciales = await credencialesDeLaEmpresa(conn, req.tenant_id)
      await verificarCupoEcf(conn, req.tenant_id)
    }

    // 3. Número de factura correlativo (por empresa)
    const siguienteFactura = (config.factura_ultimo_numero || 0) + 1
    const numero = `${config.factura_prefijo || 'F'}${String(siguienteFactura).padStart(6, '0')}`

    // 4. Cálculo de impuestos (misma lógica que la vista de factura)
    const subtotal  = round2(items.reduce((s, i) => s + subtotalItem(i), 0))
    const itbis     = round2(subtotal * (Number(config.itbis_porcentaje) / 100))
    // El formato del e-CF 32 (consumo) no admite retenciones
    const conRetencion = seq.tipo_ncf !== 'E32'
    const ret_itbis = conRetencion ? round2(itbis * (Number(config.ret_itbis_porcentaje) / 100)) : 0
    const ret_isr   = conRetencion ? round2(subtotal * (Number(config.ret_isr_porcentaje) / 100)) : 0
    const total     = round2(subtotal + itbis - ret_itbis - ret_isr)

    // 5. Insertar la factura
    const [facResult] = await conn.query(
      `INSERT INTO facturas
        (tenant_id, numero, nfc_secuencia_id, nfc_numero, tipo_servicio_id, fecha, vencimiento,
         cliente_id, empresa_id, servicio, subtotal, itbis, ret_itbis, ret_isr, total, estado, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?)`,
      [req.tenant_id, numero, seq.id, nfc_numero, tipo_servicio_id || null, fecha, vencimiento || null,
       cliente_id, empresa_id, servicio || null, subtotal, itbis, ret_itbis, ret_isr, total,
       req.usuario?.id || null]
    )
    const facturaId = facResult.insertId

    // 6. Insertar los ítems
    let orden = 1
    for (const i of items) {
      await conn.query(
        `INSERT INTO factura_items
          (tenant_id, factura_id, articulo_id, descripcion_custom, cantidad, ancho, alto,
           unidad_medida_id, precio_unitario, tipo_precio, subtotal, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.tenant_id, facturaId, i.articulo_id, i.descripcion_custom || null, i.cantidad,
         i.ancho || null, i.alto || null, i.unidad_medida_id, i.precio_unitario,
         i.tipo_precio || 'unitario', subtotalItem(i), orden++]
      )
    }

    // 7. Avanzar contadores (NCF y número de factura)
    await conn.query('UPDATE nfc_secuencias SET ultimo_usado = ? WHERE id = ? AND tenant_id = ?', [siguienteNcf, seq.id, req.tenant_id])
    await conn.query('UPDATE configuracion SET factura_ultimo_numero = ? WHERE id = ? AND tenant_id = ?', [siguienteFactura, config.id, req.tenant_id])

    // 7b. e-CF: XML firmado guardado junto con la factura
    const ecf = electronico
      ? await emitirEcf(conn, {
          tenantId: req.tenant_id, facturaId, tipo: Number(seq.tipo_ncf.slice(1)), encf: nfc_numero,
          secuenciaId: seq.id, tasaItbis: Number(config.itbis_porcentaje), credenciales,
        })
      : undefined

    await conn.commit()

    // Con la misma conexión: pedir otra al pool mientras esta sigue tomada agota el pool
    // cuando hay tantas emisiones simultáneas como conexiones.
    const [rows] = await conn.query('SELECT * FROM facturas WHERE id = ? AND tenant_id = ?', [facturaId, req.tenant_id])

    // 8. Alerta si la secuencia NCF se está agotando
    const disponibles = seq.hasta - siguienteNcf
    const alerta_ncf = siguienteNcf >= seq.alerta_desde
    res.status(201).json({
      ok: true,
      data: rows[0],
      ecf,
      alerta_ncf,
      alerta_ncf_mensaje: alerta_ncf
        ? `⚠️ Te quedan ${disponibles} comprobantes fiscales. Solicita una nueva secuencia NCF a la DGII.`
        : null,
    })
  } catch (err) {
    await conn.rollback()
    if (err instanceof ErrorDeEcf) {
      return res.status(err.estado).json({ ok: false, mensaje: err.message, ...(err.limiteAlcanzado && { limite_alcanzado: true }) })
    }
    if (esReferenciaInexistente(err)) {
      return res.status(400).json({ ok: false, mensaje: mensajeReferencia(err) })
    }
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conn.release()
  }
})

// PUT /api/facturas/:id/anular — anula una factura (solo admin)
router.put('/:id/anular', soloAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT estado FROM facturas WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenant_id])
    if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Factura no encontrada' })
    if (rows[0].estado === 'anulada') {
      return res.status(400).json({ ok: false, mensaje: 'La factura ya está anulada' })
    }

    await pool.query("UPDATE facturas SET estado = 'anulada', updated_at = NOW() WHERE id = ? AND tenant_id = ?", [req.params.id, req.tenant_id])
    res.json({ ok: true, mensaje: 'Factura anulada' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
