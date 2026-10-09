// Métricas globales de la plataforma para el panel principal de la consola master.
// Todo de un vistazo: cuántas empresas hay y en qué estado, cuánto se factura (a las empresas, MRR) y cuánto
// facturan ellas a sus propios clientes (uso real del sistema), más lo que necesita atención (por vencer).

/** Empresas por estado, y el total. */
async function empresasPorEstado(db) {
  const [filas] = await db.query('SELECT estado, COUNT(*) AS cantidad FROM tenants GROUP BY estado')
  const porEstado = Object.fromEntries(filas.map((f) => [f.estado, Number(f.cantidad)]))
  const total = Object.values(porEstado).reduce((a, b) => a + b, 0)
  return { total, porEstado }
}

/** Ingreso mensual recurrente: suma del precio de plan de cada empresa con una suscripción activa (no prueba/exenta). */
async function mrr(db) {
  const [[fila]] = await db.query(
    `SELECT COALESCE(SUM(p.precio_mensual), 0) AS mrr, COUNT(*) AS empresas_de_pago
     FROM tenants t JOIN planes p ON p.id = t.plan_id
     WHERE t.estado = 'activo'`)
  return { mrr: Number(fila.mrr), empresas_de_pago: Number(fila.empresas_de_pago) }
}

/** Pagos registrados este mes, en toda la plataforma. */
async function pagosDelMes(db) {
  const [[fila]] = await db.query(
    `SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS cantidad
     FROM subscription_payments
     WHERE estado = 'pagado' AND fecha_pago >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`)
  return { total: Number(fila.total), cantidad: Number(fila.cantidad) }
}

/** Facturación emitida por TODAS las empresas a sus propios clientes este mes (uso real del sistema). */
async function facturacionDelMes(db) {
  const [[fila]] = await db.query(
    `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS cantidad
     FROM facturas
     WHERE estado = 'emitida' AND fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`)
  return { total: Number(fila.total), cantidad: Number(fila.cantidad) }
}

/** e-CF aceptados por la DGII este mes, en toda la plataforma. */
async function ecfDelMes(db) {
  const [[fila]] = await db.query(
    `SELECT COUNT(*) AS cantidad FROM ecf_emitidos
     WHERE estado IN ('aceptado', 'aceptado_condicional') AND fecha_emision >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`)
  return { cantidad: Number(fila.cantidad) }
}

/** Empresas nuevas (registradas) este mes. */
async function nuevasDelMes(db) {
  const [[fila]] = await db.query(
    `SELECT COUNT(*) AS cantidad FROM tenants WHERE created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`)
  return Number(fila.cantidad)
}

/** Suscripciones de pago que vencen en los próximos 7 días: lo primero que un master querría revisar. */
async function porVencer(db) {
  const [filas] = await db.query(
    `SELECT t.id AS tenant_id, t.nombre, s.fecha_fin, p.nombre AS plan_nombre
     FROM tenant_subscriptions s
     JOIN tenants t ON t.id = s.tenant_id
     JOIN planes p ON p.id = s.plan_id
     WHERE s.status IN ('activo', 'prueba') AND s.fecha_fin IS NOT NULL
       AND s.fecha_fin BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
     ORDER BY s.fecha_fin ASC`)
  return filas
}

/** Las últimas empresas registradas, para el panel (no hace falta ir a la lista completa). */
async function ultimasEmpresas(db, limite = 5) {
  const [filas] = await db.query(
    `SELECT t.id AS tenant_id, t.nombre, t.estado, t.created_at, p.nombre AS plan_nombre
     FROM tenants t JOIN planes p ON p.id = t.plan_id
     ORDER BY t.created_at DESC LIMIT ?`, [limite])
  return filas
}

export async function obtener(db) {
  const [empresas, ingresos, pagos, facturacion, ecf, nuevas, vencenPronto, ultimas] = await Promise.all([
    empresasPorEstado(db), mrr(db), pagosDelMes(db), facturacionDelMes(db), ecfDelMes(db),
    nuevasDelMes(db), porVencer(db), ultimasEmpresas(db),
  ])
  return { empresas, ingresos, pagos, facturacion, ecf, nuevas_este_mes: nuevas, por_vencer: vencenPronto, ultimas_empresas: ultimas }
}
