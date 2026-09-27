// Facturación electrónica: configuración por empresa y los comprobantes electrónicos emitidos.
//
// Los e-NCF salen de `nfc_secuencias` (tipos E31, E32 y E34), no hay tabla de secuencias aparte.
//
// - `ecf_configuracion`: el ambiente de la DGII de cada empresa (TesteCF pruebas, CerteCF certificación, eCF producción).
// - `ecf_emitidos`: cada e-CF con su XML firmado TAL COMO SE ENVIÓ, su estado ante la DGII y el control de reintentos.
//   Una factura tiene un e-CF 31 o 32; su nota de crédito (34) es otra fila que apunta a la primera.

export async function up(knex) {
  await knex.schema.createTable('ecf_configuracion', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.enu('ambiente', ['TesteCF', 'CerteCF', 'eCF']).notNullable().defaultTo('TesteCF')
    t.timestamps(true, true)
    t.unique(['tenant_id'], { indexName: 'uq_ecf_config_tenant' })
  })

  await knex.schema.createTable('ecf_emitidos', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.integer('factura_id').unsigned().notNullable().references('id').inTable('facturas')
    t.tinyint('tipo_ecf').unsigned().notNullable()                     // 31, 32 o 34
    t.string('encf', 13).notNullable()
    t.integer('ecf_referencia_id').unsigned().nullable().references('id').inTable('ecf_emitidos')   // en el 34: el e-CF que anula
    t.text('xml_firmado', 'mediumtext').notNullable()
    t.string('codigo_seguridad', 6).notNullable()
    t.datetime('fecha_firma').notNullable()
    t.string('rnc_emisor', 11).notNullable()
    t.string('rnc_comprador', 11).nullable()
    t.date('fecha_emision').notNullable()
    t.decimal('monto_total', 12, 2).notNullable()
    t.tinyint('tasa_itbis').unsigned().notNullable()                   // 18, 16 o 0
    t.enu('estado', ['generado', 'enviado', 'en_proceso', 'aceptado', 'aceptado_condicional', 'rechazado', 'error'])
      .notNullable().defaultTo('generado')
    t.string('track_id', 100).nullable()
    t.text('mensaje_dgii').nullable()
    t.integer('intentos').unsigned().notNullable().defaultTo(0)        // fallos seguidos de comunicación con la DGII
    t.datetime('proximo_intento').nullable()
    t.datetime('ultimo_intento').nullable()
    t.timestamps(true, true)
    t.unique(['tenant_id', 'encf'], { indexName: 'uq_ecf_tenant_encf' })
    t.unique(['factura_id', 'tipo_ecf'], { indexName: 'uq_ecf_factura_tipo' })
    t.index(['estado', 'proximo_intento'], 'idx_ecf_cola')
    t.index(['tenant_id', 'created_at'], 'idx_ecf_tenant_fecha')
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ecf_emitidos')
  await knex.schema.dropTableIfExists('ecf_configuracion')
}
