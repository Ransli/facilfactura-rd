# Spec: `onboarding` (alta de empresas autoservicio)

> Módulo 4 del [mapa de capacidades](CAPABILITY-MAP.md). Fase 3 de la propuesta de la Unidad II (sección V.5, figura 3).
> Depende de `tenancy` y `subscription`. Referencia: `POST /registrar-tenant → /seleccionar-plan → /registrar-gerente-inicial` de FinanceCore.
> Estado: aprobado por Ransli el 2026-09-27 (trabajo local, se sube el día siguiente).

## Objective

Que una empresa nueva se dé de alta **sola**, sin intervención del equipo, en tres pasos: (1) datos de la empresa,
(2) elección de plan, (3) creación de su administrador, y quede lista para facturar: con su empresa emisora, su
configuración, sus catálogos por defecto y su suscripción iniciada.

Éxito = al terminar el paso 3 el administrador **ya tiene sesión iniciada** y el sistema está operativo para su empresa;
y nadie puede usar el proceso de alta para **entrar a una empresa que ya existe**.

## Assumptions (decisiones tomadas)

- **Mejora de seguridad frente a FinanceCore.** Allí los pasos 2 y 3 reciben el `tenant_id` en el cuerpo, sin sesión: cualquiera
  puede crear un «gerente» en la empresa de otro. Aquí el paso 1 devuelve un **token de registro** (JWT firmado con una clave
  derivada distinta, válido 2 horas y ligado a esa empresa) que los pasos 2 y 3 exigen. Ese token **no sirve** en las rutas de
  negocio (otra clave) y el paso 3 solo funciona **una vez**, mientras la empresa no tenga usuarios.
- Plan por omisión al registrarse: el plan de prueba gratuito (o el más barato si no existiera). El paso 2 permite cambiarlo.
- El correo del administrador es único en toda la plataforma (`tenancy`).
- Validación de RNC/cédula por **longitud** (9 u 11 dígitos), igual que la interfaz actual; el dígito verificador no se valida.
- **Límite anti-abuso:** máximo de empresas por IP (3 por omisión, `LIMITE_REGISTROS_POR_IP` en el entorno). Se cuenta por
  `tenants.ip_registro`.
- La empresa se aprovisiona con `aprovisionarEmpresa` (empresa emisora, configuración, 13 unidades y 5 tipos de servicio).
  No se crean secuencias NCF: cada empresa registra las suyas autorizadas por la DGII.
- El logo se sube después, desde Configuración.

## Tech Stack

Sin cambios ni dependencias nuevas (`jsonwebtoken` y `bcryptjs` ya están).

## Commands

```
Pruebas:   npm test --prefix backend
Frontend:  npm run build --prefix frontend
```

## Project Structure

```
backend/routes/registro.js                → POST /api/registro/empresa, /plan, /administrador (públicas + token de registro)
backend/services/tenants/registro.js      → crearEmpresa(), lógica de los tres pasos y el token de registro
backend/utils/documentos.js               → limpieza y validación de RNC/cédula
backend/tests/onboarding/*.test.js        → recorrido completo, validaciones y seguridad
frontend/src/vistas/Registro.jsx          → asistente de tres pasos
frontend/src/vistas/Login.jsx             → enlace «Crear una cuenta»
```

## Contract

1. `POST /api/registro/empresa` (público) `{ nombre, rnc, correo, telefono, direccion }` → 201 `{ token_registro, empresa:{nombre,slug} }`.
2. `POST /api/registro/plan` (Bearer token de registro) `{ plan_id }` → 200 con el estado y la fecha límite. Solo mientras la empresa no tiene usuarios.
3. `POST /api/registro/administrador` (Bearer token de registro) `{ nombre, email, password }` → 201 `{ token, usuario }` (sesión normal).
   Un segundo intento responde **409**.
4. El token de registro se firma con `JWT_SECRET + ':registro'` y expira en 2 horas; `verificarToken` no lo acepta.
5. Todo se hace en transacciones: un fallo no deja empresas, usuarios ni historial a medias.

## Code Style

Igual que el repo. Validación con mensajes claros en español; los errores de negocio responden 400/409/429, no 500.

## Testing Strategy

- Recorrido feliz completo hasta usar el sistema con la sesión recibida.
- Validaciones de cada campo; RNC y nombre duplicados; correo de administrador ya usado.
- Seguridad: pasos 2 y 3 sin token, con token de sesión normal, con token falsificado o vencido, con el token de otra empresa; paso 3 dos veces y en paralelo (una sola gana); token de registro rechazado en rutas de negocio.
- Límite por IP (429) y aprovisionamiento (empresa emisora, configuración, catálogos, sin secuencias NCF).
- La empresa nueva queda aislada de las demás (usa `tenancy`).

## Boundaries

- **Always:** transacciones; mensajes claros; token de registro ligado a una sola empresa; una sola vez el paso 3.
- **Ask first:** cambiar el límite por IP por omisión; validar dígitos verificadores de RNC/cédula.
- **Never:** aceptar un `tenant_id` del cuerpo en los pasos 2 y 3; devolver datos de otras empresas; crear el administrador en una empresa que ya tiene usuarios.

## Success Criteria

1. Un visitante sin sesión completa los tres pasos y entra al sistema como administrador de su empresa nueva.
2. La empresa nueva tiene empresa emisora, configuración, 13 unidades, 5 tipos de servicio, suscripción iniciada e historial, y ninguna secuencia NCF.
3. Todas las validaciones y duplicados responden 400 con mensaje claro; el límite por IP responde 429.
4. Ninguno de los ataques de la estrategia de pruebas logra crear un usuario en una empresa ajena.
5. El asistente del frontend compila y muestra los tres pasos con sus errores.
6. Suite completa en verde.

## Open Questions

- Ninguna.
