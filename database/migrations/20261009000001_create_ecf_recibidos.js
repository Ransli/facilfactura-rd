// Módulo `ecf-receiver`: bandeja de e-CF recibidos de proveedores (compras, no las que emite esta empresa).
//
// DÓNDE VA: database/migrations/
// Después de copiarla: `npm run db:migrate` y `npm run db:dump-schema` (sube las dos cosas en el mismo commit).
//
// `gasto_id` queda null hasta que alguien aprueba el e-CF recibido y lo usa para precargar un gasto (entonces
// apunta a `gastos.id`); así la bandeja conserva el XML original aunque el gasto se edite o se anule después.

export async function up(knex) {
  await knex.schema.createTable('ecf_recibidos', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.string('encf', 13).notNullable()
    t.tinyint('tipo_ecf').notNullable()                 // 31, 32, 33, 34, 41, 43, 44, 45, 46, 47
    t.string('rnc_emisor', 11).notNullable()
    t.string('razon_social_emisor', 200).nullable()
    t.date('fecha_emision').nullable()
    t.decimal('monto_total', 12, 2).notNullable().defaultTo(0)
    t.decimal('total_itbis', 12, 2).notNullable().defaultTo(0)
    t.string('codigo_seguridad', 6).nullable()
    t.text('xml_original').notNullable()
    t.enu('estado', ['pendiente', 'aprobado', 'rechazado']).notNullable().defaultTo('pendiente')
    t.string('motivo_rechazo', 300).nullable()
    t.integer('gasto_id').unsigned().nullable().references('id').inTable('gastos')
    t.integer('usuario_id').unsigned().nullable().references('id').inTable('usuarios')
    t.timestamps(true, true)
    // El mismo e-CF de un proveedor no se recibe dos veces en la misma empresa
    t.unique(['tenant_id', 'rnc_emisor', 'encf'], { indexName: 'uk_ecf_recibidos_tenant_emisor_encf' })
    t.index(['tenant_id', 'estado'], 'idx_ecf_recibidos_tenant_estado')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ecf_recibidos')
}
