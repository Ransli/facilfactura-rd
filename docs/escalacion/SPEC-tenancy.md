# Spec: `tenancy` (aislamiento por empresa)

> Módulo 2 del [mapa de capacidades](CAPABILITY-MAP.md). Fase 2 de la propuesta de la Unidad II.
> Depende de `platform-db` (terminado). Referencia arquitectónica: middleware `tenant.js` de FinanceCore.
> Estado: aprobado por Ransli el 2026-09-27 (plan de trabajo local, se sube al día siguiente).

## Objective

Que **una sola instalación dé servicio a muchas empresas (tenants) y que cada una vea únicamente sus datos**.
Éxito = una empresa nunca puede leer, modificar, referenciar ni numerar con datos de otra, ni siquiera
manipulando ids, cuerpos o parámetros de las peticiones.

Usuarios: cada empresa cliente (administrador, facturador, visor) y, más adelante, la consola master.

## Assumptions (decisiones tomadas)

- **Modelo:** esquema compartido con columna discriminadora `tenant_id`, aislamiento forzado en la capa de acceso
  (la propuesta, sección V.1). MariaDB no tiene seguridad a nivel de fila: la garantía es de la aplicación y se prueba.
- **Login por correo, correo único en toda la plataforma** (`usuarios.email` sigue siendo único global). Así el inicio
  de sesión no pide elegir empresa. Una persona con dos empresas usa dos correos.
- El **tenant 1** es la empresa migrada de la v1 (datos de `facilfactura_saas` copiados de `facilfactura_db`).
- `roles` es un catálogo global. `unidades_medida` y `tipos_servicio` pasan a ser **por empresa** (como pide la
  propuesta); cada empresa nueva recibe los valores por defecto (lo hace `onboarding`).
- El rol **master** no pertenece a ningún tenant y vive en otro sistema de autenticación (módulo `master-console`).
- Esta spec introduce las tablas de plataforma mínimas (`planes`, `tenants`); el resto de la suscripción llega
  en `subscription`.

## Tech Stack

Sin cambios (Node 22, Express 4, mysql2, Knex, JWT). Sin dependencias nuevas.

## Commands

```
Migrar:                 npm run db:migrate --prefix backend
Regenerar el esquema:   npm run db:dump-schema --prefix backend
Pruebas:                npm test --prefix backend
```

## Project Structure

```
database/migrations/…_create_platform_core.js    → tablas planes y tenants (+ tenant 1 y planes iniciales)
database/migrations/…_add_tenant_id.js           → tenant_id en las tablas de negocio, respaldo de datos, índices únicos por empresa
backend/middleware/tenant.js                     → agregarTenantId (fija req.tenant_id y rechaza el tenant ajeno)
backend/routes/*.js                              → cada consulta filtra por req.tenant_id
backend/tests/aislamiento/*.test.js              → pruebas de aislamiento entre dos empresas
backend/tests/helpers/                           → helpers para crear empresas de prueba
```

## Contract (lo que usan los demás módulos)

1. El JWT de un usuario de empresa lleva `{ id, tenant_id, nombre, email, rol }`.
2. `agregarTenantId` va después de `verificarToken` en **todas** las rutas de negocio. Fija `req.tenant_id` (entero).
3. Si la petición trae un `tenant_id` distinto en `query`, `body` o `params`, responde **403**. Si el token no trae
   `tenant_id` (p. ej. un token master), responde **403** en rutas de empresa.
4. Toda consulta a una tabla de negocio lleva `tenant_id = ?` con `req.tenant_id`; todo `INSERT` lo incluye.
5. Toda referencia a otro registro (cliente, artículo, unidad, empresa, rol de usuario) se valida **dentro del mismo
   tenant** antes de guardar; un id de otra empresa se trata como inexistente (400 «no existe»).
6. Un recurso de otra empresa responde **404** (no 403), para no revelar que existe.
7. El número de factura y el NCF se numeran **por empresa**: `configuracion` tiene una fila por tenant y las
   secuencias NCF son del tenant.

## Code Style

Igual que el resto del repo (ESM, español, `{ ok, data, mensaje }`). Ejemplo del patrón:

```js
router.get('/:id', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM clientes WHERE id = ? AND tenant_id = ? AND activo = 1',
    [req.params.id, req.tenant_id]
  )
  if (!rows[0]) return res.status(404).json({ ok: false, mensaje: 'Cliente no encontrado' })
  res.json({ ok: true, data: rows[0] })
})
```

## Testing Strategy

- Nivel: integración de la API con **dos empresas** (A y B) sembradas en `facilfactura_test`.
- Cada módulo de negocio tiene al menos: (a) B no ve los registros de A en el listado; (b) B recibe 404 al pedir,
  editar o borrar un registro de A por id; (c) B no puede crear un registro que apunte a un registro de A.
- Pruebas específicas: `tenant_id` ajeno en query/body/params → 403; token master en ruta de empresa → 403;
  numeración de facturas y NCF independiente entre empresas; el mismo código de artículo y el mismo número de factura
  pueden repetirse en empresas distintas; el mismo correo no puede repetirse.
- Las 79 pruebas existentes se adaptan a un tenant y siguen pasando.

## Boundaries

- **Always:** filtrar por `req.tenant_id` en toda consulta; probar el aislamiento con dos empresas; migraciones con `down`.
- **Ask first:** cambiar la clave de login (hoy correo global único); agregar dependencias.
- **Never:** leer el tenant del cuerpo, de la URL o de los parámetros; devolver 403 en vez de 404 por un recurso ajeno;
  tocar `facilfactura_db` (v1).

## Success Criteria

1. `db:migrate` deja `tenants` y `planes`, `tenant_id NOT NULL` con clave foránea en las 13 tablas de negocio, y los
   datos existentes asignados al tenant 1; `db:rollback` revierte sin error.
2. Las 12 rutas de negocio pasan la batería de aislamiento con dos empresas.
3. `tenant_id` ajeno en cualquier parte de la petición devuelve 403; un token sin `tenant_id` devuelve 403.
4. Dos empresas facturan a la vez con numeración independiente (F000001 en cada una) y sus NCF no se cruzan.
5. La aplicación funciona igual para el tenant 1 (login, factura, historial, panel) y `npm test` pasa completo.
6. `database/schema-saas.sql` regenerado con el esquema nuevo.

## Open Questions

- Ninguna. (El login por correo global único queda como decisión revisable.)
