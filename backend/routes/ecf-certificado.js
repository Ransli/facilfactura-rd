import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken, soloAdmin } from '../middleware/auth.js'
import { agregarTenantId } from '../middleware/tenant.js'
import { verificarSuscripcion } from '../middleware/suscripcion.js'
import { guardarCertificado, obtenerMetadatos, eliminarCertificado, ErrorDeCertificado } from '../services/ecf/certificados.js'

const router = Router()

router.use(verificarToken, agregarTenantId, verificarSuscripcion)

function responderError(res, err) {
  if (err instanceof ErrorDeCertificado) return res.status(err.estado).json({ ok: false, mensaje: err.message })
  if (/CLAVE_CIFRADO_CERTIFICADOS/.test(err.message)) {
    console.error('[ecf] Falta configurar la clave de cifrado de certificados')
    return res.status(503).json({ ok: false, mensaje: 'El servidor no tiene configurada la clave de cifrado de certificados. Avisa al administrador del sistema.' })
  }
  console.error(err)
  res.status(500).json({ ok: false, mensaje: 'Error del servidor' })
}

// GET /api/ecf/certificado — metadatos del certificado de la empresa (nunca el archivo ni la contraseña)
router.get('/', async (req, res) => {
  try {
    res.json({ ok: true, data: await obtenerMetadatos(pool, req.tenant_id) })
  } catch (err) {
    responderError(res, err)
  }
})

// PUT /api/ecf/certificado — sube o reemplaza el certificado (.p12 en base64 + contraseña)
router.put('/', soloAdmin, async (req, res) => {
  const { p12_base64, password } = req.body
  if (typeof p12_base64 !== 'string' || !p12_base64.trim()) {
    return res.status(400).json({ ok: false, mensaje: 'Falta el archivo del certificado (.p12)' })
  }
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ ok: false, mensaje: 'Falta la contraseña del certificado' })
  }
  try {
    const data = await guardarCertificado(pool, req.tenant_id, { p12Base64: p12_base64, password, usuarioId: req.usuario.id })
    res.json({ ok: true, mensaje: 'Certificado guardado', data })
  } catch (err) {
    responderError(res, err)
  }
})

// DELETE /api/ecf/certificado
router.delete('/', soloAdmin, async (req, res) => {
  try {
    if (!(await eliminarCertificado(pool, req.tenant_id))) {
      return res.status(404).json({ ok: false, mensaje: 'La empresa no tiene un certificado guardado' })
    }
    res.json({ ok: true, mensaje: 'Certificado eliminado' })
  } catch (err) {
    responderError(res, err)
  }
})

export default router
