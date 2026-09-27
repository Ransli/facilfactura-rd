import { UNIDADES_MEDIDA, TIPOS_SERVICIO } from './datosIniciales.js'

/**
 * Deja lista una empresa recién creada: su empresa emisora, su fila de configuración y los catálogos por
 * defecto (unidades de medida y tipos de servicio). Es idempotente por empresa solo si se llama una vez:
 * quien la invoque debe hacerlo dentro de su transacción y con `conn` (una conexión del pool).
 *
 * @param conn    conexión mysql2 (dentro de una transacción)
 * @param tenant  { id, nombre, rnc, email?, telefono?, direccion? }
 * @returns       { empresaId }
 */
export async function aprovisionarEmpresa(conn, tenant) {
  const [empresa] = await conn.query(
    `INSERT INTO empresas (tenant_id, nombre, rnc, email, telefono, direccion)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [tenant.id, tenant.nombre, tenant.rnc, tenant.email || null, tenant.telefono || null, tenant.direccion || null]
  )

  await conn.query('INSERT INTO configuracion (tenant_id, empresa_id) VALUES (?, ?)', [tenant.id, empresa.insertId])

  for (const [nombre, abreviatura] of UNIDADES_MEDIDA) {
    await conn.query('INSERT INTO unidades_medida (tenant_id, nombre, abreviatura) VALUES (?, ?, ?)',
      [tenant.id, nombre, abreviatura])
  }
  for (const [nombre, descripcion] of TIPOS_SERVICIO) {
    await conn.query('INSERT INTO tipos_servicio (tenant_id, nombre, descripcion) VALUES (?, ?, ?)',
      [tenant.id, nombre, descripcion])
  }

  return { empresaId: empresa.insertId }
}
