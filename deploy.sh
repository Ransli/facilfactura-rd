#!/bin/bash
# Deploy script para el VPS (mismo estilo que el de sistema-financiero-react).
# Uso:  bash deploy.sh
#
# Supone que el repo ya está clonado en el servidor, que backend/.env y frontend/.env.production ya existen
# (NO los pisa ni los toca) y que las migraciones de la base ya se corrieron al menos una vez (ver DESPLIEGUE.md).
set -e

cd /var/www/facilfactura-rd   # ajusta esta ruta si el repo vive en otro lugar del servidor

echo "▶ Descargando cambios de origin/master..."
git fetch origin master

CAMBIOS=$(git diff --name-status HEAD origin/master)
if [ -z "$CAMBIOS" ]; then
  echo "  (sin cambios nuevos)"
else
  echo "$CAMBIOS"
fi

git reset --hard origin/master

echo ""
echo "▶ Instalando dependencias..."
npm run install:all

echo "▶ Aplicando migraciones pendientes..."
npm run db:migrate --prefix backend

echo "▶ Construyendo el frontend..."
npm run build --prefix frontend

echo "▶ Reiniciando el backend..."
pm2 restart facilfactura-backend --update-env

echo ""
echo "✔ Deploy completado."
