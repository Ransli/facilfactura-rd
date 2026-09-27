// Traduce el error de clave foránea de MySQL (registro relacionado inexistente) a un mensaje
// claro para el cliente de la API, en lugar de un 500 «Error del servidor».

const MENSAJES = {
  articulo_id:      'El artículo indicado no existe',
  cliente_id:       'El cliente indicado no existe',
  empresa_id:       'La empresa indicada no existe',
  unidad_medida_id: 'La unidad de medida indicada no existe',
  tipo_servicio_id: 'El tipo de servicio indicado no existe',
  categoria_id:     'La categoría indicada no existe',
  rol_id:           'El rol indicado no existe',
}

export function esReferenciaInexistente(err) {
  return err?.code === 'ER_NO_REFERENCED_ROW_2'
}

export function mensajeReferencia(err) {
  const columna = /FOREIGN KEY \(`(\w+)`\)/.exec(err?.sqlMessage || '')?.[1]
  return MENSAJES[columna] || 'Un registro relacionado indicado no existe'
}
