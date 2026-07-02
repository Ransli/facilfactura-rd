# FácilFactura RD

Sistema de facturación electrónica con soporte de Números de Comprobante Fiscal (NCF)
conforme a los lineamientos de la DGII de la República Dominicana.

## Descripción

FácilFactura RD es una aplicación web full-stack orientada a PYMEs dominicanas que
requieren emitir facturas con NCF válidos ante la DGII. El sistema permite gestionar
clientes, artículos, secuencias NCF y emitir facturas con cálculo automático de ITBIS,
retenciones e ISR.

## Funcionalidades

- **Autenticación JWT** con control de acceso por roles (admin, facturador, visor).
- **Gestión de clientes** (personas y empresas) con búsqueda por nombre o RNC.
- **Catálogo de productos y servicios** con múltiples precios por unidad de medida
  y soporte para artículos con dimensiones (ancho × alto, ej. banners y lonas).
- **Secuencias NCF**: registro de rangos autorizados por la DGII con **alerta automática**
  cuando la secuencia se acerca a su límite.
- **Emisión de facturas** con asignación automática del NCF y cálculo de ITBIS,
  retención de ITBIS y retención de ISR.
- **Historial de facturas** con filtros por estado, fecha y número/NCF, vista de detalle
  y anulación.
- **Configuración**: datos de la empresa emisora, logo, parámetros fiscales y métodos de pago.
- **Impresión** de la factura y envío rápido por WhatsApp.

## Tecnologías

**Frontend:** React 18 · Vite · CSS puro
**Backend:** Node.js · Express · JWT · bcryptjs · Multer · MySQL2
**Base de datos:** MySQL / MariaDB

## Estructura del proyecto

```
facilfactura-rd/
├── package.json          # scripts para levantar todo el proyecto
├── backend/              # API REST (Express)
│   ├── config/           # conexión a la base de datos
│   ├── middleware/       # autenticación y roles
│   ├── routes/           # endpoints por módulo
│   └── seed-usuarios.js  # usuarios iniciales
├── frontend/             # SPA (React + Vite)
│   └── src/
│       ├── vistas/       # Factura, Productos, Clientes, NCF, Historial, Configuración
│       ├── components/   # menú lateral, toasts
│       └── context/      # contexto de autenticación
└── database/
    └── schema.sql        # 14 tablas con relaciones FK
```

## Instalación y ejecución

### Requisitos previos
- Node.js v18+
- MySQL o MariaDB (XAMPP sirve para desarrollo local)
- Git

### 1. Clonar el repositorio
```bash
git clone https://github.com/Ransli/facilfactura-rd.git
cd facilfactura-rd
```

### 2. Crear la base de datos
```bash
mysql -u root -p < database/schema.sql
```

### 3. Configurar el backend
```bash
cd backend
cp .env.example .env      # edita las credenciales de MySQL y el JWT_SECRET
cd ..
```

### 4. Instalar dependencias (raíz, backend y frontend)
```bash
npm run install:all
```

### 5. Crear los usuarios iniciales
```bash
npm run seed
```
Esto crea tres usuarios de prueba:

| Rol         | Email                          | Contraseña     |
|-------------|--------------------------------|----------------|
| admin       | admin@facilfactura.com         | Admin2025!     |
| facturador  | facturador@facilfactura.com    | Factura2025!   |
| visor       | visor@facilfactura.com         | Visor2025!     |

### 6. Levantar el proyecto (backend + frontend juntos)
```bash
npm run dev
```
- Frontend: http://localhost:5173
- API:      http://localhost:3002/api

> También puedes ejecutarlos por separado con `npm run dev:backend` y `npm run dev:frontend`.

## Capturas de pantalla

_Pendiente de agregar._

## Autor

**Ransli García Amante**
Matrícula: 100044493
Universidad Abierta para Adultos (UAPA)
Seminario de Proyecto I — ISW410

## Licencia

Distribuido bajo licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.
