import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'

const router = Router()

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads')

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `logo-${req.tenant_id}-${Date.now()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 5) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/image\/(png|jpe?g|svg\+xml|webp)/.test(file.mimetype)) cb(null, true)
    else cb(new Error('Solo se permiten imágenes (PNG, JPG, SVG, WEBP)'))
  },
})

router.use(verificarToken, agregarTenantId)

// GET /api/configuracion — configuración fiscal + datos de empresa + métodos de pago
router.get('/', async (req, res) => {
  try {
    const [cfgRows] = await pool.query('SELECT * FROM configuracion WHERE tenant_id = ? LIMIT 1', [req.tenant_id])
    const config = cfgRows[0] || {}

    let empresa = {}
    if (config.empresa_id) {
      const [empRows] = await pool.query('SELECT * FROM empresas WHERE id = ? AND tenant_id = ?', [config.empresa_id, req.tenant_id])
      empresa = empRows[0] || {}
    }

    const [metodos] = await pool.query(
      `SELECT * FROM metodos_pago WHERE tenant_id = ? AND activo = 1 ${config.empresa_id ? 'AND empresa_id = ?' : ''} ORDER BY orden, id`,
      config.empresa_id ? [req.tenant_id, config.empresa_id] : [req.tenant_id]
    )

    res.json({
      ok: true,
      data: {
        ...config,
        empresa_nombre: empresa.nombre || null,
        empresa_rnc:    empresa.rnc || null,
        telefono:       empresa.telefono || null,
        celular:        empresa.celular || null,
        email:          empresa.email || null,
        direccion:      empresa.direccion || null,
        ciudad:         empresa.ciudad || null,
        sitio_web:      empresa.sitio_web || null,
        logo_path:      empresa.logo_path || null,
        metodos_pago:   metodos,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

// PUT /api/configuracion — actualiza empresa (upsert) y parámetros fiscales
router.put('/', soloAdmin, async (req, res) => {
  const {
    empresa_nombre, empresa_rnc, telefono, celular, email, direccion, ciudad, sitio_web,
    moneda, factura_prefijo, itbis_porcentaje, ret_itbis_porcentaje, ret_isr_porcentaje, nfc_alerta_porcentaje,
  } = req.body

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()

    const [cfgRows] = await conn.query('SELECT * FROM configuracion WHERE tenant_id = ? LIMIT 1 FOR UPDATE', [req.tenant_id])
    let config = cfgRows[0]
    if (!config) {
      const [ins] = await conn.query('INSERT INTO configuracion (tenant_id) VALUES (?)', [req.tenant_id])
      const [nueva] = await conn.query('SELECT * FROM configuracion WHERE id = ? AND tenant_id = ?', [ins.insertId, req.tenant_id])
      config = nueva[0]
    }

    // Upsert de la empresa emisora
    let empresaId = config.empresa_id
    if (empresa_nombre || empresa_rnc) {
      if (empresaId) {
        await conn.query(
          `UPDATE empresas SET nombre=?, rnc=?, telefono=?, celular=?, email=?, direccion=?, ciudad=?, sitio_web=?, updated_at=NOW()
           WHERE id=? AND tenant_id=?`,
          [empresa_nombre, empresa_rnc, telefono || null, celular || null, email || null,
           direccion || null, ciudad || null, sitio_web || null, empresaId, req.tenant_id]
        )
      } else {
        const [ins] = await conn.query(
          `INSERT INTO empresas (tenant_id, nombre, rnc, telefono, celular, email, direccion, ciudad, sitio_web)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.tenant_id, empresa_nombre, empresa_rnc || '', telefono || null, celular || null, email || null,
           direccion || null, ciudad || null, sitio_web || null]
        )
        empresaId = ins.insertId
      }
    }

    await conn.query(
      `UPDATE configuracion SET empresa_id=?, moneda=?, factura_prefijo=?, itbis_porcentaje=?,
       ret_itbis_porcentaje=?, ret_isr_porcentaje=?, nfc_alerta_porcentaje=? WHERE id=? AND tenant_id=?`,
      [empresaId || null,
       moneda || config.moneda, factura_prefijo || config.factura_prefijo,
       itbis_porcentaje     ?? config.itbis_porcentaje,
       ret_itbis_porcentaje ?? config.ret_itbis_porcentaje,
       ret_isr_porcentaje   ?? config.ret_isr_porcentaje,
       nfc_alerta_porcentaje ?? config.nfc_alerta_porcentaje,
       config.id, req.tenant_id]
    )

    await conn.commit()
    res.json({ ok: true, mensaje: 'Configuración actualizada' })
  } catch (err) {
    await conn.rollback()
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  } finally {
    conn.release()
  }
})

// Sin esto, un archivo rechazado por multer (muy pesado o no imagen) sale
// como HTML de error y el frontend no puede leer el motivo.
function recibirLogo(req, res, next) {
  upload.single('logo')(req, res, (err) => {
    if (!err) return next()
    const mensaje = err.code === 'LIMIT_FILE_SIZE'
      ? `La imagen supera el máximo de ${Number(process.env.MAX_FILE_SIZE_MB) || 5} MB`
      : err.message
    res.status(400).json({ ok: false, mensaje })
  })
}

// POST /api/configuracion/logo — sube el logo de la empresa
router.post('/logo', soloAdmin, recibirLogo, async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, mensaje: 'No se recibió ningún archivo' })

  const logoPath = `/uploads/${req.file.filename}`
  try {
    const [cfgRows] = await pool.query('SELECT empresa_id FROM configuracion WHERE tenant_id = ? LIMIT 1', [req.tenant_id])
    const empresaId = cfgRows[0]?.empresa_id
    if (!empresaId) {
      return res.status(400).json({ ok: false, mensaje: 'Configura primero los datos de la empresa' })
    }
    await pool.query('UPDATE empresas SET logo_path = ? WHERE id = ? AND tenant_id = ?', [logoPath, empresaId, req.tenant_id])
    res.json({ ok: true, data: { logo_path: logoPath } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
  }
})

export default router
