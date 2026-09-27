import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// ── Rutas ─────────────────────────────────────────────────────
import authRoutes from './routes/auth.js'
import clientesRoutes from './routes/clientes.js'
import categoriasRoutes from './routes/categorias.js'
import unidadesMedidaRoutes from './routes/unidades-medida.js'
import articulosRoutes from './routes/articulos.js'
import ncfRoutes from './routes/nfc.js'
import tiposServicioRoutes from './routes/tipos-servicio.js'
import metodosPagoRoutes from './routes/metodos-pago.js'
import configuracionRoutes from './routes/configuracion.js'
import facturasRoutes from './routes/facturas.js'
import usuariosRoutes from './routes/usuarios.js'
import dashboardRoutes from './routes/dashboard.js'
import suscripcionRoutes from './routes/suscripcion.js'
import registroRoutes from './routes/registro.js'
import ecfCertificadoRoutes from './routes/ecf-certificado.js'
import ecfRoutes from './routes/ecf.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname  = path.dirname(__filename)

const app  = express()

// ── Middlewares globales ──────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:5175'],
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Archivos estáticos: uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// ── Rutas API ─────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/clientes', clientesRoutes)
app.use('/api/categorias', categoriasRoutes)
app.use('/api/unidades-medida', unidadesMedidaRoutes)
app.use('/api/articulos', articulosRoutes)
app.use('/api/nfc', ncfRoutes)
app.use('/api/tipos-servicio', tiposServicioRoutes)
app.use('/api/metodos-pago', metodosPagoRoutes)
app.use('/api/configuracion', configuracionRoutes)
app.use('/api/facturas', facturasRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/suscripcion', suscripcionRoutes)
app.use('/api/registro', registroRoutes)
app.use('/api/ecf/certificado', ecfCertificadoRoutes)
app.use('/api/ecf', ecfRoutes)

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  })
})

// ── Manejo de errores global ──────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack)
  res.status(err.status || 500).json({
    ok: false,
    mensaje: err.message || 'Error interno del servidor',
  })
})

export default app
