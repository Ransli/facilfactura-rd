import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'
import { procesarCola, programarReintento } from '../services/ecf/cola.js'
import { representacionImpresa } from '../services/ecf/representacion.js'
import { ErrorDeEcf } from '../services/ecf/formato.js'
import { emitirNotaDeCredito } from '../services/ecf/emision.js'

const router = Router()
router.use(verificarToken, agregarTenantId, verificarSuscripcion)

const AMBIENTES = ['TesteCF', 'CerteCF', 'eCF']
// Columnas que se muestran: el XML firmado pesa y tiene su propia ruta
const COLUMNAS = `e.id, e.factura_id, e.tipo_ecf, e.encf, e.ecf_referencia_id, e.estado, e.codigo_seguridad, e.mensaje_dgii, e.track_id,
                  e.rnc_comprador, DATE_FORMAT(e.fecha_emision, '%Y-%m-%d') AS fecha_emision, e.monto_total, e.intentos,
                  e.proximo_intento, e.ultimo_intento, e.created_at`

const idDe = (req) => (/^\d+$/.test(req.params.id) ? Number(req.params.id) : null)

function responderError(res, err) {
  if (err instanceof ErrorDeEcf) {
    return res.status(err.estado).json({ ok: false, mensaje: err.message, ...(err.limiteAlcanzado && { limite_alcanzado: true }) })
  }
  console.error(err)
  res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
}

async function detalle(db, tenantId, id) {
  const [[fila]] = await db.query(
    `SELECT ${COLUMNAS}, f.numero AS factura_numero, c.nombre AS cliente_nombre
     FROM ecf_emitidos e
     JOIN facturas f ON f.id = e.factura_id AND f.tenant_id = e.tenant_id
     JOIN clientes c ON c.id = f.cliente_id AND c.tenant_id = f.tenant_id
     WHERE e.id = ? AND e.tenant_id = ?`, [id, tenantId])
  return fila || null
}

// GET /api/ecf?estado=&tipo= — comprobantes electrónicos de la empresa
router.get('/', async (req, res) => {
  const { estado, tipo } = req.query
  try {
    let sql = `SELECT ${COLUMNAS}, f.numero AS factura_numero, c.nombre AS cliente_nombre
               FROM ecf_emitidos e
               JOIN facturas f ON f.id = e.factura_id AND f.tenant_id = e.tenant_id
               JOIN clientes c ON c.id = f.cliente_id AND c.tenant_id = f.tenant_id
               WHERE e.tenant_id = ?`
    const params = [req.tenant_id]
    if (estado) { sql += ' AND e.estado = ?'; params.push(estado) }
    if (tipo)   { sql += ' AND e.tipo_ecf = ?'; params.push(Number(tipo)) }
    sql += ' ORDER BY e.id DESC LIMIT 500'
    const [rows] = await pool.query(sql, params)
    res.json({ ok: true, data: rows })
  } catch (err) {
    responderError(res, err)
  }
})

// GET /api/ecf/configuracion — ambiente de la DGII de la empresa
router.get('/configuracion', async (req, res) => {
  try {
    const [[cfg]] = await pool.query('SELECT ambiente FROM ecf_configuracion WHERE tenant_id = ?', [req.tenant_id])
    res.json({ ok: true, data: { ambiente: cfg?.ambiente || 'TesteCF' } })
  } catch (err) {
    responderError(res, err)
  }
})

// PUT /api/ecf/configuracion — cambia el ambiente (TesteCF pruebas, CerteCF certificación, eCF producción)
router.put('/configuracion', soloAdmin, async (req, res) => {
  const { ambiente } = req.body
  if (!AMBIENTES.includes(ambiente)) {
    return res.status(400).json({ ok: false, mensaje: `El ambiente debe ser uno de: ${AMBIENTES.join(', ')}` })
  }
  try {
    await pool.query(
      'INSERT INTO ecf_configuracion (tenant_id, ambiente) VALUES (?, ?) ON DUPLICATE KEY UPDATE ambiente = VALUES(ambiente)',
      [req.tenant_id, ambiente])
    res.json({ ok: true, mensaje: 'Ambiente actualizado', data: { ambiente } })
  } catch (err) {
    responderError(res, err)
  }
})

// POST /api/ecf/procesar — envía ahora los pendientes de la empresa (además de la cola automática)
router.post('/procesar', soloAdmin, async (req, res) => {
  try {
    res.json({ ok: true, data: await procesarCola(pool, { tenantId: req.tenant_id }) })
  } catch (err) {
    responderError(res, err)
  }
})

// GET /api/ecf/:id
router.get('/:id', async (req, res) => {
  try {
    const fila = idDe(req) && await detalle(pool, req.tenant_id, idDe(req))
    if (!fila) return res.status(404).json({ ok: false, mensaje: 'Comprobante electrónico no encontrado' })
    res.json({ ok: true, data: fila })
  } catch (err) {
    responderError(res, err)
  }
})

// GET /api/ecf/:id/xml — el XML firmado tal como se envió a la DGII
router.get('/:id/xml', async (req, res) => {
  try {
    const [[fila]] = idDe(req)
      ? await pool.query('SELECT encf, rnc_emisor, xml_firmado FROM ecf_emitidos WHERE id = ? AND tenant_id = ?', [idDe(req), req.tenant_id])
      : [[]]
    if (!fila) return res.status(404).json({ ok: false, mensaje: 'Comprobante electrónico no encontrado' })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fila.rnc_emisor}${fila.encf}.xml"`)
    res.send(fila.xml_firmado)
  } catch (err) {
    responderError(res, err)
  }
})

// GET /api/ecf/:id/representacion — representación impresa (HTML con QR y código de seguridad)
router.get('/:id/representacion', async (req, res) => {
  try {
    const html = await representacionImpresa(pool, req.tenant_id, idDe(req))
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(html)
  } catch (err) {
    responderError(res, err)
  }
})

// POST /api/ecf/:id/reintentar — vuelve a enviar un e-CF que quedó en error (o adelanta uno pendiente)
router.post('/:id/reintentar', soloAdmin, async (req, res) => {
  try {
    const id = idDe(req)
    const actual = id && await detalle(pool, req.tenant_id, id)
    if (!actual) return res.status(404).json({ ok: false, mensaje: 'Comprobante electrónico no encontrado' })

    if (!(await programarReintento(pool, req.tenant_id, id))) {
      return res.status(409).json({
        ok: false,
        mensaje: actual.estado === 'rechazado'
          ? 'La DGII rechazó este comprobante: no se puede reenviar. Corrige el problema y emite uno nuevo.'
          : 'Este comprobante ya fue aceptado por la DGII: no se vuelve a enviar.',
      })
    }
    await procesarCola(pool, { tenantId: req.tenant_id, limite: 5 })
    res.json({ ok: true, data: await detalle(pool, req.tenant_id, id) })
  } catch (err) {
    responderError(res, err)
  }
})

// POST /api/ecf/:id/nota-credito — anula un e-CF aceptado con una nota de crédito electrónica (34) por el total
router.post('/:id/nota-credito', soloAdmin, async (req, res) => {
  try {
    const nota = await emitirNotaDeCredito(pool, { tenantId: req.tenant_id, ecfId: idDe(req), razon: req.body?.razon })
    res.status(201).json({ ok: true, mensaje: 'Nota de crédito emitida: la factura quedó anulada', data: nota })
  } catch (err) {
    responderError(res, err)
  }
})

export default router