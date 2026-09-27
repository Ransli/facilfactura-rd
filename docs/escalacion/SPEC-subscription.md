# Spec: `subscription` (planes, suscripción y límites)

> Módulo 3 del [mapa de capacidades](CAPABILITY-MAP.md). Fase 3 de la propuesta de la Unidad II (sección V.3).
> Depende de `tenancy`. Referencia: `checkSubscriptionStatus.js` y `checkLimits.js` de FinanceCore.
> Estado: aprobado por Ransli el 2026-09-27 (trabajo local, se sube el día siguiente).

## Objective

Que cada empresa tenga un **plan** con **límites** y una **suscripción mensual** cuyo estado gobierne lo que puede hacer:
trabajar con normalidad, trabajar con aviso (período de gracia) o solo consultar. Y que exista la lógica (servicios) para
que la consola master cambie planes, registre pagos y suspenda o reactive empresas, con historial de cada cambio.

Éxito = una suscripción vencida o suspendida **nunca borra ni oculta datos** (lectura y descarga siguen), pero **bloquea
crear, editar o emitir**; un plan con límite **impide crear** el registro que lo excede.

## Assumptions (decisiones tomadas)

- **Estados del tenant** (`tenants.estado`): `activo`, `prueba`, `suspendido`, `cancelado`, `pendiente_pago`, `pendiente`, `exento`.
- **Período de gracia de 2 días** tras el vencimiento (propuesta y FinanceCore): se puede trabajar con aviso.
- **Bloqueo = solo lectura:** con la suscripción bloqueada, `GET`/`HEAD`/`OPTIONS` siguen funcionando y cualquier escritura
  responde 403 con `suscripcion_bloqueada: true`. (La propuesta: «se bloquea la emisión de nuevos comprobantes, pero se
  mantiene el acceso de solo lectura y la descarga de la información histórica».)
- **Plan de pago nuevo:** la empresa tiene **5 días** para pagar antes de quedar bloqueada (`pendiente_pago`).
- **Un mes de suscripción** se cuenta desde el vencimiento vigente si aún no venció (no se pierden días al renovar antes).
- Los límites usan **-1 = ilimitado**. Se controlan usuarios activos y clientes activos ahora; **e-CF por mes** lo aplica el
  conector (`ecf-connector`) con el mismo helper.
- Los precios de los planes son de ejemplo (migración de `tenancy`) y se editan desde la consola master.
- Las fechas de negocio se calculan en la **zona horaria de República Dominicana** (America/Santo_Domingo).
- Este módulo entrega **servicios y middleware**. Las rutas HTTP de administración (consola master) se construyen aparte.

## Tech Stack

Sin cambios ni dependencias nuevas.

## Commands

```
Migrar:    npm run db:migrate --prefix backend
Pruebas:   npm test --prefix backend
Esquema:   npm run db:dump-schema --prefix backend
```

## Project Structure

```
database/migrations/…_create_subscription_tables.js   → tenant_subscriptions, subscription_payments, subscription_history
backend/services/suscripcion/estado.js                → evaluarEstado(): función pura (estado, gracia, bloqueo)
backend/services/suscripcion/gestion.js               → iniciarSuscripcion, cambiarPlan, registrarPago, suspender, reactivar, cancelar, marcarExento
backend/services/suscripcion/limites.js               → obtenerLimites(tenantId)
backend/middleware/suscripcion.js                     → verificarSuscripcion (bloquea escrituras) y verificarLimite('usuarios'|'clientes')
backend/routes/suscripcion.js                         → GET /planes (público), /mi-suscripcion, /limites
backend/tests/suscripcion/*.test.js                   → unitarias (estado) e integración
```

## Contract

1. `verificarSuscripcion` va después de `agregarTenantId` en **todas** las rutas de negocio. Deja `req.suscripcion =
   { bloqueado, enGracia, diasRestantes, motivo, plan, vence }`.
2. Bloqueada → escrituras 403 `{ ok:false, suscripcion_bloqueada:true, motivo, mensaje }`; lecturas pasan.
3. `verificarLimite(recurso)` va en las rutas que **crean** ese recurso. Al límite → 403 `{ ok:false, limite_alcanzado:true,
   recurso, actual, max, plan }`. Con ≥ 80 % de uso deja `req.limiteAviso`.
4. Toda operación de `gestion.js` corre dentro de la transacción del llamador, valida que el tenant exista y **registra
   una fila en `subscription_history`** con el actor (`master:<id>`, `sistema` o `usuario:<id>`).
5. Ninguna operación de este módulo borra datos de la empresa.

## Code Style

Igual que el repo. La lógica de estado es una función pura para probarla sin base de datos:

```js
export function evaluarEstado({ estado, fecha_fin_prueba, sub_fecha_fin }, hoy = hoyRD(), diasGracia = 2) {
  if (estado === 'exento') return { bloqueado: false, enGracia: false, diasRestantes: null, motivo: null }
  // …
}
```

## Testing Strategy

- **Unitarias** (sin BD) de `evaluarEstado`: exento, prueba vigente / en gracia / vencida, activo vigente / en gracia /
  vencido, suspendido, cancelado, pendiente de pago dentro y fuera del plazo, y los bordes de fecha (último día, día 3).
- **Integración** con dos empresas: bloqueada = lectura sí y escritura no; gracia = trabaja con aviso; reactivar restablece;
  las escrituras de una empresa bloqueada no afectan a otra; límites de usuarios y clientes (incluye ilimitado, desactivados
  no cuentan y aviso al 80 %); `mi-suscripcion` y `limites`; `planes` público sin token.
- **Servicios:** registrar pago extiende un mes, activa la empresa y deja pago e historial; cambiar plan, suspender, reactivar,
  cancelar y marcar exento dejan historial; ninguna toca los datos de negocio.

## Boundaries

- **Always:** validar el estado con la función pura; registrar cada cambio en el historial; conservar la lectura.
- **Ask first:** cambiar el período de gracia o los días para pagar; agregar dependencias.
- **Never:** borrar o esconder datos de una empresa por falta de pago; permitir escrituras con la suscripción bloqueada;
  dejar que la empresa cambie su propio plan o estado desde la API de empresa.

## Success Criteria

1. Migración con las 3 tablas y una suscripción para el tenant 1 (exento); rollback sin error.
2. `evaluarEstado` cubre todos los casos de la tabla de estados con pruebas unitarias.
3. Empresa bloqueada: `GET` 200 y escritura 403 en las rutas de negocio; en gracia trabaja con aviso; reactivada vuelve a escribir.
4. `verificarLimite` frena la creación al alcanzar el máximo del plan y respeta -1.
5. `registrarPago` extiende la suscripción un mes y todo cambio deja historial.
6. `GET /api/suscripcion/planes` responde sin token; `mi-suscripcion` y `limites` solo con sesión de empresa.
7. Suite completa en verde y `schema-saas.sql` regenerado.

## Open Questions

- Ninguna.
