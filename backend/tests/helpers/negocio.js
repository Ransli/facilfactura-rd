/**
 * Datos mínimos para facturar: empresa emisora, una categoría, un cliente y dos artículos
 * (uno normal a 1,000.00 y otro con dimensiones a 250.00 por m²). Todo se crea por la API,
 * como lo haría un administrador.
 */
export async function prepararNegocio(t) {
  const { token: admin } = await t.sesion('admin')

  const cfg = await t.api('PUT', '/configuracion', {
    token: admin,
    body: {
      empresa_nombre: 'Empresa de Prueba SRL', empresa_rnc: '131-00000-1',
      itbis_porcentaje: 18, ret_itbis_porcentaje: 100, ret_isr_porcentaje: 10, factura_prefijo: 'F',
    },
  })
  if (cfg.status !== 200) throw new Error('No se pudo configurar la empresa')
  const empresaId = (await t.api('GET', '/configuracion', { token: admin })).data.data.empresa_id

  const categoriaId = (await t.api('POST', '/categorias', {
    token: admin, body: { nombre: 'Desarrollo Web', tipo: 'servicio', orden: 1 },
  })).data.data.id

  const clienteId = (await t.api('POST', '/clientes', {
    token: admin, body: { nombre: 'Cliente Uno SRL', rnc: '130-88170-7', tipo: 'empresa' },
  })).data.data.id

  const articuloA = (await t.api('POST', '/articulos', {
    token: admin,
    body: { categoria_id: categoriaId, tipo: 'servicio', nombre: 'Soporte técnico', unidad_medida_id: 1,
            precios: [{ unidad_medida_id: 1, precio_unitario: 1000, es_precio_default: true }] },
  })).data.data

  const articuloB = (await t.api('POST', '/articulos', {
    token: admin,
    body: { categoria_id: categoriaId, tipo: 'producto', nombre: 'Banner (m²)', unidad_medida_id: 3, tiene_dimensiones: true,
            precios: [{ unidad_medida_id: 3, precio_unitario: 250, es_precio_default: true }] },
  })).data.data

  // Ítems listos para usar en una factura
  const itemA = (cantidad = 1, precio = 1000) =>
    ({ articulo_id: articuloA.id, cantidad, unidad_medida_id: 1, precio_unitario: precio, tipo_precio: 'unitario' })
  const itemB = (cantidad = 2, ancho = 2, alto = 1.5) =>
    ({ articulo_id: articuloB.id, cantidad, ancho, alto, unidad_medida_id: 3, precio_unitario: 250, tipo_precio: 'unitario' })

  const hoy = new Date().toISOString().slice(0, 10)
  const emitir = (items, extra = {}, token) => t.api('POST', '/facturas', {
    token, body: { cliente_id: clienteId, empresa_id: empresaId, fecha: hoy, items, ...extra },
  })

  return { admin, empresaId, categoriaId, clienteId, articuloA, articuloB, itemA, itemB, emitir }
}
