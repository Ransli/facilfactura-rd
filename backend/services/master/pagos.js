// Vista global (todas las empresas) de los pagos de suscripción y de los cambios de plan: la versión "consola
// master" de lo que `services/master/empresas.js` ya muestra por empresa en su detalle.

/** Todos los pagos de la plataforma, más recientes primero. `tenantId` filtra opcionalmente por una empresa. */
export async function listarPagos(db, { tenantId } = {}) {
  const condicion = tenantId ? 'WHERE sp.tenant_id = ?' : ''
  const params = tenantId ? [tenantId] : []
  const [filas] = await db.query(
    `SELECT sp.id, sp.tenant_id, t.nombre AS empresa, sp.monto, sp.moneda, sp.metodo, sp.referencia, sp.estado,
            sp.periodo_desde, sp.periodo_hasta, sp.fecha_pago, sp.registrado_por, sp.created_at
     FROM subscription_payments sp JOIN tenants t ON t.id = sp.tenant_id
     ${condicion} ORDER BY sp.id DESC`, params)
  return filas
}

/** Cambios de plan de toda la plataforma (acción `plan_cambiado` del historial de cada empresa). */
export async function listarCambiosDePlan(db, { tenantId } = {}) {
  const condicion = tenantId ? 'AND h.tenant_id = ?' : ''
  const params = tenantId ? [tenantId] : []
  const [filas] = await db.query(
    `SELECT h.id, h.tenant_id, t.nombre AS empresa, h.detalle, h.actor, h.created_at
     FROM subscription_history h JOIN tenants t ON t.id = h.tenant_id
     WHERE h.accion = 'plan_cambiado' ${condicion}
     ORDER BY h.id DESC`, params)
  return filas
}
