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
- [x] S3. Límites del plan (`verificarLimite`, `GET /api/suscripcion/limites`) aplicados a usuarios y clientes
- [x] S4. Servicios de gestión con historial y `GET /api/suscripcion/planes` público
- [x] S5. Regenerar `schema-saas.sql` y cerrar el módulo

### Checkpoint (fin de `subscription`)
- [x] Criterios 1 a 7 de `SPEC-subscription.md` cumplidos; suite verde

---

# Módulo `onboarding`

- [x] O1. Paso 1 del alta: crear la empresa y aprovisionarla, con token de registro
- [x] O2. Paso 2: elegir plan
- [x] O3. Paso 3: crear el administrador y entregar la sesión
- [x] O4. Asistente de registro en el frontend
- [x] O5. Cierre del módulo

### Checkpoint (fin de `onboarding`)
- [x] Criterios 1 a 6 de `SPEC-onboarding.md` cumplidos; suite verde

---

# Módulos `ecf-signing` y `ecf-connector`

- [x] E1. Cifrado, lectura de certificados y firma XMLDSig (unitarias)
- [x] E2. Certificado digital por empresa (tabla y API)
- [x] E3. Secuencias e-NCF por empresa
- [x] E4. Constructor del XML de los e-CF 31, 32 y 34
- [x] E5. Emisión de facturas `E31/E32` con e-NCF y XML firmado
- [x] E6. Cliente de la DGII y simulador
- [x] E7. Cola de envío con reintentos
- [x] E8. Representación impresa con QR y código de seguridad
- [x] E9. Nota de crédito electrónica (34)
- [x] E10. Vista de e-CF en el frontend
- [x] E11. Esquema, documentación y cierre

### Checkpoint (fin de los módulos e-CF)
- [ ] Criterios de `SPEC-ecf-signing.md` y `SPEC-ecf-connector.md` cumplidos; suite verde
