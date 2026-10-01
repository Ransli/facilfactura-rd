// Configuración de PM2 para el servidor. Uso:
//   pm2 start ecosystem.config.cjs
//   pm2 restart facilfactura-backend --update-env   (tras cambiar backend/.env)
//
// Solo el backend corre como proceso: el frontend se compila a archivos estáticos (frontend/dist) y los sirve
// nginx directamente, sin Node de por medio. Ver docs/DESPLIEGUE.md.
module.exports = {
  apps: [
    {
      name: 'facilfactura-backend',
      script: 'index.js',
      cwd: './backend',
      // "cwd" es también desde donde el backend carga su .env (dotenv.config() lee ./.env relativo al proceso).
      env: { NODE_ENV: 'production' },
      instances: 1,          // un servidor MySQL y una cola de e-CF: más instancias duplicarían los envíos
      autorestart: true,
      max_memory_restart: '300M',
      out_file: './logs/backend-out.log',
      error_file: './logs/backend-error.log',
      time: true,
    },
  ],
}
