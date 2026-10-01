// Realm de autenticación de la PLATAFORMA (la consola master), separado por completo de `usuarios`
// (que son del personal de cada empresa). Nadie de aquí tiene `tenant_id`: no pertenecen a ninguna empresa,
// administran todas.

export async function up(knex) {
  await knex.schema.createTable('usuarios_plataforma', (t) => {
    t.increments('id').unsigned()
    t.string('nombre', 150).notNullable()
    t.string('email', 150).notNullable().unique()
    t.string('password_hash', 255).notNullable()
    t.boolean('activo').notNullable().defaultTo(true)
    t.timestamp('ultimo_acceso').nullable()
    t.timestamps(true, true)
  })
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('usuarios_plataforma')
}
