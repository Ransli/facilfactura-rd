# Mapa de capacidades: escalación de FácilFactura RD a SaaS con e-CF

> Estado: **APROBADO el 2026-09-26** por Ransli García (mapa tal cual; conector e-CF contra TesteCF o simulador
> local, certificación oficial como paso posterior). Fuente: propuesta de la Unidad II (secciones IV a IX y XII)
> y `CONTEXTO_PROYECTO_SP2.md`. Los ids de módulo son estables: las specs (`SPEC-<id>.md`), el plan y los
> commits se refieren a ellos.

Base de código: `facilfactura-rd` v1 (React 18 + Express + MySQL). Base de datos nueva: `facilfactura_saas`
(la v1 `facilfactura_db` queda intacta). Migraciones con Knex.

## Módulos

| Id | Fase (propuesta) | Responsabilidad | Depende de | Responsable |
|---|---|---|---|---|
| `platform-db` | 1 | Migraciones Knex y BD `facilfactura_saas`; base de pruebas de integración en el repo; corrección de los defectos D-1 a D-5 de la Unidad IV | — | Ransli |
| `tenancy` | 2 | `tenant_id` en las tablas de negocio, JWT con `tenant_id`, middleware de aislamiento (rechaza `tenant_id` ajeno con 403), numeración de facturas y NCF por empresa, pruebas de aislamiento | `platform-db` | Ransli |
| `subscription` | 3 | Planes, suscripciones, pagos e historial; middlewares `checkSubscriptionStatus` (gracia de 2 días) y `checkLimits` (aviso al 80 %) | `tenancy` | Ransli |
| `onboarding` | 3 | Alta autoservicio: registrar empresa, elegir plan, crear administrador inicial; aprovisionamiento de datos por defecto de la empresa | `tenancy`, `subscription` | Ransli |
| `master-console` | 3 | Realm de autenticación de la plataforma (`usuarios_plataforma`), gestión de empresas y planes, impersonación (ver / editar) y consola master en el frontend | `subscription` | Ransli |
| `ecf-signing` | 4 | Certificados digitales por empresa y firma XMLDSig del e-CF | `tenancy` | Ransli |
| `ecf-connector` | 5 | Secuencias e-NCF, construcción del XML de los tipos 31, 32 y 34, cliente de los servicios web de la DGII (semilla, token, recepción, TrackID), código de seguridad y representación impresa con QR; límite `max_ecf_mes` | `ecf-signing`, `subscription` | Ransli |
| `ecf-receiver` | 6 | Bandeja de e-CF recibidos, aprobación comercial y acuse; notas de crédito y débito | `ecf-connector` | Carlos |
| `accounting` | 7 | Gastos, retenciones, categorías 606, formatos 606/607/608/609 y borrador del IT-1 | `tenancy`, `ecf-connector` | Carlos |
| `expense-scanner` | 8 | Digitalización de facturas de gasto: XML del e-CF, QR y OCR con confirmación humana | `accounting` | Carlos |
| `release` | 9 | Endurecimiento de seguridad, retención de datos, documentación final y despliegue piloto | todos | ambos |

## Dirección de dependencias

```
platform-db → tenancy → subscription → onboarding
                  │          └───────→ master-console
                  ├──→ ecf-signing → ecf-connector → ecf-receiver
                  │                        └───────→ accounting → expense-scanner
                  └────────────────────────────────→ accounting
release depende de todos
```

Sin ciclos. `subscription` aporta a `ecf-connector` solo el límite mensual de e-CF; el contrato entre módulos
vive en la spec del módulo proveedor.

## Orden de construcción y plazo (2 semanas: 26-sep a 10-oct-2026)

| Fechas | Ransli | Carlos |
|---|---|---|
| 26-28 sep | `platform-db` | Lee la spec de `tenancy`; prepara su entorno |
| 28 sep - 1 oct | `tenancy` | Empieza `accounting` con el contrato de `tenancy` ya publicado |
| 1 - 4 oct | `subscription`, `onboarding` | `accounting` (gastos, retenciones, 607) |
| 4 - 7 oct | `master-console`, `ecf-signing` | `accounting` (606, 608, 609) |
| 7 - 10 oct | `ecf-connector` (tipos 31/32/34) | `ecf-receiver` y `expense-scanner` si alcanza |

## Alcance mínimo garantizado y riesgos (a revisar)

1. **Corte del MVP:** `platform-db`, `tenancy`, `subscription`, `onboarding`, `master-console`, `ecf-signing` y
   `ecf-connector`. Es el primer hito de la propuesta (multi-tenant + e-CF 31/32/34).
2. **Fuera del MVP si el plazo aprieta:** `ecf-receiver`, `expense-scanner` y parte de `accounting`.
3. **Certificación real ante la DGII:** es un trámite externo (certificado digital de INDOTEL, set de pruebas
   y aprobación) que no se puede completar en 2 semanas. El conector se construye y prueba contra el
   ambiente de pruebas (TesteCF) o un simulador local; la certificación queda como paso posterior a la entrega.
4. **Precios de los planes:** no están definidos en la propuesta; se siembran valores de ejemplo editables.
5. **Retraso:** el cronograma original terminaba el 1-oct; este plan compra 9 días y no admite holgura.

## Convenciones de trabajo

- Commits solo a nombre de Ransli García (`blaiby2017@gmail.com`), sin `Co-Authored-By` de Claude; mensajes en
  inglés (`feat:`, `fix:`, `docs:`, `chore:`), un cambio lógico por commit.
- Carlos sube sus módulos con su propio usuario de GitHub, siguiendo su plan por línea de tiempo.
- Cada módulo cierra con pruebas de integración y de aislamiento entre empresas.
