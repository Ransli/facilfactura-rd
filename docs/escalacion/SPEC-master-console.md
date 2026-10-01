# Spec: `master-console` (realm de plataforma, gestión de empresas e impersonación)

> Módulo del [mapa de capacidades](CAPABILITY-MAP.md). Fase 3 de la propuesta de la Unidad II.
> Depende de `subscription`. Referencia de diseño: **FinanceCore** (`D:\Ramas de sistema-financiero-react`,
> plataforma SaaS multi-tenant en producción) — se toma el CONCEPTO (realm separado, impersonación ver/editar,
> gestión de empresas y planes), no el código: la implementación sigue las convenciones propias de este
> repositorio (TDD, nombres en español, servicios que reciben `db`/`conn`, claves JWT derivadas como en
> `services/tenants/registro.js`). Estado: implementado y probado el 2026-09-28 por Ransli García (kit
> construido en un worktree aparte; se sube al repo por su cuenta, en los commits que indica `LEEME.md`).

## Objective

Que exista una **consola de administración de la plataforma**, separada de las empresas: un usuario que no
pertenece a ningún tenant, que puede ver todas las empresas, cambiar su plan, registrar sus pagos, suspenderlas
o reactivarlas, y **entrar a la vista de una empresa** para verificar o corregir algo — en modo **ver** (solo
lectura) o **editar** (con permiso de escritura real), siempre dejando constancia de que fue el master quien
entró.

Éxito = un token de empresa nunca sirve para las rutas del master ni al revés; una empresa nunca ve a otra desde
la consola; el modo "ver" jamás permite escribir, ni siquiera llamando la API directamente; toda la lógica de
negocio de suscripción (cambiar plan, pagar, suspender...) la reutiliza tal cual, sin duplicarla.

## Assumptions (decisiones tomadas)

- **Realm propio:** tabla `usuarios_plataforma` (nombre, email único, password_hash). Nadie ahí tiene
  `tenant_id`: no son de ninguna empresa. Un solo rol (todos son "master"); no hay niveles de permiso master
  distintos, la propuesta no los pide.
- **Token separado:** el JWT del master se firma con `JWT_SECRET + ':master'` — el mismo truco que ya usa el
  token de registro de empresas (`services/tenants/registro.js`, `':registro'`). Así un token de tenant jamás
  pasa por `verificarTokenMaster`, y un token de master jamás pasa por `verificarToken` (rutas de negocio),
  aunque ambos deriven del mismo `JWT_SECRET` base.
- **Impersonación = un token de tenant normal**, minteado por el master, con dos variantes:
  - **Ver:** el payload lleva `solo_lectura: true`. `middleware/auth.js` (`verificarToken`) lo revisa y
    devuelve 403 ante cualquier método que no sea GET/HEAD/OPTIONS. Cambio **aditivo**: ningún token existente
    lleva ese campo, así que no afecta a nadie más.
  - **Editar:** token normal de administrador, sin restricciones.
  - En **ambos** casos el `id` del payload es el de un **administrador real** de esa empresa (no el del
    master): así `GET /auth/me` lo reconoce sin cambios, y las columnas que son clave foránea hacia `usuarios`
    (p. ej. `facturas.usuario_id`) no rompen. El `id` del master queda en `impersonado_por`, para una futura
    auditoría.
  - Vigencia corta: 2 horas.
- **La consola no duplica lógica de negocio:** llama a `services/suscripcion/gestion.js` (ya construido y
  probado por el módulo `subscription`) pasándole `actor: 'master:<id>'`, igual que hace cualquier otro llamador
  de esos servicios.
- **Frontend como realm aparte:** entra por la ruta `/master` (`esConsolaMaster` en `main.jsx`), con su propia
  sesión en `localStorage` (`master_token`/`master`, nunca `token`/`usuario`). La impersonación pasa el token a
  la app de empresa por el **fragmento** de la URL (`#impersonar=<token>`), nunca por `?query`, para que no
  quede en ningún log de servidor ni en el `Referer`.

## Tech Stack

Igual que el resto del backend/frontend (Node 22 + Express + MySQL/Knex; React 18 + Vite). Sin dependencias
nuevas.

## Project Structure

```
database/migrations/…_create_usuarios_plataforma.js
backend/middleware/master.js               → verificarTokenMaster
backend/middleware/auth.js                 → (modificado) bloqueo de solo_lectura, aditivo
backend/services/master/autenticacion.js   → autenticarMaster (login)
backend/services/master/empresas.js        → listar, detalle, cambiarPlan, registrarPago, cambiarEstado, tokenDeImpersonacion
backend/routes/master-auth.js              → POST /login, GET /me
backend/routes/master-empresas.js          → listado, detalle, plan, pagos, estado, impersonar
backend/scripts/crear-master.js            → alta del primer master (no interactivo)
backend/tests/master/*.test.js
frontend/src/master/masterApi.js           → cliente API del realm master (localStorage aparte)
frontend/src/master/MasterApp.jsx          → login + tabla de empresas + detalle
frontend/src/main.jsx                      → (modificado) enruta /master a MasterApp
frontend/src/context/AuthContext.jsx       → (modificado) adopta #impersonar=<token>
```

## Contract

1. `POST /api/master/auth/login` `{email, password}` → `{token, master}`. `GET /api/master/auth/me` confirma
   la sesión.
2. `GET /api/master/empresas` (master) → lista con plan, estado, bloqueo y uso de cada empresa.
3. `GET /api/master/empresas/:id` → empresa + suscripción + límites + historial + pagos. 404 si no existe.
4. `PUT /api/master/empresas/:id/plan` `{plan_id}`, `POST …/pagos` `{monto, metodo, referencia}`,
   `POST …/estado` `{accion: suspender|reactivar|cancelar|exentar|quitar_exencion, motivo}` — delegan en
   `services/suscripcion/gestion.js` con `actor: 'master:<id>'`.
5. `POST /api/master/empresas/:id/impersonar` `{modo: 'ver'|'editar'}` → `{token, tenant}`. 404 si la empresa no
   existe o no tiene un administrador activo.
6. Todas las rutas de `/api/master/*` exigen `verificarTokenMaster`; ninguna acepta un token de tenant.

## Code Style

Igual que el resto del repo: servicios reciben `db`/`conn` y devuelven objetos simples; errores de negocio son
clases propias (`ErrorDeAutenticacion`, `ErrorDeMaster`) con `estado` HTTP.

## Testing Strategy

- **Unitarias/integración (`backend/tests/master/`):** aislamiento de los dos realms (un token no sirve para el
  otro), login (credenciales buenas/malas, mismo mensaje para no filtrar qué correos existen, master inactivo),
  listar y detalle, cambiar plan/pago/estado con su actor en el historial, impersonación de punta a punta (ver
  bloquea escritura, editar no; el token sirve de verdad contra las rutas reales de la empresa), bloqueo
  `solo_lectura` en `middleware/auth.js` sin romper los tokens normales.
- Se corrió la suite **completa** del backend después de los cambios (incluidos los de `middleware/auth.js` y
  `tests/helpers/datos.js`): sin regresiones.

## Boundaries

- **Always:** todo cambio de plan/estado/pago pasa por `services/suscripcion/gestion.js`, nunca un `UPDATE`
  directo a `tenants` desde las rutas del master.
- **Ask first:** agregar niveles de permiso dentro del realm master; guardar el `impersonado_por` en una tabla
  de auditoría aparte (hoy solo vive en el JWT).
- **Never:** mintear un token de impersonación con el `id` del master (rompe `/auth/me` y las FK de
  `usuario_id`); dejar una ruta de `/api/master/*` sin `verificarTokenMaster`.

## Success Criteria

1. Un token de tenant no entra a `/api/master/*` y uno de master no entra a las rutas de negocio (401 en ambos
   sentidos).
2. El modo "ver" nunca escribe, ni llamando la API directamente con el token.
3. Cambiar plan, pagar y cambiar estado desde la consola dejan su fila en `subscription_history` con
   `actor = 'master:<id>'`.
4. Suite completa del backend en verde después de integrar el módulo.

## Open Questions

- Auditoría persistente de `impersonado_por` (tabla propia) — no la pidió la propuesta; hoy solo queda en el
  JWT de la sesión impersonada.
