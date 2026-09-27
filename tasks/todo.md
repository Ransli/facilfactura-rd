# Lista de tareas: módulo `tenancy`

Plan: `tasks/plan.md`. Un commit por tarea, en inglés, a nombre de Ransli, sin `Co-Authored-By`. **Sin push hasta que Ransli lo indique.**

- [x] T1. Tablas `planes` y `tenants` con planes iniciales y el tenant 1 (empresa migrada de la v1)
- [ ] T2. `tenant_id` en las 13 tablas de negocio (default 1), datos al tenant 1, únicos por empresa
- [ ] T3. `agregarTenantId`, JWT con `tenant_id`, helpers de dos empresas y aislamiento de clientes

### Checkpoint 1 (T1-T3)
- [ ] Migraciones y rollback verificados, suite completa verde, clientes aislados entre empresas

- [ ] T4. Aislamiento de categorías, unidades de medida, tipos de servicio y artículos
- [ ] T5. Aislamiento de configuración, métodos de pago y secuencias NCF
- [ ] T6. Aislamiento de facturas (numeración por empresa) y panel
- [ ] T7. Aislamiento de usuarios
- [ ] T8. Quitar los `DEFAULT 1`, regenerar `schema-saas.sql` y cerrar el módulo

### Checkpoint 2 (fin de `tenancy`)
- [ ] Criterios 1 a 6 de `SPEC-tenancy.md` cumplidos; suite verde

---
Siguientes módulos: `subscription` → `onboarding` → `ecf-signing` → `ecf-connector` → `release`. Master aparte, fuera del repo.
