// Módulo `accounting`: categorías del 606, gastos y retenciones.
//
// DÓNDE VA: database/migrations/   (misma carpeta que las demás migraciones; `tenants` ya existe en master)
// Después de copiarla: `npm run db:migrate` y `npm run db:dump-schema` (sube las dos cosas en el mismo commit).
//
// Los códigos y campos siguen los formatos de la DGII; verifícalos contra la guía vigente antes de darlos por buenos.
//
// `es_pago_exterior`, `pais_beneficiario` y `tipo_renta_exterior` son para el formato 609 (pagos al exterior):
// un pago al exterior se registra como un gasto normal (mismo proveedor_rnc/nombre, ahora "beneficiario") marcado
// con `es_pago_exterior = true`; reutiliza `monto_servicios + monto_bienes` como monto pagado y
// `monto_retencion_renta` como ISR retenido, para no duplicar columnas de dinero.

// Tipos de bienes y servicios comprados del formato 606
const CATEGORIAS_606 = [
  ['01', 'Gastos de personal'],
  ['02', 'Gastos por trabajos, suministros y servicios'],
  ['03', 'Arrendamientos'],
  ['04', 'Gastos de activos fijos'],
  ['05', 'Gastos de representación'],
  ['06', 'Otras deducciones admitidas'],
  ['07', 'Gastos financieros'],
  ['08', 'Gastos extraordinarios'],
  ['09', 'Compras y gastos que formarán parte del costo de venta'],
  ['10', 'Adquisiciones de activos'],
  ['11', 'Gastos de seguros'],
]

export async function up(knex) {
  // Catálogo común a todas las empresas: no lleva tenant_id
  await knex.schema.createTable('categorias_606', (t) => {
    t.increments('id').unsigned()
    t.string('codigo', 2).notNullable().unique()
    t.string('nombre', 150).notNullable()
  })
  await knex('categorias_606').insert(CATEGORIAS_606.map(([codigo, nombre]) => ({ codigo, nombre })))

  await knex.schema.createTable('gastos', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.string('proveedor_rnc', 20).notNullable()
    t.string('proveedor_nombre', 200).notNullable()
    t.integer('categoria_606_id').unsigned().notNullable().references('id').inTable('categorias_606')
    t.string('ncf', 20).notNullable()
    t.string('ncf_modificado', 20).nullable()
    t.date('fecha_comprobante').notNullable()
    t.date('fecha_pago').nullable()
    t.decimal('monto_servicios', 12, 2).notNullable().defaultTo(0)
    t.decimal('monto_bienes', 12, 2).notNullable().defaultTo(0)
    t.decimal('itbis_facturado', 12, 2).notNullable().defaultTo(0)
    t.decimal('itbis_retenido', 12, 2).notNullable().defaultTo(0)
    t.decimal('itbis_llevado_al_costo', 12, 2).notNullable().defaultTo(0)
    t.decimal('itbis_por_adelantar', 12, 2).notNullable().defaultTo(0)
    t.decimal('monto_retencion_renta', 12, 2).notNullable().defaultTo(0)
    t.decimal('propina_legal', 12, 2).notNullable().defaultTo(0)
    t.tinyint('forma_pago').notNullable().defaultTo(1)                       // código de forma de pago del 606
    t.enu('origen', ['manual', 'xml', 'qr', 'ocr']).notNullable().defaultTo('manual')
    t.enu('estado', ['registrado', 'anulado']).notNullable().defaultTo('registrado')
    t.boolean('es_pago_exterior').notNullable().defaultTo(false)             // formato 609
    t.string('pais_beneficiario', 2).nullable()                             // ISO 3166-1 alfa-2, solo si es_pago_exterior
    t.string('tipo_renta_exterior', 2).nullable()                           // código de tipo de renta del 609
    t.integer('usuario_id').unsigned().nullable().references('id').inTable('usuarios')
    t.timestamps(true, true)
    // Un mismo comprobante de un proveedor no se registra dos veces en la misma empresa
    t.unique(['tenant_id', 'proveedor_rnc', 'ncf'], { indexName: 'uk_gastos_tenant_proveedor_ncf' })
    t.index(['tenant_id', 'fecha_comprobante'], 'idx_gastos_tenant_fecha')
  })

  await knex.schema.createTable('retenciones', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.integer('gasto_id').unsigned().notNullable().references('id').inTable('gastos').onDelete('CASCADE')
    t.enu('tipo', ['itbis', 'isr']).notNullable()
    t.decimal('porcentaje', 5, 2).notNullable()
    t.decimal('monto', 12, 2).notNullable()
    t.timestamps(true, true)
    t.index(['tenant_id', 'gasto_id'], 'idx_retenciones_tenant_gasto')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('retenciones')
  await knex.schema.dropTableIfExists('gastos')
  await knex.schema.dropTableIfExists('categorias_606')
}
