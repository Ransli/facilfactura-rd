// Multi-tenant: cada tabla de negocio pertenece a una empresa (tenant).
//
// PASO 1 de 2. La columna nace `NOT NULL DEFAULT 1`: MariaDB rellena con 1 todas las filas existentes (la empresa
// migrada de la v1 es el tenant 1) y el sistema sigue funcionando mientras las rutas se van escopando por empresa.
// El PASO 2 (migración posterior) quita el DEFAULT para que un INSERT sin tenant_id falle en la base de datos.
//
// Los índices únicos que eran globales pasan a ser únicos POR EMPRESA (número de factura, código de artículo y RNC de
// la empresa emisora). El correo de un usuario sigue siendo único en toda la plataforma: el inicio de sesión es por correo.
//
// `roles` queda fuera: es un catálogo global.

const TABLAS_DE_NEGOCIO = [
  'usuarios', 'empresas', 'clientes', 'metodos_pago', 'categorias', 'tipos_servicio', 'unidades_medida',
  'articulos', 'articulo_precios', 'nfc_secuencias', 'configuracion', 'facturas', 'factura_items',
]

export async function up(knex) {
  for (const tabla of TABLAS_DE_NEGOCIO) {
    await knex.schema.alterTable(tabla, (t) => {
      t.integer('tenant_id').unsigned().notNullable().defaultTo(1)
    })
    await knex.schema.alterTable(tabla, (t) => {
      t.foreign('tenant_id', `fk_${tabla}_tenant`).references('id').inTable('tenants')
    })
  }

  // Únicos globales → únicos por empresa
  await knex.raw('ALTER TABLE facturas DROP INDEX numero')
  await knex.raw('ALTER TABLE facturas ADD UNIQUE KEY uk_facturas_tenant_numero (tenant_id, numero)')
  await knex.raw('ALTER TABLE articulos DROP INDEX codigo')
  await knex.raw('ALTER TABLE articulos ADD UNIQUE KEY uk_articulos_tenant_codigo (tenant_id, codigo)')
  await knex.raw('ALTER TABLE empresas DROP INDEX rnc')
  await knex.raw('ALTER TABLE empresas ADD UNIQUE KEY uk_empresas_tenant_rnc (tenant_id, rnc)')

  // Una fila de configuración por empresa
  await knex.raw('ALTER TABLE configuracion ADD UNIQUE KEY uk_configuracion_tenant (tenant_id)')
}

export async function down(knex) {
  await knex.raw('ALTER TABLE configuracion DROP INDEX uk_configuracion_tenant')
  await knex.raw('ALTER TABLE empresas DROP INDEX uk_empresas_tenant_rnc')
  await knex.raw('ALTER TABLE empresas ADD UNIQUE KEY rnc (rnc)')
  await knex.raw('ALTER TABLE articulos DROP INDEX uk_articulos_tenant_codigo')
  await knex.raw('ALTER TABLE articulos ADD UNIQUE KEY codigo (codigo)')
  await knex.raw('ALTER TABLE facturas DROP INDEX uk_facturas_tenant_numero')
  await knex.raw('ALTER TABLE facturas ADD UNIQUE KEY numero (numero)')

  for (const tabla of [...TABLAS_DE_NEGOCIO].reverse()) {
    await knex.schema.alterTable(tabla, (t) => {
      t.dropForeign('tenant_id', `fk_${tabla}_tenant`)
    })
    await knex.schema.alterTable(tabla, (t) => {
      t.dropColumn('tenant_id')
    })
  }
}
