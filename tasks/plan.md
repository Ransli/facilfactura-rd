# Plan de implementación: escalación de FácilFactura RD a SaaS con e-CF

> Módulo en curso: **`platform-db`** (spec: `docs/escalacion/SPEC-platform-db.md`).
> Mapa global: `docs/escalacion/CAPABILITY-MAP.md`. Plazo de todo el proyecto: 26-sep a 10-oct-2026.
> Lista de tareas: `tasks/todo.md`. Definición de terminado: `~/.claude/references/definition-of-done.md`.

## Resumen

Dejar la base técnica del SaaS: una BD nueva `facilfactura_saas` creada solo con migraciones Knex desde el
esquema de la v1, una suite de pruebas de integración en el repo con base de pruebas propia, los 5 defectos
D-1 a D-5 de la Unidad IV corregidos con TDD, CI en GitHub Actions, el dump `database/schema-saas.sql` y el
kit de trabajo para Carlos.

## Decisiones de arquitectura

- **Pruebas sin dependencias nuevas:** `node --test` + `fetch` contra la app en un puerto efímero. `--test-concurrency=1`
  porque todos los archivos comparten la BD `facilfactura_test`.
- **`app.js` separado de `index.js`:** la app se crea y exporta sin escuchar puerto; así las pruebas la levantan en
  proceso. Cambio sin efecto de comportamiento.
- **Aislamiento de la BD de pruebas:** el helper fija `DB_NAME=facilfactura_test` *antes* de importar la app, sin
  importar el `.env`, para que una prueba jamás toque `facilfactura_saas` ni la v1.
- **Preparación de la BD de pruebas:** `pretest` (drop, create, `migrate:latest`) una vez por corrida; cada archivo
  de prueba reinicia los datos de negocio con `reiniciarDatos()` para no depender del orden.
- **Cada defecto entra por TDD:** prueba roja escrita primero, commit del arreglo con la prueba en verde.
- **`schema-saas.sql` se genera, no se edita a mano:** `npm run db:dump-schema` lo produce desde la BD migrada.
  Se regenera al cerrar cada módulo que cambie el esquema.
- **Kit de Carlos:** carpeta espejo `docs/escalacion/carlos/archivos/` (misma estructura que el repo) más una guía con
  la tabla «archivo → ruta de destino». Se completa cuando `tenancy` fije el contrato real.

## Grafo de dependencias

```
T1 migraciones ──→ T2 copia v1 ──┐
       │                         │
       └──→ T3 app.js ──→ T4 arnés de pruebas ──→ T5, T6, T7 (portar pruebas)
                                                        │
                            T8 (D-1)  T9 (D-2)  T10 (D-3)  T11 (D-5)  T12 (D-4)   ← cada uno usa T4
                                                        │
                            T13 schema-saas.sql ──→ T14 kit de Carlos
                            T15 GitHub Actions (necesita T4)
                            T16 documentación, memoria y push (cierre)
```

## Tareas (detalle)

### Fase 1: base de datos

**T1. Migraciones Knex y scripts `db:*`.** Commitear lo ya escrito y comprobar el ciclo completo.
- Acepta: `db:create` + `db:migrate` crean 14 tablas + `knex_migrations` en `facilfactura_saas`; `db:rollback` las quita; migrar de nuevo funciona.
- Verifica: `npm run db:create && npm run db:migrate && npm run db:status` (manual con SHOW TABLES) y rollback.
- Archivos: `backend/knexfile.js`, `backend/scripts/create-db.js`, `database/migrations/20260926000001_baseline_v1.js`, `backend/package.json`, `backend/.env.example`. Alcance: S.

**T2. Copia de los datos de la v1.** Ejecutar `db:copy-v1` y demostrar que la v1 no cambió.
- Acepta: mismas filas por tabla en origen y destino; suma de verificación de la v1 igual antes y después.
- Verifica: script de comparación de conteos y `CHECKSUM TABLE` de las 14 tablas de la v1.
- Archivos: `backend/scripts/copy-from-v1.js` (ajustes si falla). Alcance: XS.

### Fase 2: arnés de pruebas

**T3. Extraer `app.js`.** `backend/app.js` exporta la app; `index.js` solo escucha.
- Acepta: el backend arranca igual con `DB_NAME=facilfactura_saas`; login y panel responden.
- Verifica: arrancar y `curl /api/health`, login con el usuario de demostración. Archivos: `backend/app.js`, `backend/index.js`. Alcance: S.

**T4. Arnés de pruebas y `npm test`.** `tests/prepare-db.js`, helpers `api`, `sesion`, `reiniciarDatos` y una prueba de humo.
- Acepta: `npm test --prefix backend` crea y migra `facilfactura_test`, ejecuta la prueba de humo y pasa; imposible apuntar a otra BD.
- Verifica: `npm test`; comprobar que `facilfactura_saas` y la v1 no cambian. Archivos: `backend/tests/prepare-db.js`, `backend/tests/helpers/*.js`, `backend/tests/humo.test.js`, `backend/package.json`. Alcance: M.

**Checkpoint A (T1-T4):** migraciones y copia verificadas, la app corre sobre `facilfactura_saas`, `npm test` verde.

### Fase 3: portar las 60 pruebas (comportamiento actual)

**T5. Pruebas de autenticación, roles y seguridad** (AUT-01..08, ROL-01..06, SEG-01/02). Alcance: S (`tests/auth.test.js`).
**T6. Pruebas de clientes, catálogo, configuración y usuarios** (CLI, ART, CFG, USU). Alcance: M (`tests/catalogo.test.js`, `tests/usuarios.test.js`).
**T7. Pruebas de facturación, NCF e historial** (FAC-01..09, NCF-01..07, HIS-01..09, DAS-01). Alcance: M (`tests/facturas.test.js`, `tests/ncf.test.js`).
- Acepta (T5-T7): cada caso de la Unidad IV vive en el repo; todos pasan sobre el código actual.
- Verifica: `npm test` verde tras cada tarea.

**Checkpoint B (T5-T7):** ~53 casos en verde, suite en menos de 60 s.

### Fase 4: defectos con TDD (una pieza vertical cada uno)

**T8. D-1, numeración concurrente.** Prueba roja: 10 emisiones simultáneas dan 10 números y 10 NCF distintos. Arreglo en `routes/facturas.js` (leer la configuración con bloqueo tras bloquear la secuencia).
**T9. D-2, total con retención de ITBIS parcial.** Prueba roja (1,000.00 con retención 30 % da 1,026.00). Arreglo en `routes/facturas.js` y en `frontend/src/vistas/Factura.jsx` para que la vista y el servidor coincidan.
**T10. D-3, cantidades y precios inválidos.** Prueba roja; validación en `routes/facturas.js` (400, sin consumir NCF).
**T11. D-5, referencias inexistentes.** Prueba roja para artículo, cliente y rol; validación previa en `facturas.js` y `usuarios.js`.
**T12. D-4, permisos de clientes.** Prueba roja (visor recibe 403); `soloFacturador` en escritura de `clientes.js` y botones ocultos para el visor en `Clientes.jsx`.
- Acepta (T8-T12): la prueba del defecto pasa y toda la suite sigue verde.
- Verifica: `npm test`; T9 y T12 además con revisión visual en la app.

**Checkpoint C (T8-T12):** los 5 defectos cerrados, suite completa en verde, app probada a mano sobre `facilfactura_saas`.

### Fase 5: esquema, CI y kit

**T13. `schema-saas.sql`.** `npm run db:dump-schema` genera `database/schema-saas.sql` (DDL + datos de referencia) desde la BD migrada.
- Acepta: importarlo en una BD vacía deja el mismo esquema que las migraciones (comparación de `SHOW CREATE TABLE`). Alcance: S.

**T14. Kit de Carlos v0.** `docs/escalacion/carlos/`: `LEEME.md` (cómo trabajar, dónde está la BD escalada, cómo levantar todo), `PLAN.md` (línea de tiempo con commits por día), `archivos/` con el esqueleto real de sus módulos y una tabla «archivo → ruta de destino». Se actualiza en `tenancy`. Alcance: M.

**T15. GitHub Actions.** `.github/workflows/ci.yml` con servicio MariaDB, `npm ci` y `npm test`. Alcance: S.

**T16. Cierre del módulo.** README (flujo de BD y pruebas), `CONTEXTO_PROYECTO_SP2.md`, memoria, push de `master` con `npm test` verde.

**Checkpoint D (fin de `platform-db`):** criterios 1 a 5 de la spec cumplidos, CI verde en GitHub, kit de Carlos publicado.

## Orden global de los módulos siguientes (se planifican cuando toque)

`tenancy` → `subscription` → `onboarding` → `master-console` → `ecf-signing` → `ecf-connector` → `release`.
Carlos, en paralelo desde el contrato de `tenancy`: `accounting` → `ecf-receiver` → `expense-scanner`.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El plazo total (2 semanas) es justo | Alto | Corte de MVP en el mapa; `platform-db` se cierra en 1-2 días |
| Una prueba toca por error `facilfactura_saas` o la v1 | Alto | El helper fija `DB_NAME` de pruebas antes de importar la app; comprobación en T4 |
| El arreglo de D-1 cambia el orden de bloqueos y causa interbloqueos | Medio | Bloquear siempre en el mismo orden (secuencia, luego configuración); la prueba de 10 emisiones lo detecta |
| Node `--test` con procesos por archivo y una BD compartida | Medio | `--test-concurrency=1` y `reiniciarDatos()` por archivo |
| El kit de Carlos queda desfasado respecto al contrato de `tenancy` | Medio | T14 es v0; se rehace al cerrar `tenancy` |

## Preguntas abiertas

- Ninguna. El usuario aprobó spec, CI y política de push.
