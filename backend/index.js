import app from './app.js'
import { testConnection } from './config/database.js'

const PORT = process.env.PORT || 3002

// ── Arranque ──────────────────────────────────────────────────
async function main() {
  await testConnection()
  app.listen(PORT, () => {
    console.log(`✔  Servidor corriendo en http://localhost:${PORT}`)
    console.log(`   API disponible en http://localhost:${PORT}/api`)
  })
}

main()
