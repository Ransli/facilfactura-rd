// Multi-tenant, PASO 2 de 2: `tenant_id` deja de tener valor por defecto.
//
// Con todas las rutas ya escopadas por empresa, cualquier INSERT que olvide el tenant_id debe FALLAR en la base de
// datos en lugar de asignar en silencio los datos a la empresa 1.

const TABLAS_DE_NEGOCIO = [
  'usuarios', 'empresas', 'clientes', 'metodos_pago', 'categorias', 'tipos_servicio', 'unidades_medida',
  'articulos', 'articulo_precios', 'nfc_secuencias', 'configuracion', 'facturas', 'factura_items',
]

export async function up(knex) {
  for (const tabla of TABLAS_DE_NEGOCIO) {
    await knex.raw(`ALTER TABLE \`${tabla}\` ALTER COLUMN tenant_id DROP DEFAULT`)
  }
}

export async function down(knex) {
  for (const tabla of TABLAS_DE_NEGOCIO) {
    await knex.raw(`ALTER TABLE \`${tabla}\` ALTER COLUMN tenant_id SET DEFAULT 1`)
  }
}
