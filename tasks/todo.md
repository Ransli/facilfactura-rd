# Lista de tareas: módulo `tenancy`

Plan: `tasks/plan.md`. Un commit por tarea, en inglés, a nombre de Ransli, sin `Co-Authored-By`. **Sin push hasta que Ransli lo indique.**

- [x] T1. Tablas `planes` y `tenants` con planes iniciales y el tenant 1 (empresa migrada de la v1)
- [x] T2. `tenant_id` en las 13 tablas de negocio (default 1), datos al tenant 1, únicos por empresa
- [x] T3. `agregarTenantId`, JWT con `tenant_id`, helpers de dos empresas y aislamiento de clientes

### Checkpoint 1 (T1-T3)
- [x] Migraciones y rollback verificados, suite completa verde, clientes aislados entre empresas

- [x] T4. Aislamiento de categorías, unidades de medida, tipos de servicio y artículos
- [x] T5. Aislamiento de configuración, métodos de pago y secuencias NCF
- [x] T6. Aislamiento de facturas (numeración por empresa) y panel
- [x] T7. Aislamiento de usuarios
- [x] T8. Quitar los `DEFAULT 1`, regenerar `schema-saas.sql` y cerrar el módulo

### Checkpoint 2 (fin de `tenancy`)
- [x] Criterios 1 a 6 de `SPEC-tenancy.md` cumplidos; suite verde

---
Siguientes módulos: `subscription` → `onboarding` → `ecf-signing` → `ecf-connector` → `release`. Master aparte, fuera del repo.

---

# Módulo `subscription`

- [x] S1. Tablas de suscripción, pagos e historial; función pura `evaluarEstado` con pruebas unitarias
- [x] S2. `verificarSuscripcion` en las rutas de negocio (bloqueo = solo lectura) y `GET /api/suscripcion/mi-suscripcion`
- [ ] S3. Límites del plan (`verificarLimite`, `GET /api/suscripcion/limites`) aplicados a usuarios y clientes
- [ ] S4. Servicios de gestión con historial y `GET /api/suscripcion/planes` público
- [ ] S5. Regenerar `schema-saas.sql` y cerrar el módulo

### Checkpoint (fin de `subscription`)
- [ ] Criterios 1 a 7 de `SPEC-subscription.md` cumplidos; suite verde
