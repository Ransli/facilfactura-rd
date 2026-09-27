// Operaciones sobre la suscripción de una empresa: iniciar, cambiar de plan, registrar pagos, suspender, reactivar,
// cancelar y marcar como exenta. Las usa la consola master; ninguna toca los datos de negocio de la empresa.
//
// Todas reciben una conexión `conn` que YA está dentro de una transacción (ver utils/transaccion.js): si algo falla,
// no queda nada a medias. Cada cambio se registra en `subscription_history` con su responsable (`actor`):
// 'master:<id>', 'usuario:<id>' o 'sistema'.

import { hoyRD } from './estado.js'
import { sumarDias, sumarMeses, fechaMayor } from './fechas.js'

export const DIAS_PARA_PAGAR = 5          // plazo para pagar un plan de pago recién elegido
const DIAS_PRUEBA_POR_OMISION = 30
const METODOS_DE_PAGO = ['transferencia', 'tarjeta', 'efectivo', 'cheque']

/** Error de negocio con el mensaje que puede mostrarse al usuario. */
export class ErrorDeSuscripcion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje)
    this.name = 'ErrorDeSuscripcion'
    this.estado = estado
  }
}

async function historial(conn, tenantId, accion, detalle, actor) {
  await conn.query(
    'INSERT INTO subscription_history (tenant_id, accion, detalle, actor) VALUES (?, ?, ?, ?)',
    [tenantId, accion, detalle ? String(detalle).slice(0, 500) : null, actor || 'sistema']
  )
}

// La empresa, bloqueada para que dos operaciones simultáneas sobre ella se turnen
async function cargarEmpresa(conn, tenantId) {
  const [[tenant]] = await conn.query('SELECT * FROM tenants WHERE id = ? FOR UPDATE', [tenantId])
  if (!tenant) throw new ErrorDeSuscripcion('La empresa indicada no existe', 404)
  return tenant
}

async function cargarPlan(conn, planId) {
  const [[plan]] = await conn.query('SELECT * FROM planes WHERE id = ? AND activo = 1', [planId])
  if (!plan) throw new ErrorDeSuscripcion('El plan indicado no existe o no está disponible')
  return plan
}

// La suscripción vigente de la empresa (la más reciente), con su vencimiento como texto AAAA-MM-DD
async function ultimaSuscripcion(conn, tenantId) {
  const [[sub]] = await conn.query(
    `SELECT id, plan_id, status, DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin
     FROM tenant_subscriptions WHERE tenant_id = ? ORDER BY id DESC LIMIT 1`, [tenantId])
  return sub || null
}

async function guardarSuscripcion(conn, tenantId, planId, status, fechaFin) {
  const sub = await ultimaSuscripcion(conn, tenantId)
  if (sub) {
    await conn.query('UPDATE tenant_subscriptions SET plan_id = ?, status = ?, fecha_fin = ? WHERE id = ?',
      [planId, status, fechaFin, sub.id])
    return sub.id
  }
  const [r] = await conn.query(
    'INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?, ?)',
    [tenantId, planId, status, hoyRD(), fechaFin])
  return r.insertId
}

/**
 * Inicia (o reinicia) la suscripción de una empresa con un plan. Plan de prueba o gratuito: entra en `prueba` por los
 * días del plan. Plan de pago: queda `pendiente_pago` y tiene DIAS_PARA_PAGAR días para pagar.
 */
export async function iniciarSuscripcion(conn, tenantId, planId, { actor = 'sistema' } = {}) {
  const tenant = await cargarEmpresa(conn, tenantId)
  const plan = await cargarPlan(conn, planId)
  const hoy = hoyRD()
  const existia = await ultimaSuscripcion(conn, tenantId)

  let estado, fechaLimite, status
  if (plan.es_plan_prueba || Number(plan.precio_mensual) === 0) {
    estado = 'prueba'; status = 'prueba'
    fechaLimite = sumarDias(hoy, plan.dias_prueba || DIAS_PRUEBA_POR_OMISION)
  } else {
    estado = 'pendiente_pago'; status = 'activo'
    fechaLimite = sumarDias(hoy, DIAS_PARA_PAGAR)
  }

  await conn.query('UPDATE tenants SET plan_id = ?, estado = ?, fecha_fin_prueba = ? WHERE id = ?',
    [planId, estado, fechaLimite, tenantId])
  await guardarSuscripcion(conn, tenantId, planId, status, fechaLimite)
  await historial(conn, tenantId, existia ? 'plan_cambiado' : 'creada',
    `Plan ${plan.nombre} (${estado === 'prueba' ? `prueba hasta ${fechaLimite}` : `pagar antes del ${fechaLimite}`})`, actor)

  return { estado, fecha_limite: fechaLimite, tenant: tenant.nombre }
}

/** Cambia el plan sin tocar el estado ni las fechas de la suscripción. */
export async function cambiarPlan(conn, tenantId, planId, { actor = 'sistema' } = {}) {
  const tenant = await cargarEmpresa(conn, tenantId)
  const nuevo = await cargarPlan(conn, planId)
  const [[anterior]] = await conn.query('SELECT nombre FROM planes WHERE id = ?', [tenant.plan_id])
  const sub = await ultimaSuscripcion(conn, tenantId)

  await conn.query('UPDATE tenants SET plan_id = ? WHERE id = ?', [planId, tenantId])
  if (sub) await conn.query('UPDATE tenant_subscriptions SET plan_id = ? WHERE id = ?', [planId, sub.id])
  await historial(conn, tenantId, 'plan_cambiado', `De ${anterior?.nombre ?? 'sin plan'} a ${nuevo.nombre}`, actor)
  return { plan: nuevo.nombre }
}

/**
 * Registra un pago y extiende la suscripción UN MES: desde el vencimiento vigente si aún no venció (no se pierden
 * días) o desde hoy si ya venció. La empresa queda `activa` (una empresa exenta sigue exenta).
 */
export async function registrarPago(conn, { tenantId, monto, metodo, referencia = null, actor = 'sistema' }) {
  const tenant = await cargarEmpresa(conn, tenantId)
  const importe = Number(monto)
  if (!Number.isFinite(importe) || importe <= 0) throw new ErrorDeSuscripcion('El monto del pago debe ser mayor que cero')
  if (!METODOS_DE_PAGO.includes(metodo)) throw new ErrorDeSuscripcion('El método de pago no es válido')

  const hoy = hoyRD()
  const sub = await ultimaSuscripcion(conn, tenantId)
  // Solo una empresa ACTIVA tiene cobertura ya pagada hasta su vencimiento. En una prueba o con el pago pendiente,
  // esa fecha es un plazo, no cobertura: el mes se cuenta desde hoy.
  const cobertura = tenant.estado === 'activo' && sub?.status === 'activo' ? sub.fecha_fin : null
  const desde = fechaMayor(hoy, cobertura)
  const hasta = sumarMeses(desde, 1)

  const subId = await guardarSuscripcion(conn, tenantId, tenant.plan_id, 'activo', hasta)
  const [pago] = await conn.query(
    `INSERT INTO subscription_payments
       (tenant_id, subscription_id, monto, metodo, referencia, estado, periodo_desde, periodo_hasta, fecha_pago, registrado_por)
     VALUES (?, ?, ?, ?, ?, 'pagado', ?, ?, ?, ?)`,
    [tenantId, subId, importe.toFixed(2), metodo, referencia, desde, hasta, hoy, actor])

  if (tenant.estado !== 'exento') {
    await conn.query("UPDATE tenants SET estado = 'activo', fecha_fin_prueba = NULL WHERE id = ?", [tenantId])
  }
  await historial(conn, tenantId, 'pago_registrado',
    `${importe.toFixed(2)} por ${metodo}${referencia ? ` (${referencia})` : ''}, cubre del ${desde} al ${hasta}`, actor)
  return { pagoId: pago.insertId, fecha_fin: hasta }
}

async function cambiarEstado(conn, tenantId, estado, statusSub, accion, detalle, actor) {
  await cargarEmpresa(conn, tenantId)
  await conn.query('UPDATE tenants SET estado = ? WHERE id = ?', [estado, tenantId])
  await conn.query(
    'UPDATE tenant_subscriptions SET status = ? WHERE id = (SELECT id FROM (SELECT MAX(id) AS id FROM tenant_subscriptions WHERE tenant_id = ?) x)',
    [statusSub, tenantId])
  await historial(conn, tenantId, accion, detalle, actor)
}

export const suspender = (conn, tenantId, { motivo = '', actor = 'sistema' } = {}) =>
  cambiarEstado(conn, tenantId, 'suspendido', 'suspendido', 'suspendida', motivo ? `Motivo: ${motivo}` : null, actor)

export const cancelar = (conn, tenantId, { motivo = '', actor = 'sistema' } = {}) =>
  cambiarEstado(conn, tenantId, 'cancelado', 'cancelado', 'cancelada', motivo ? `Motivo: ${motivo}` : null, actor)

export const reactivar = (conn, tenantId, { actor = 'sistema' } = {}) =>
  cambiarEstado(conn, tenantId, 'activo', 'activo', 'reactivada', null, actor)

export const marcarExento = (conn, tenantId, { motivo = '', actor = 'sistema' } = {}) =>
  cambiarEstado(conn, tenantId, 'exento', 'exento', 'exenta', motivo ? `Motivo: ${motivo}` : null, actor)

export const quitarExento = (conn, tenantId, { actor = 'sistema' } = {}) =>
  cambiarEstado(conn, tenantId, 'activo', 'activo', 'exencion_quitada', null, actor)
