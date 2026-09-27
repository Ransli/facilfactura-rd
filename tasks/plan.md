# Plan de implementación: fase SaaS (tenancy → release)

> Módulo en curso: **`tenancy`** (spec: `docs/escalacion/SPEC-tenancy.md`). Mapa: `docs/escalacion/CAPABILITY-MAP.md`.
> El plan de `platform-db` quedó completo (ver historial de git). Lista de tareas: `tasks/todo.md`.
> Trabajo **local**: los commits no se suben hasta que Ransli lo decida (previsto: 28-sep-2026).

## Orden global

`tenancy` → `subscription` → `onboarding` → `ecf-signing` → `ecf-connector` → `release`.
`master-console` se construye **aparte, fuera del repo**, en la carpeta de la materia, con instrucciones para que
Ransli lo commitee él mismo (paquete «Kit Master»).

## Decisiones de arquitectura (tenancy)

- **Migración en dos pasos para no romper el sistema:** primero `tenant_id NOT NULL DEFAULT 1` (las rutas viejas siguen
  funcionando y el tenant 1 es la empresa migrada), después de escopar todas las rutas se quita el `DEFAULT` para que
  cualquier `INSERT` sin `tenant_id` falle en la base de datos, no en silencio.
- **Un archivo de rutas por rebanada vertical:** cada tarea escribe primero la prueba de aislamiento (roja), escopa las
  rutas y la deja verde. Nunca se mezclan dos módulos de negocio en el mismo commit.
- **Helpers de prueba con dos empresas:** `crearEmpresa()` siembra tenant, usuarios, configuración y secuencias, y
  devuelve sesiones; así cada prueba de aislamiento compara A contra B.
- **Login por correo global único:** el token incluye `tenant_id`; no hay selector de empresa al iniciar sesión.

## Grafo de dependencias

```
T1 tablas de plataforma ──→ T2 tenant_id (default 1) ──→ T3 middleware + JWT + clientes
                                                            ├─→ T4 catálogo
                                                            ├─→ T5 configuración, métodos de pago, NCF
                                                            ├─→ T6 facturas y panel
                                                            └─→ T7 usuarios
                                          T4..T7 ──→ T8 quitar defaults, esquema, cierre
```

## Tareas

Detalle de criterios y verificación en cada tarea de `tasks/todo.md`. Verificación común de toda tarea: `npm test --prefix backend`
verde, una prueba de aislamiento que falló antes del cambio, y commit atómico a nombre de Ransli sin `Co-Authored-By`.

| Tarea | Alcance | Archivos principales |
|---|---|---|
| T1 | Tablas `planes` y `tenants`, planes iniciales, tenant 1 | migración nueva |
| T2 | `tenant_id` (default 1) en 13 tablas, respaldo de datos, únicos por empresa | migración nueva |
| T3 | `agregarTenantId`, JWT con `tenant_id`, helpers de dos empresas, aislamiento de **clientes** | `middleware/tenant.js`, `routes/auth.js`, `routes/clientes.js`, `tests/` |
| T4 | Aislamiento de categorías, unidades, tipos de servicio y artículos (con precios) | 4 rutas |
| T5 | Aislamiento de configuración (fila por empresa), métodos de pago y secuencias NCF | 3 rutas |
| T6 | Facturas (numeración por empresa, referencias cruzadas) y panel | `routes/facturas.js`, `routes/dashboard.js` |
| T7 | Usuarios por empresa | `routes/usuarios.js` |
| T8 | Quitar los `DEFAULT 1`, regenerar `schema-saas.sql`, actualizar CI y documentación | migración, esquema |

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Una consulta olvida el filtro de empresa | Alto (fuga de datos) | Prueba de aislamiento por ruta + quitar el `DEFAULT` al final |
| Referencias entre empresas (un cliente de A en una factura de B) | Alto | Validar cada referencia dentro del tenant; prueba específica |
| Romper las 79 pruebas existentes | Medio | Migración en dos pasos; suite completa tras cada tarea |
| Índices únicos globales bloquean a la segunda empresa | Medio | Cambiarlos a únicos por empresa en T2 con prueba |

## Preguntas abiertas

- Ninguna.
