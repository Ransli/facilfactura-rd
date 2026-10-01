// Gestión de empresas (tenants) desde la consola master: listado con su uso, detalle, cambio de plan, pagos,
// cambios de estado e impersonación. Es una capa fina sobre `services/suscripcion/*`, que ya tiene toda la
// lógica de negocio probada; aquí solo se decide QUIÉN puede llamarla (el master) y CÓMO se identifica en el
// historial (`actor: 'master:<id>'`).

import jwt from 'jsonwebtoken'
import { enTransaccion } from '../../utils/transaccion.js'
import { obtenerSuscripcion } from '../suscripcion/consulta.js'
import { obtenerLimites, usoEcfDelMes } from '../suscripcion/limites.js'
import * as gestion from '../suscripcion/gestion.js'

/** Error de negocio propio del módulo (acciones inválidas que no vienen de gestion.js). */
export class ErrorDeMaster extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje)
    this.name = 'ErrorDeMaster'
    this.estado = estado
  }
}

const ACCIONES_DE_ESTADO = {
  suspender: gestion.suspender,
  reactivar: gestion.reactivar,
  cancelar: gestion.cancelar,
  exentar: gestion.marcarExento,
  quitar_exencion: gestion.quitarExento,
}

/** Todas las empresas, con su plan, su estado y su uso actual (para la tabla principal de la consola). */
export async function listar(db) {
  const [tenants] = await db.query(
    `SELECT t.id AS tenant_id, t.nombre, t.slug, t.rnc, t.estado, t.created_at,
            p.id AS plan_id, p.nombre AS plan_nombre, p.slug AS plan_slug, p.precio_mensual,
            p.max_usuarios, p.max_clientes, p.max_ecf_mes
     FROM tenants t JOIN planes p ON p.id = t.plan_id
     ORDER BY t.created_at DESC`)

  const resultado = []
  for (const t of tenants) {
    const suscripcion = await obtenerSuscripcion(db, t.tenant_id)
    const limites = await obtenerLimites(db, t.tenant_id, suscripcion.plan)
    resultado.push({
      tenant_id: t.tenant_id, nombre: t.nombre, slug: t.slug, rnc: t.rnc, estado: t.estado, creada: t.created_at,
      plan: { id: t.plan_id, nombre: t.plan_nombre, slug: t.plan_slug, precio_mensual: Number(t.precio_mensual) },
      bloqueado: suscripcion.bloqueado, en_gracia: suscripcion.enGracia, motivo: suscripcion.motivo,
      uso: { usuarios: limites.usuarios, clientes: limites.clientes, ecf_mes: limites.ecf_mes },
    })
  }
  return resultado
}

/** La empresa con su suscripción, sus límites, su historial completo y sus pagos. null si no existe. */
export async function detalle(db, tenantId) {
  const suscripcion = await obtenerSuscripcion(db, tenantId)
  if (!suscripcion) return null
  const [[tenant]] = await db.query('SELECT id, nombre, slug, rnc, estado, created_at FROM tenants WHERE id = ?', [tenantId])
  const limites = await obtenerLimites(db, tenantId, suscripcion.plan, { ecfDelMes: await usoEcfDelMes(db, tenantId) })
  const [historial] = await db.query(
    'SELECT accion, detalle, actor, created_at FROM subscription_history WHERE tenant_id = ? ORDER BY id', [tenantId])
  const [pagos] = await db.query(
    `SELECT monto, moneda, metodo, referencia, estado, periodo_desde, periodo_hasta, fecha_pago, registrado_por
     FROM subscription_payments WHERE tenant_id = ? ORDER BY id DESC`, [tenantId])
  return { tenant, suscripcion, limites, historial, pagos }
}

export const cambiarPlan = (db, tenantId, planId, { actor }) =>
  enTransaccion(db, (conn) => gestion.cambiarPlan(conn, tenantId, planId, { actor }))

export const registrarPago = (db, tenantId, { monto, metodo, referencia }, { actor }) =>
  enTransaccion(db, (conn) => gestion.registrarPago(conn, { tenantId, monto, metodo, referencia, actor }))

/** `accion`: una de suspender, reactivar, cancelar, exentar, quitar_exencion. */
export async function cambiarEstado(db, tenantId, accion, { motivo, actor }) {
  const fn = ACCIONES_DE_ESTADO[accion]
  if (!fn) throw new ErrorDeMaster(`Acción de estado desconocida: ${accion}. Usa una de: ${Object.keys(ACCIONES_DE_ESTADO).join(', ')}`)
  return enTransaccion(db, (conn) => fn(conn, tenantId, { motivo, actor }))
}

/**
 * Token de tenant (mismo formato que el login normal) para que el master entre a ver o editar una empresa.
 *
 * El `id` del token es el de un administrador REAL de la empresa (no el del master): así `GET /auth/me` lo
 * reconoce y, sobre todo, las escrituras que dejan `usuario_id` (p. ej. una factura) respetan la clave foránea
 * hacia `usuarios`. Queda `impersonado_por` con el id del master para distinguirlo en una auditoría futura.
 * Modo 'ver': `solo_lectura:true` (bloquea cualquier escritura, ver middleware/auth.js). Modo 'editar': token
 * normal de administrador, con permiso de escritura real.
 *
 * @returns { token, tenant: {id, nombre} } o null si la empresa no existe o no tiene un administrador activo
 */
export async function tokenDeImpersonacion(db, tenantId, { modo = 'ver', masterId }) {
  const [[tenant]] = await db.query('SELECT id, nombre FROM tenants WHERE id = ?', [tenantId])
  if (!tenant) return null

  const [[admin]] = await db.query(
    `SELECT u.id, u.nombre, u.email FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE u.tenant_id = ? AND u.activo = 1 AND r.nombre = 'admin' ORDER BY u.id LIMIT 1`, [tenant.id])
  if (!admin) return null

  const payload = {
    id: admin.id, tenant_id: tenant.id, email: admin.email,
    nombre: `Master — ${modo === 'editar' ? 'editando' : 'viendo'} ${tenant.nombre}`,
    rol: 'admin', impersonado_por: masterId, ...(modo === 'editar' ? {} : { solo_lectura: true }),
  }
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '2h' })
  return { token, tenant: { id: tenant.id, nombre: tenant.nombre } }
}
