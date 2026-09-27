// Límites del plan de cada empresa. -1 significa ilimitado.

// Qué se cuenta y contra qué campo del plan se compara
const RECURSOS = {
  usuarios: { campoPlan: 'max_usuarios', sql: 'SELECT COUNT(*) AS n FROM usuarios WHERE tenant_id = ? AND activo = 1' },
  clientes: { campoPlan: 'max_clientes', sql: 'SELECT COUNT(*) AS n FROM clientes WHERE tenant_id = ? AND activo = 1' },
}

export const UMBRAL_AVISO = 80   // % de uso desde el que se avisa que se acerca al límite

export function esRecursoLimitado(recurso) {
  return Object.hasOwn(RECURSOS, recurso)
}

/** Cantidad de registros activos que la empresa usa de un recurso. */
export async function usoActual(db, tenantId, recurso) {
  if (!esRecursoLimitado(recurso)) throw new Error(`Recurso desconocido: ${recurso}`)
  const [[fila]] = await db.query(RECURSOS[recurso].sql, [tenantId])
  return Number(fila.n)
}

/** Resumen de uso frente al máximo del plan. `max` -1 = ilimitado (sin porcentaje). */
export function resumenDeUso(actual, max) {
  if (max === -1) return { actual, max, porcentaje: null, cerca_del_limite: false, al_limite: false }
  const porcentaje = max > 0 ? Math.round((actual / max) * 100) : 100
  return { actual, max, porcentaje, cerca_del_limite: porcentaje >= UMBRAL_AVISO && actual < max, al_limite: actual >= max }
}

/**
 * Uso de todos los recursos de la empresa. `ecf_mes` lo llena el conector e-CF cuando existe; hasta entonces es 0.
 * @param plan  { max_usuarios, max_clientes, max_ecf_mes, ... } (de obtenerSuscripcion().plan)
 */
export async function obtenerLimites(db, tenantId, plan, { ecfDelMes = 0 } = {}) {
  return {
    plan: { id: plan.id, nombre: plan.nombre, slug: plan.slug },
    usuarios: resumenDeUso(await usoActual(db, tenantId, 'usuarios'), plan.max_usuarios),
    clientes: resumenDeUso(await usoActual(db, tenantId, 'clientes'), plan.max_clientes),
    ecf_mes: resumenDeUso(ecfDelMes, plan.max_ecf_mes),
  }
}
