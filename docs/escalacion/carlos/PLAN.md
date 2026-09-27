# Plan de Carlos por línea de tiempo (28 sep - 10 oct 2026)

Cada fila es un día de trabajo con lo que se sube ese día. Los commits están sugeridos con su mensaje: súbelos con
tu usuario, uno por cambio lógico, y **cada día termina con `npm test --prefix backend` en verde antes del push**.
Guía de rutas y reglas: [`LEEME.md`](LEEME.md).

> Este plan asume que Ransli publica `tenancy` en `master` el **1 de octubre**. Hasta entonces, tu trabajo es el que
> no depende de la base multi-empresa (los formatos DGII como funciones puras).

## Módulo `accounting` (28 sep - 8 oct)

| Fecha | Trabajo | Commits sugeridos | Criterio de terminado |
|---|---|---|---|
| **Lun 28 sep** | Preparar el entorno (`LEEME.md` §2), copiar los archivos a su lugar (§3) y hacer pasar `formatoDGII.test.js` | `chore: place the accounting skeleton files` | `npm test` verde con las pruebas de utilidades |
| **Mar 29 sep** | Formato **607** (ventas): completar `formato607.js` con datos de prueba fijos, sin BD | `feat: build the 607 sales report from invoice data` · `test: cover the 607 report format` | Un caso con 3 facturas (una anulada, una de consumo) da las líneas esperadas |
| **Mié 30 sep** | Formato **606** (compras): completar `formato606.js` | `feat: build the 606 purchases report from expense data` · `test: cover the 606 report format` | Caso con gasto con retención de ITBIS e ISR |
| **Jue 1 oct** | `tenancy` ya en `master`: `git pull --rebase`, correr la migración `create_accounting_tables` y regenerar el esquema | `feat: add the accounting tables (categories, expenses, withholdings)` | `db:migrate` y `db:dump-schema` sin error; `schema-saas.sql` incluye tus 3 tablas |
| **Vie 2 oct** | Rutas de **gastos** con aislamiento por empresa (`gastos.js`) y sus pruebas, incluida la de aislamiento | `feat: add the expenses API scoped by tenant` · `test: cover expenses and cross-tenant isolation` | La empresa B no ve ni edita los gastos de A |
| **Sáb 3 oct** | Rutas de **retenciones** (`retenciones.js`) | `feat: add the withholdings API` · `test: cover withholdings` | Retención de ITBIS e ISR calculada y guardada por gasto |
| **Lun 5 oct** | **Reportes**: endpoints que arman 606 y 607 desde la BD y devuelven el TXT (`reportes.js`) | `feat: serve the 606 and 607 files by period` · `test: cover the report endpoints` | Descarga por período (`AAAAMM`) con el encabezado correcto |
| **Mar 6 oct** | Formatos **608** (anuladas) y **609** (pagos al exterior) | `feat: build the 608 and 609 report formats` · `test: cover the 608 and 609 formats` | Las facturas anuladas de la BD salen en el 608 |
| **Mié 7 oct** | Vista **Contabilidad** en el frontend (pestañas Gastos y Reportes) y conexión al menú | `feat: add the accounting view with expenses and reports` | Se registra un gasto y se descarga un 606 desde la interfaz |
| **Jue 8 oct** | Borrador del **IT-1** y repaso contra la guía de la DGII | `feat: add the IT-1 draft summary` · `docs: note the DGII format sources` | Resumen de ITBIS del período cuadra con las facturas y gastos |

**Checkpoint (8 oct):** `accounting` completo, suite verde, CI verde, vista funcionando.

## Módulos `ecf-receiver` y `expense-scanner` (9 - 10 oct, solo si alcanza)

Dependen del conector e-CF de Ransli (tablas `ecf_emitidos` y `certificados_digitales`, previsto para el 7-10 oct).
Los archivos de estos dos módulos se entregan cuando el contrato del conector esté publicado (kit v2). Mientras
tanto, si terminas antes:

| Fecha | Trabajo | Commit sugerido |
|---|---|---|
| Vie 9 oct | Diseñar la tabla `ecf_recibidos` y la bandeja de recibidos (migración + ruta `GET`) | `feat: add the received e-CF inbox` |
| Sáb 10 oct | Lector del XML del e-CF de un proveedor para precargar un gasto (**pedir aprobación antes de agregar una librería de XML**) | `feat: prefill an expense from a supplier e-CF XML` |

Si no alcanza el tiempo, estos dos módulos quedan documentados como trabajo siguiente en la sección IX de la Unidad IV.

## Qué esperar de Ransli (dependencias)

| Fecha | Ransli entrega | Lo necesitas para |
|---|---|---|
| 1 oct | `tenancy`: `tenants`, `tenant_id` en las tablas, `req.tenant_id` | Migración y rutas de contabilidad |
| 1 oct | Kit v1 (esta carpeta actualizada con el contrato real) | Quitar los `TODO` de las rutas |
| 4 oct | `subscription` (límites por plan) | Nada obligatorio; verás el estado de la suscripción en la app |
| 7-10 oct | Conector e-CF | `ecf-receiver` y el ingreso electrónico en el 607 |

## Si te atrasas

Avísale a Ransli el mismo día. Prioridad de recorte, de lo primero que se sacrifica a lo último:
`expense-scanner` → `ecf-receiver` → IT-1 → 609 → 608. **El 606 y el 607 con gastos y ventas reales son lo mínimo
para dar `accounting` por entregado.**
