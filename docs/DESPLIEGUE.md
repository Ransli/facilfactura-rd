# Despliegue en el servidor (entorno de prueba para Unidad V)

Guía paso a paso para poner FácilFactura RD a correr en tu servidor (el mismo donde está FinanceCore), con el
mismo patrón que ya usas ahí: Node + PM2 para el backend, nginx sirviendo el frontend compilado y reenviando
`/api`, y MySQL propio. Esto es exactamente lo que pide la tarea: un **entorno real o de prueba, totalmente
funcional** — no hace falta que sea accesible desde cualquier parte de internet para "el público general"; con
que corra de verdad (no `npm run dev`) y puedas mostrar evidencia, cumple.

> Antes de empezar: lee esto completo una vez. Cada paso asume que el anterior ya quedó bien.

## 0. Qué necesita el servidor

Si ya corre FinanceCore ahí, probablemente ya tienes todo esto. Confirmarlo:

```bash
node -v        # 18 o superior (el proyecto se probó con 22)
mysql --version
nginx -v
pm2 -v
git --version
```

Si falta `pm2`: `npm install -g pm2`.

## 1. Llevar el código al servidor

La primera vez:

```bash
cd /var/www
git clone https://github.com/Ransli/facilfactura-rd.git
cd facilfactura-rd
```

(Si ya lo clonaste antes, simplemente `cd /var/www/facilfactura-rd && git pull origin master`.)

## 2. Crear la base de datos

```bash
mysql -u root -p
```

Dentro de MySQL (cambia la contraseña por una tuya):

```sql
CREATE DATABASE facilfactura_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'facilfactura'@'localhost' IDENTIFIED BY 'una-contraseña-fuerte-y-propia-del-servidor';
GRANT ALL PRIVILEGES ON facilfactura_saas.* TO 'facilfactura'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

**No** copies la base de datos de tu máquina de desarrollo: este entorno arranca limpio y las migraciones crean
todo lo necesario (incluidos los planes y los roles de referencia).

## 3. Configurar el backend

```bash
cd backend
cp .env.production.example .env
nano .env     # o el editor que prefieras
```

Completa, como mínimo:
- `DB_PASSWORD` — la contraseña que pusiste en el paso 2
- `JWT_SECRET` — genera una propia: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `CLAVE_CIFRADO_CERTIFICADOS` — genera una propia: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `CORS_ORIGIN` — déjalo con el subdominio que vayas a usar (paso 7); si todavía no lo sabes, no importa, nginx
  sirviendo todo desde el mismo dominio hace que esto casi nunca se use

```bash
npm install
npm run db:migrate
```

Confirma que las migraciones corrieron bien:

```bash
npm run db:status
```

## 4. Crear tu usuario de la consola master

```bash
npm run master:crear "Tu Nombre" tu-email@dominio.com "una-contraseña-de-al-menos-8-caracteres"
```

Guarda ese email y contraseña: es con lo que entrarás a `/master` para gestionar las empresas.

## 5. Compilar el frontend

```bash
cd ../frontend
cp .env.production.example .env.production
nano .env.production
```

Pon `VITE_API_URL=https://TU-SUBDOMINIO.TU-SERVIDOR.COM/api` (el subdominio que vayas a usar en el paso 7 — si
nginx sirve frontend y API desde el mismo dominio, como recomienda esta guía, es literalmente esa URL con `/api`
al final).

```bash
npm install
npm run build
```

Esto deja los archivos listos en `frontend/dist/`. Repite este paso cada vez que cambie el código del frontend.

## 6. Arrancar el backend con PM2

Desde la raíz del repo (`/var/www/facilfactura-rd`):

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save                 # para que sobreviva a un reinicio del servidor
```

Verifica que está corriendo:

```bash
pm2 status
curl http://localhost:3002/api/health
```

Debe responder `{"status":"ok",...}`.

## 7. Configurar nginx

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/facilfactura
sudo nano /etc/nginx/sites-available/facilfactura   # reemplaza TU-SUBDOMINIO.TU-SERVIDOR.COM por el real
sudo ln -s /etc/nginx/sites-available/facilfactura /etc/nginx/sites-enabled/
sudo nginx -t             # valida la sintaxis antes de recargar
sudo systemctl reload nginx
```

Si quieres HTTPS (igual que FinanceCore, opcional para un entorno de prueba, recomendable si el subdominio va a
quedar levantado):

```bash
sudo certbot --nginx -d TU-SUBDOMINIO.TU-SERVIDOR.COM
```

## 8. Verificar que todo funciona de punta a punta

1. Abre `https://TU-SUBDOMINIO.TU-SERVIDOR.COM` (o `http://` si no pusiste HTTPS) → debe cargar la página de
   bienvenida.
2. Crea una empresa de prueba desde "Crear cuenta gratis" (puedes usar datos genéricos, como hicimos con las
   capturas de la landing).
3. Entra, configura los datos fiscales, registra una secuencia NCF, crea un cliente y un artículo, y **emite una
   factura real** — esa es la operación de usuario que pide la tarea.
4. Entra a `https://TU-SUBDOMINIO.TU-SERVIDOR.COM/master` con el usuario del paso 4 y confirma que ves la
   empresa que acabas de crear en la lista.

## 9. Evidencia para la Unidad V

Con el sistema ya corriendo, captura (pantalla o video corto, lo que pida el documento):

| Evidencia pedida | Qué mostrar |
|---|---|
| Sistema instalado y funcionando | La página de bienvenida cargando desde el dominio del servidor (no `localhost`); `pm2 status` con el proceso `online` |
| Base de datos configurada | `npm run db:status` con las migraciones aplicadas, o una consulta `SHOW TABLES;` en `facilfactura_saas` |
| Principales módulos operativos | Panel, Factura, Productos, Clientes, NCF, e-CF y Configuración abiertos uno por uno |
| Usuario realizando operaciones | Crear un cliente, emitir una factura y verla en el Historial, todo en el navegador apuntando al dominio del servidor |

Súbelas donde corresponda y referéncialas en `Unidad V.docx` (dejé marcado dónde va cada una).

## 10. Despliegues siguientes

Una vez configurado todo lo anterior, cualquier cambio futuro se sube así:

```bash
bash deploy.sh
```

Hace `git pull`, instala dependencias, migra lo pendiente, recompila el frontend y reinicia el backend — en ese
orden. Revísalo antes de correrlo la primera vez (`cat deploy.sh`): tiene la ruta `/var/www/facilfactura-rd`
quemada; ajústala si clonaste el repo en otro lugar.

## Notas

- **No** se requiere que el subdominio sea público ni esté anunciado en ningún lado: basta con que resuelva y
  responda cuando tú (o el facilitador, si le compartes el enlace) lo visiten. "Entorno de prueba" es justamente
  eso: no es la versión final para clientes reales.
- `ECF_TRABAJADOR=0` en el `.env` de este entorno es intencional: sin la certificación real ante la DGII
  (trámite externo, ver `docs/escalacion/SPEC-ecf-connector.md`), no hay por qué dejar la cola intentando enviar
  comprobantes a la DGII de verdad desde un entorno de pruebas.
- Si algo falla, los logs del backend quedan en `logs/backend-error.log` (ruta relativa a la raíz del repo) y
  también con `pm2 logs facilfactura-backend`.
