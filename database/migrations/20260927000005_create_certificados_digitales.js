// Certificado digital tributario de cada empresa (uno por empresa), para firmar los e-CF.
//
// El archivo .p12 y su contraseña se guardan CIFRADOS (AES-256-GCM, ver services/ecf/cifrado.js); las demás columnas son
// metadatos públicos para mostrar en pantalla (titular, vigencia) sin descifrar nada.

export async function up(knex) {
  await knex.schema.createTable('certificados_digitales', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.text('p12_cifrado', 'mediumtext').notNullable()
    t.text('password_cifrada').notNullable()
    t.string('titular', 255).notNullable()
    t.string('emisor', 255).notNullable()
    t.string('serie', 100).notNullable()
    t.string('huella', 64).notNullable()
    t.datetime('valido_desde').notNullable()
    t.datetime('valido_hasta').notNullable()
    t.integer('subido_por').unsigned().nullable()       // id del usuario que lo subió
    t.timestamps(true, true)
    t.unique(['tenant_id'], { indexName: 'uq_certificados_tenant' })
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('certificados_digitales')
}
