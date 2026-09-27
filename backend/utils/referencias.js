// Referencias entre registros: mensajes claros cuando algo no existe y verificación de que pertenezca a la empresa.

const MENSAJES = {
  articulo_id:      'El artículo indicado no existe',
  cliente_id:       'El cliente indicado no existe',
  empresa_id:       'La empresa indicada no existe',
  unidad_medida_id: 'La unidad de medida indicada no existe',
  tipo_servicio_id: 'El tipo de servicio indicado no existe',
  categoria_id:     'La categoría indicada no existe',
  rol_id:           'El rol indicado no existe',
}

// Tabla a la que apunta cada columna de referencia de una empresa (los roles son globales y no están aquí)
const TABLAS = {
  articulo_id:      'articulos',
  cliente_id:       'clientes',
  empresa_id:       'empresas',
  unidad_medida_id: 'unidades_medida',
  tipo_servicio_id: 'tipos_servicio',
  categoria_id:     'categorias',
}

export function esReferenciaInexistente(err) {
  return err?.code === 'ER_NO_REFERENCED_ROW_2'
}

export function mensajeReferencia(err) {
  const columna = /FOREIGN KEY \(`(\w+)`\)/.exec(err?.sqlMessage || '')?.[1]
  return MENSAJES[columna] || 'Un registro relacionado indicado no existe'
}

/**
 * Comprueba que cada referencia exista DENTRO de la empresa. Una clave foránea no basta en un sistema multi-empresa:
 * el id de un registro de otra empresa existe en la tabla, pero para esta empresa «no existe».
 *
 * @param db          pool o conexión de mysql2
 * @param tenantId    empresa del usuario (req.tenant_id)
 * @param referencias [{ columna: 'categoria_id', id: 5 }, ...]  (los ids nulos o indefinidos se ignoran)
 * @returns           el mensaje de la primera referencia que no existe, o null si todas son válidas
 */
export async function primeraReferenciaAjena(db, tenantId, referencias) {
  for (const { columna, id } of referencias) {
    if (id === undefined || id === null || id === '') continue
    const tabla = TABLAS[columna]
    if (!tabla) throw new Error(`Columna de referencia desconocida: ${columna}`)
    const [rows] = await db.query(`SELECT id FROM \`${tabla}\` WHERE id = ? AND tenant_id = ?`, [id, tenantId])
    if (!rows[0]) return MENSAJES[columna]
  }
  return null
}
