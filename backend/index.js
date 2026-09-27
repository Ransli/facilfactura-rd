import app from './app.js'
import pool, { testConnection } from './config/database.js'
import { iniciarTrabajador } from './services/ecf/cola.js'

const PORT = process.env.PORT || 3002

// ── Arranque ──────────────────────────────────────────────────
async function main() {
  await testConnection()
  app.listen(PORT, () => {
    console.log(`✔  Servidor corriendo en http://localhost:${PORT}`)
    console.log(`   API disponible en http://localhost:${PORT}/api`)
  })

  // Envío de e-CF a la DGII: sin esta variable la cola no corre sola (se puede procesar desde la pantalla de e-CF)
  if (process.env.ECF_TRABAJADOR === '1') {
    iniciarTrabajador(pool, { intervaloMs: (Number(process.env.ECF_TRABAJADOR_SEGUNDOS) || 30) * 1000 })
    console.log('   Cola de e-CF activa (DGII_URL_BASE =', process.env.DGII_URL_BASE || 'https://ecf.dgii.gov.do', ')')
  }
}

main()
