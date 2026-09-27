# Spec: `platform-db` (base técnica de la plataforma)

> Módulo 1 de 10 del [mapa de capacidades](CAPABILITY-MAP.md). Fase 1 de la propuesta de la Unidad II.
> Estado: **BORRADOR, pendiente de aprobación.**

## Objective

Dejar lista la base técnica sobre la que se construye el SaaS multi-tenant:

1. Una base de datos nueva, **`facilfactura_saas`**, creada **solo con migraciones Knex** y partiendo del esquema
   exacto de la v1. La v1 (`facilfactura_db`) no se toca: es la evidencia de Seminario de Proyecto I.
2. Una **suite de pruebas de integración dentro del repositorio**, con base de pruebas propia, que pueda
   ejecutarse con un comando y sea la red de seguridad de todos los módulos siguientes.
3. Los **5 defectos abiertos D-1 a D-5** de la Unidad IV corregidos, cada uno con su prueba escrita primero.

Usuarios: el equipo (Ransli y Carlos) y el profesor, que revisa el repositorio.

## Assumptions (decisiones ya tomadas, no se reinterrogan)

- Base nueva `facilfactura_saas`; base de pruebas `facilfactura_test`; MariaDB/MySQL local en `localhost:3306`.
- Migraciones con **Knex** (ya instalado en `backend/`). No se usa ORM: las consultas siguen en `mysql2`.
- Las pruebas usan el runner integrado de Node (`node --test`) y `fetch`, **sin dependencias nuevas**.
- Los datos de la v1 se copian a la base nueva con un script, no con migraciones.

## Tech Stack

Node.js 22 (mínimo 18), Express 4.19, mysql2 3.10, Knex 3.3, JWT, MariaDB 10.4. Sin cambios de stack.

## Commands

```
Crear la BD:         npm run db:create --prefix backend
Migrar:              npm run db:migrate --prefix backend
Estado:              npm run db:status --prefix backend
Deshacer la última:  npm run db:rollback --prefix backend
Copiar datos v1:     npm run db:copy-v1 --prefix backend        (origen facilfactura_db, tenant destino 1)
Pruebas:             npm test --prefix backend                  (crea y migra facilfactura_test solo)
Desarrollo:          npm run dev
```

## Project Structure

```
database/migrations/     → migraciones Knex (una por cambio lógico, con up y down)
database/schema.sql      → esquema v1, se conserva como referencia histórica
backend/knexfile.js      → configuración de Knex (ESM)
backend/scripts/         → create-db.js, copy-from-v1.js
backend/app.js           → crea y exporta la app Express (sin escuchar puerto)
backend/index.js         → arranque: importa app.js y escucha el puerto
backend/tests/           → pruebas de integración (*.test.js) y helpers (tests/helpers/)
docs/escalacion/         → mapa de capacidades, specs por módulo, planes
```

## Code Style

Se mantiene el estilo del repo: ESM, identificadores en español, respuesta `{ ok, data, mensaje }`, consultas
parametrizadas. Ejemplo de migración y de prueba:

```js
// database/migrations/YYYYMMDDHHMMSS_nombre_en_ingles.js
export async function up(knex) {
  await knex.schema.alterTable('facturas', (t) => {
    t.index(['fecha'], 'idx_facturas_fecha')
  })
}
export async function down(knex) {
  await knex.schema.alterTable('facturas', (t) => t.dropIndex([], 'idx_facturas_fecha'))
}
```

```js
// backend/tests/facturas.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { api, sesion } from './helpers/api.js'

test('D-3: rechaza cantidades negativas', async () => {
  const { token } = await sesion('facturador')
  const r = await api('POST', '/facturas', { token, body: { /* ítem con cantidad -5 */ } })
  assert.equal(r.status, 400)
})
```

Migraciones: nombre en inglés, en minúsculas y con guion bajo; siempre reversibles.

## Testing Strategy

- **Nivel:** integración de la API (HTTP real contra la app en un puerto efímero) sobre `facilfactura_test`.
- **Ciclo:** rojo-verde-refactor. Cada defecto D-n empieza con una prueba que falla y se cierra cuando pasa.
- **Origen en la Unidad IV:** las 60 pruebas ya ejecutadas pasan al repo; los 7 casos que fallaban se
  convierten en los tests de D-1 a D-5.
- **Aislamiento:** cada archivo de prueba parte de datos conocidos; la suite no depende del orden.
- **Cobertura mínima de este módulo:** autenticación, roles, facturación (cálculo, NCF, concurrencia), NCF,
  historial y validaciones. La cobertura de aislamiento entre empresas se añade en `tenancy`.

## Boundaries

- **Always:** trabajar solo sobre `facilfactura_saas` y `facilfactura_test`; escribir la prueba antes del arreglo;
  migraciones con `down`; commits atómicos a nombre de Ransli, sin `Co-Authored-By`; ejecutar `npm test`
  antes de cada commit.
- **Ask first:** agregar dependencias nuevas; añadir CI (GitHub Actions); borrar o reescribir historial;
  cualquier `push` que no sea un avance simple de `master`.
- **Never:** modificar o borrar `facilfactura_db`; commitear `.env` o credenciales; quitar o saltar una prueba
  que falla; usar `TRUNCATE`/`DROP` sobre una base que no sea la de pruebas sin confirmación.

## Success Criteria

1. Con MariaDB vacía, `db:create` + `db:migrate` producen las 14 tablas de la v1 más `knex_migrations`, y
   `db:rollback` las deshace sin error.
2. `db:copy-v1` deja en `facilfactura_saas` el mismo número de filas por tabla que `facilfactura_db`, y una
   comprobación antes y después demuestra que la v1 no cambió.
3. `npm test` arranca desde cero (crea y migra la base de pruebas), termina en menos de 60 s y pasa al 100 %.
4. Correcciones verificadas por prueba:
   - **D-1:** 10 facturas simultáneas producen 10 números de factura y 10 NCF distintos y consecutivos.
   - **D-2:** con retención de ITBIS del 30 %, una factura de 1,000.00 da total 1,026.00 (subtotal + ITBIS − retención de ITBIS − retención de ISR).
   - **D-3:** cantidad ≤ 0 o precio negativo devuelve 400 y no consume NCF ni número.
   - **D-4:** el rol visor recibe 403 al crear, editar o eliminar clientes.
   - **D-5:** artículo, cliente, empresa o rol inexistentes devuelven 400 con mensaje claro, nunca 500.
5. La aplicación arranca y funciona con `DB_NAME=facilfactura_saas` (login, factura, historial, panel).

## Open Questions

- ¿Se agrega un flujo de GitHub Actions con servicio MariaDB para correr `npm test` en cada push? La propuesta
  lo menciona en la Fase 1, pero es configuración de CI (pide tu aprobación). Recomendado: sí, en una tarea
  aparte al final del módulo.
