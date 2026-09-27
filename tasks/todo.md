# Lista de tareas: módulo `platform-db`

Plan y detalle: `tasks/plan.md`. Marcar cada tarea al terminar (criterios cumplidos + definición de terminado).
Un commit por tarea, en inglés, a nombre de Ransli, sin `Co-Authored-By`.

## Fase 1: base de datos
- [x] T1. Migraciones Knex y scripts `db:*` (commit + ciclo create/migrate/rollback)
- [x] T2. Copia de datos de la v1 y prueba de que la v1 no cambió

## Fase 2: arnés de pruebas
- [x] T3. Extraer `app.js` de `index.js`
- [x] T4. Arnés de pruebas y `npm test` con `facilfactura_test`

### Checkpoint A (T1-T4)
- [x] Migraciones y copia verificadas, app corre sobre `facilfactura_saas`, `npm test` verde

## Fase 3: portar las pruebas de la Unidad IV
- [x] T5. Autenticación, roles y seguridad
- [x] T6. Clientes, catálogo, configuración y usuarios
- [x] T7. Facturación, NCF e historial

### Checkpoint B (T5-T7)
- [x] 56 casos en verde, suite en menos de 60 s

## Fase 4: defectos con TDD
- [x] T8. D-1 numeración concurrente
- [x] T9. D-2 total con retención de ITBIS parcial (servidor y vista)
- [x] T10. D-3 cantidades y precios inválidos
- [x] T11. D-5 referencias inexistentes (facturas y usuarios)
- [x] T12. D-4 permisos de clientes (servidor y vista)

### Checkpoint C (T8-T12)
- [x] 5 defectos cerrados, suite completa verde, app probada a mano sobre `facilfactura_saas`

## Fase 5: esquema, CI y kit
- [ ] T13. `database/schema-saas.sql` generado con `db:dump-schema`
- [ ] T14. Kit de Carlos v0 en `docs/escalacion/carlos/`
- [ ] T15. GitHub Actions con MariaDB
- [ ] T16. Cierre: README, contexto, memoria y push a `master`

### Checkpoint D (fin del módulo)
- [ ] Criterios 1 a 5 de la spec cumplidos, CI verde, kit de Carlos publicado

---
Siguientes módulos (orden): `tenancy` → `subscription` → `onboarding` → `master-console` → `ecf-signing` → `ecf-connector` → `release`.
Carlos en paralelo: `accounting` → `ecf-receiver` → `expense-scanner`.
