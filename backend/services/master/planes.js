// Catálogo de planes de suscripción, administrado desde la consola master.
//
// Un plan no se borra nunca (empresas lo siguen referenciando): se desactiva (`activo = 0`) para que deje de
// ofrecerse en el registro público, sin romper a quien ya lo tiene asignado.

export class ErrorDePlan extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje)
    this.name = 'ErrorDePlan'
    this.estado = estado
  }
}

const CAMPOS = [
  'nombre', 'slug', 'descripcion', 'precio_mensual', 'moneda',
  'max_usuarios', 'max_clientes', 'max_ecf_mes', 'es_plan_prueba', 'dias_prueba', 'orden',
]
// Estos tienen un valor por defecto razonable (ver `crear`): no hace falta exigirlos al crear un plan.
const CAMPOS_OPCIONALES = ['descripcion', 'dias_prueba', 'moneda', 'orden', 'es_plan_prueba']

function validar(datos, { parcial = false } = {}) {
  const faltante = CAMPOS.filter((c) => !parcial && datos[c] === undefined && !CAMPOS_OPCIONALES.includes(c))
  if (faltante.length) throw new ErrorDePlan(`Faltan campos: ${faltante.join(', ')}`)
  if (datos.nombre !== undefined && !String(datos.nombre).trim()) throw new ErrorDePlan('El nombre no puede estar vacío')
  if (datos.slug !== undefined && !/^[a-z0-9-]+$/.test(datos.slug)) {
    throw new ErrorDePlan('El slug solo admite minúsculas, números y guiones')
  }
  for (const campo of ['precio_mensual', 'max_usuarios', 'max_clientes', 'max_ecf_mes']) {
    if (datos[campo] !== undefined && Number.isNaN(Number(datos[campo]))) throw new ErrorDePlan(`${campo} debe ser numérico`)
  }
}

/** Todos los planes (activos e inactivos), con cuántas empresas tiene asignadas cada uno. */
export async function listar(db) {
  const [filas] = await db.query(
    `SELECT p.*, COUNT(t.id) AS empresas_asignadas
     FROM planes p LEFT JOIN tenants t ON t.plan_id = p.id
     GROUP BY p.id ORDER BY p.orden, p.id`)
  return filas.map((p) => ({ ...p, empresas_asignadas: Number(p.empresas_asignadas) }))
}

export async function crear(db, datos) {
  validar(datos)
  const [existe] = await db.query('SELECT id FROM planes WHERE slug = ?', [datos.slug])
  if (existe.length) throw new ErrorDePlan('Ya existe un plan con ese slug', 409)

  const fila = {
    nombre: datos.nombre, slug: datos.slug, descripcion: datos.descripcion ?? null,
    precio_mensual: Number(datos.precio_mensual), moneda: datos.moneda || 'DOP',
    max_usuarios: Number(datos.max_usuarios), max_clientes: Number(datos.max_clientes), max_ecf_mes: Number(datos.max_ecf_mes),
    es_plan_prueba: datos.es_plan_prueba ? 1 : 0, dias_prueba: datos.dias_prueba ? Number(datos.dias_prueba) : null,
    orden: Number(datos.orden ?? 99), activo: 1,
  }
  const [r] = await db.query('INSERT INTO planes SET ?', [fila])
  return detalle(db, r.insertId)
}

export async function editar(db, id, datos) {
  validar(datos, { parcial: true })
  const [[existente]] = await db.query('SELECT id FROM planes WHERE id = ?', [id])
  if (!existente) throw new ErrorDePlan('Plan no encontrado', 404)
  if (datos.slug) {
    const [otro] = await db.query('SELECT id FROM planes WHERE slug = ? AND id != ?', [datos.slug, id])
    if (otro.length) throw new ErrorDePlan('Ya existe otro plan con ese slug', 409)
  }

  const cambios = {}
  for (const c of CAMPOS) if (datos[c] !== undefined) cambios[c] = datos[c]
  if (datos.es_plan_prueba !== undefined) cambios.es_plan_prueba = datos.es_plan_prueba ? 1 : 0
  if (Object.keys(cambios).length) await db.query('UPDATE planes SET ? WHERE id = ?', [cambios, id])
  return detalle(db, id)
}

export async function cambiarActivo(db, id, activo) {
  const [[existente]] = await db.query('SELECT id FROM planes WHERE id = ?', [id])
  if (!existente) throw new ErrorDePlan('Plan no encontrado', 404)
  await db.query('UPDATE planes SET activo = ? WHERE id = ?', [activo ? 1 : 0, id])
  return detalle(db, id)
}

export async function detalle(db, id) {
  const [[plan]] = await db.query('SELECT * FROM planes WHERE id = ?', [id])
  return plan || null
}
