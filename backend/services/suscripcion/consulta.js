import { evaluarEstado } from './estado.js'

/**
 * Suscripción de una empresa: su plan, su estado comercial y la evaluación (bloqueo, gracia, avisos).
 * Las fechas se piden como texto AAAA-MM-DD para no depender de la zona horaria del servidor.
 *
 * @param db        pool o conexión de mysql2
 * @param tenantId  id de la empresa
 * @returns         null si la empresa no existe
 */
export async function obtenerSuscripcion(db, tenantId, hoy) {
  const [rows] = await db.query(
    `SELECT t.id AS tenant_id, t.estado,
            DATE_FORMAT(t.fecha_fin_prueba, '%Y-%m-%d') AS fecha_fin_prueba,
            p.id AS plan_id, p.nombre AS plan_nombre, p.slug AS plan_slug, p.precio_mensual, p.moneda,
            p.max_usuarios, p.max_clientes, p.max_ecf_mes, p.es_plan_prueba,
            ts.status AS sub_status, DATE_FORMAT(ts.fecha_fin, '%Y-%m-%d') AS sub_fecha_fin,
            DATE_FORMAT(ts.fecha_inicio, '%Y-%m-%d') AS sub_fecha_inicio, ts.dias_gracia
     FROM tenants t
     JOIN planes p ON p.id = t.plan_id
     LEFT JOIN tenant_subscriptions ts ON ts.id = (SELECT MAX(id) FROM tenant_subscriptions WHERE tenant_id = t.id)
     WHERE t.id = ?`,
    [tenantId]
  )
  const f = rows[0]
  if (!f) return null

  const evaluacion = evaluarEstado(f, hoy, f.dias_gracia ?? undefined)
  return {
    tenant_id: f.tenant_id,
    estado: f.estado,
    ...evaluacion,
    plan: {
      id: f.plan_id, nombre: f.plan_nombre, slug: f.plan_slug, precio_mensual: Number(f.precio_mensual), moneda: f.moneda,
      max_usuarios: f.max_usuarios, max_clientes: f.max_clientes, max_ecf_mes: f.max_ecf_mes, es_plan_prueba: !!f.es_plan_prueba,
    },
    suscripcion: { status: f.sub_status, fecha_inicio: f.sub_fecha_inicio, fecha_fin: f.sub_fecha_fin },
  }
}
