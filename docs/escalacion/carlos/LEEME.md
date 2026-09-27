# Guía de Carlos: módulos de contabilidad, receptor y escáner

Hola Carlos. Esta carpeta (`docs/escalacion/carlos/`) es tu punto de partida para la escalación de FácilFactura RD
a plataforma SaaS con facturación electrónica. Aquí está **qué te toca, dónde va cada archivo, dónde está la base de
datos escalada y cómo subir tu trabajo**. El plan día por día está en [`PLAN.md`](PLAN.md).

## 1. Qué te toca

Del [mapa de capacidades](../CAPABILITY-MAP.md), tus módulos son estos (en este orden):

| Módulo | Qué hace | Cuándo |
|---|---|---|
| `accounting` | Gastos, retenciones y los formatos **606, 607, 608 y 609** de la DGII, más el borrador del IT-1 | 28 sep - 8 oct |
| `ecf-receiver` | Bandeja de e-CF recibidos, aprobación comercial, notas de crédito y débito | 8 - 10 oct (si alcanza) |
| `expense-scanner` | Captura de facturas de gasto por XML, QR y OCR con confirmación humana | 8 - 10 oct (si alcanza) |

Ransli hace todo lo demás (BD, multi-tenant, suscripción, consola master, firma y conector e-CF). Tu primer módulo
(`accounting`) solo necesita el contrato de `tenancy`, que se publica el **1 de octubre**; mientras tanto puedes
avanzar con las partes que no dependen de él (los formatos DGII son funciones puras).

## 2. Dónde está la base de datos escalada (el query)

| Qué | Dónde | Para qué |
|---|---|---|
| **Esquema completo de la BD escalada** | [`database/schema-saas.sql`](../../../database/schema-saas.sql) | Leer todas las tablas en un solo archivo, o importarlo: `mysql -u root -p < database/schema-saas.sql`. Es un archivo **generado**: no lo edites a mano |
| **Migraciones (fuente de verdad)** | `database/migrations/` | Cada cambio de esquema es un archivo con `up` y `down`. Así se crea y se cambia la BD |
| Esquema de la v1 (histórico) | `database/schema.sql` | Solo evidencia de Seminario de Proyecto I. No lo uses |

Base de datos de trabajo: **`facilfactura_saas`** (la v1 `facilfactura_db` no se toca). Cómo crearla en tu máquina:

```bash
cd backend
cp .env.example .env        # en Windows: copy .env.example .env  (DB_NAME ya dice facilfactura_saas)
npm run db:create           # crea la base vacía
npm run db:migrate          # aplica todas las migraciones
npm run db:copy-v1          # opcional: copia los datos de demostración de la v1, si tienes facilfactura_db
```

Cuando **agregues una tabla o columna**: crea una migración nueva (no edites las anteriores), córrela con
`npm run db:migrate` y regenera el archivo del esquema con `npm run db:dump-schema`. Sube **las dos cosas** en el
mismo commit.

## 3. Dónde va cada archivo

Los archivos ya escritos están en [`archivos/`](archivos/), con **la misma estructura de carpetas que el repositorio**.
Se copian a su lugar (misma ruta, sin la parte `docs/escalacion/carlos/archivos/`):

```bash
# desde la raíz del repositorio
cp -r docs/escalacion/carlos/archivos/. .
# Windows (PowerShell):  Copy-Item -Recurse -Force docs\escalacion\carlos\archivos\* .
```

Después de copiar, **completa cada archivo** (tienen `TODO` con lo que falta) y sube solo los que hayas terminado.

| Archivo en `archivos/` | Va en la raíz del repo, en | Qué es |
|---|---|---|
| `database/migrations/20261001120000_create_accounting_tables.js` | `database/migrations/` | Tablas `categorias_606`, `gastos` y `retenciones`. **No la corras hasta que exista `tenants`** (llega con `tenancy`, 1 de octubre) |
| `backend/services/contabilidad/formatoDGII.js` | `backend/services/contabilidad/` | Utilidades comunes de los formatos: RNC, fechas, montos y encabezado. **Ya funciona y tiene pruebas** |
| `backend/services/contabilidad/formato606.js` | `backend/services/contabilidad/` | Generador del 606 (compras). Completar |
| `backend/services/contabilidad/formato607.js` | `backend/services/contabilidad/` | Generador del 607 (ventas). Completar |
| `backend/services/contabilidad/formato608.js` | `backend/services/contabilidad/` | Generador del 608 (comprobantes anulados). Completar |
| `backend/services/contabilidad/formato609.js` | `backend/services/contabilidad/` | Generador del 609 (pagos al exterior). Completar |
| `backend/routes/contabilidad/gastos.js` | `backend/routes/contabilidad/` | CRUD de gastos por empresa. Completar |
| `backend/routes/contabilidad/retenciones.js` | `backend/routes/contabilidad/` | Retenciones de ITBIS e ISR. Completar |
| `backend/routes/contabilidad/reportes.js` | `backend/routes/contabilidad/` | Descarga de los formatos 606 a 609 y borrador del IT-1. Completar |
| `backend/tests/contabilidad/formatoDGII.test.js` | `backend/tests/contabilidad/` | Pruebas de las utilidades (ya pasan) |
| `backend/tests/contabilidad/gastos.test.js` | `backend/tests/contabilidad/` | Pruebas de los gastos, pendientes (`test.todo`) |
| `frontend/src/vistas/Contabilidad.jsx` | `frontend/src/vistas/` | Vista con pestañas Gastos y Reportes. Completar |

### Los 3 lugares donde se conecta tu código al resto (edítalos tú, son cambios de 1-3 líneas)

| Archivo existente | Qué agregar |
|---|---|
| `backend/app.js` | `import` de tus tres rutas y un `app.use('/api/contabilidad/gastos', ...)`, `.../retenciones` y `.../reportes` junto a las demás rutas |
| `frontend/src/App.jsx` | Importar `Contabilidad` y agregarla a `VISTAS` con el id `contabilidad` |
| `frontend/src/components/MenuLateral.jsx` | Un elemento nuevo en `items`: `{ id: 'contabilidad', icono: 'fa-solid fa-calculator', label: 'Contabilidad' }` |

## 4. El contrato con el resto del sistema (multi-tenant)

Desde `tenancy` todo dato pertenece a una empresa (tenant). **Reglas que tu código debe cumplir siempre:**

1. Toda tabla tuya tiene `tenant_id` (ya está en la migración) y toda consulta lleva `WHERE tenant_id = ?` con
   `req.tenant_id`. **Nunca** tomes el `tenant_id` del cuerpo, la URL ni los parámetros.
2. `req.tenant_id` lo pone el middleware de aislamiento de Ransli; en tus rutas ya vienen después de
   `verificarToken` (ver los archivos de `archivos/`).
3. Los números y códigos únicos lo son **por empresa**: `UNIQUE (tenant_id, ...)`.
4. Roles: `admin` y `facturador` escriben; `visor` solo consulta (mismo criterio que clientes).
5. Cada prueba de integración debe incluir un caso de **aislamiento**: la empresa B no puede ver ni tocar los
   gastos de la empresa A (403 o 404).

Hasta que `tenancy` esté en `master`, `req.tenant_id` no existe: escribe y prueba las funciones puras (los
formatos), y deja las rutas con los `TODO`.

## 5. Cómo trabajar y subir

- **Tu usuario:** commitea con tu propio usuario y correo de GitHub (`git config user.name` / `user.email`).
- **Antes de empezar cada día:** `git pull --rebase origin master`.
- **Un commit por cambio lógico**, en inglés, con prefijo `feat:`, `fix:`, `test:`, `docs:` o `chore:`. Los mensajes
  sugeridos están en [`PLAN.md`](PLAN.md).
- **Antes de cada push:** `npm test --prefix backend` debe pasar completo y `npm run build --prefix frontend` compilar.
  GitHub Actions corre lo mismo; si sale en rojo, se arregla antes de seguir.
- **Conflictos:** `database/schema-saas.sql` es generado. Si hay conflicto ahí, **no lo mezcles a mano**: resuelve
  las migraciones y ejecuta `npm run db:dump-schema` para regenerarlo.
- **Pruebas:** viven en `backend/tests/`. `npm test` crea y migra su propia base `facilfactura_test`; jamás toca
  `facilfactura_saas`. Empieza cada funcionalidad por una prueba que falle.

## 6. Reglas de oro

- **Preguntar antes de** agregar dependencias (por ejemplo un lector de XML o de OCR), cambiar CI o editar migraciones ya subidas.
- **Nunca** subir `.env`, credenciales ni certificados, ni tocar la base `facilfactura_db` (v1), ni saltarte o borrar una prueba que falla.
- Los formatos 606 a 609 deben validarse contra la **guía vigente de la DGII** antes de darlos por buenos: los
  campos de los archivos son el punto de partida, no la verdad final.

## 7. Dudas

Escríbele a Ransli. El contexto completo está en [`../SPEC-platform-db.md`](../SPEC-platform-db.md), el
[mapa de capacidades](../CAPABILITY-MAP.md) y la propuesta de la Unidad II (secciones VII y VIII).
