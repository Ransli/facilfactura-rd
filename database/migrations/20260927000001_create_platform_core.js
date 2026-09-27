// Núcleo de la plataforma multi-tenant: catálogo de planes y empresas (tenants).
//
// - `planes`: lo que se vende. Los límites usan -1 para «ilimitado» (igual que FinanceCore).
// - `tenants`: una fila por empresa cliente. La empresa que ya existía en la v1 se convierte en el tenant 1
//   (exenta de pago), y a ella se asignan los datos migrados en la siguiente migración.
//
// PRECIOS Y LÍMITES: la propuesta de la Unidad II define que los planes se estructuran por volumen de e-CF al mes,
// pero no fija montos. Los valores de abajo son de EJEMPLO y se editan desde la consola master.

const PLANES = [
  {
    nombre: 'Prueba gratuita', slug: 'prueba', descripcion: 'Para conocer el sistema sin costo ni tarjeta.',
    precio_mensual: 0, max_usuarios: 2, max_clientes: 25, max_ecf_mes: 10, es_plan_prueba: 1, dias_prueba: 30, orden: 1,
  },
  {
    nombre: 'Emprendedor', slug: 'emprendedor', descripcion: 'Negocios pequeños con poco volumen de facturas.',
    precio_mensual: 990, max_usuarios: 2, max_clientes: 100, max_ecf_mes: 50, es_plan_prueba: 0, dias_prueba: null, orden: 2,
  },
  {
    nombre: 'Negocio', slug: 'negocio', descripcion: 'Pymes con varios usuarios y facturación frecuente.',
    precio_mensual: 2490, max_usuarios: 5, max_clientes: 500, max_ecf_mes: 300, es_plan_prueba: 0, dias_prueba: null, orden: 3,
  },
  {
    nombre: 'Empresarial', slug: 'empresarial', descripcion: 'Alto volumen, clientes ilimitados y más usuarios.',
    precio_mensual: 5990, max_usuarios: 15, max_clientes: -1, max_ecf_mes: 1500, es_plan_prueba: 0, dias_prueba: null, orden: 4,
  },
]

export async function up(knex) {
  await knex.schema.createTable('planes', (t) => {
    t.increments('id').unsigned()
    t.string('nombre', 100).notNullable()
    t.string('slug', 50).notNullable().unique()
    t.string('descripcion', 255).nullable()
    t.decimal('precio_mensual', 10, 2).notNullable().defaultTo(0)
    t.string('moneda', 10).notNullable().defaultTo('DOP')
    t.integer('max_usuarios').notNullable()      // -1 = ilimitado
    t.integer('max_clientes').notNullable()
    t.integer('max_ecf_mes').notNullable()
    t.boolean('es_plan_prueba').notNullable().defaultTo(false)
    t.integer('dias_prueba').nullable()
    t.boolean('activo').notNullable().defaultTo(true)
    t.integer('orden').notNullable().defaultTo(1)
    t.timestamps(true, true)
  })
  await knex('planes').insert(PLANES)

  await knex.schema.createTable('tenants', (t) => {
    t.increments('id').unsigned()
    t.string('nombre', 200).notNullable()
    t.string('slug', 100).notNullable().unique()
    t.string('rnc', 20).notNullable().unique()
    t.string('email', 150).nullable()
    t.string('telefono', 20).nullable()
    t.text('direccion').nullable()
    t.string('logo_path', 500).nullable()
    t.integer('plan_id').unsigned().notNullable().references('id').inTable('planes')
    t.enu('estado', ['activo', 'prueba', 'suspendido', 'cancelado', 'pendiente_pago', 'pendiente', 'exento'])
      .notNullable().defaultTo('pendiente')
    t.date('fecha_fin_prueba').nullable()
    t.string('ip_registro', 45).nullable()
    t.timestamps(true, true)
    t.index(['estado'], 'idx_tenants_estado')
  })

  // Tenant 1 = la empresa de la v1 (si la base ya la tiene); si no, una empresa inicial de marcador de posición.
  const [empresa] = await knex('empresas').orderBy('id').limit(1)
  const [plan] = await knex('planes').where({ slug: 'empresarial' })
  await knex('tenants').insert({
    id: 1,
    nombre: empresa?.nombre ?? 'Empresa inicial',
    slug: 'empresa-inicial',
    rnc: (empresa?.rnc ?? '000000000').replace(/\D/g, '') || '000000000',
    email: empresa?.email ?? null,
    telefono: empresa?.telefono ?? null,
    direccion: empresa?.direccion ?? null,
    logo_path: empresa?.logo_path ?? null,
    plan_id: plan.id,
    estado: 'exento',
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('tenants')
  await knex.schema.dropTableIfExists('planes')
}
