import { crearCertificadoDePrueba } from './certificados.js'

/**
 * Deja una empresa lista para emitir e-CF: su empresa emisora completa (RNC y dirección), retenciones configuradas,
 * certificado digital, secuencias E31, E32 y E34, un cliente con RNC, un consumidor sin RNC y un artículo.
 *
 *   const e = await prepararEmpresaEcf(t, 'Empresa Alfa')
 *   const r = await e.emitir('E31')                       // factura de 1,000 + ITBIS
 *   const r = await e.emitir('E32', { cliente: 'consumidor' })
 */
export async function prepararEmpresaEcf(t, nombre, { plan = 'negocio', retenciones = true } = {}) {
  const empresa = await t.crearEmpresa(nombre, { plan })
  const admin = (await t.sesionDe(empresa, 'admin')).token
  const facturador = (await t.sesionDe(empresa, 'facturador')).token
  const visor = (await t.sesionDe(empresa, 'visor')).token

  // El PUT de configuración reescribe todos los datos de la empresa: siempre se envían completos
  const configurar = (cambios = {}) => t.api('PUT', '/configuracion', {
    token: admin,
    body: {
      empresa_nombre: nombre, empresa_rnc: empresa.rnc, direccion: 'Calle Duarte 10, Santo Domingo', email: 'info@empresa.do',
      itbis_porcentaje: 18, ret_itbis_porcentaje: retenciones ? 100 : 0, ret_isr_porcentaje: retenciones ? 10 : 0, factura_prefijo: 'F',
      ...cambios,
    },
  })
  const cfg = await configurar()
  if (cfg.status !== 200) throw new Error(`No se pudo configurar la empresa: ${cfg.status}`)

  const certificado = crearCertificadoDePrueba({ nombre, rnc: empresa.rnc })
  const sub = await t.api('PUT', '/ecf/certificado', { token: admin, body: { p12_base64: certificado.p12Base64, password: certificado.password } })
  if (sub.status !== 200) throw new Error(`No se pudo subir el certificado: ${sub.status} ${sub.data?.mensaje}`)

  const secuencias = {}
  for (const tipo of ['E31', 'E32', 'E34']) {
    const r = await t.api('POST', '/nfc', { token: admin, body: { tipo_ncf: tipo, desde: 1, hasta: 500, fecha_vencimiento: '2030-12-31' } })
    if (r.status !== 201) throw new Error(`No se pudo registrar la secuencia ${tipo}: ${r.status}`)
    secuencias[tipo] = r.data.data
  }

  const cliente = (await t.api('POST', '/clientes', {
    token: admin, body: { nombre: 'Cliente Beta SRL', rnc: '101000002', direccion: 'Av. Lincoln 5', tipo: 'empresa' },
  })).data.data
  const consumidor = (await t.api('POST', '/clientes', { token: admin, body: { nombre: 'Ana Pérez', tipo: 'persona' } })).data.data
  const categoria = (await t.api('POST', '/categorias', { token: admin, body: { nombre: 'General' } })).data.data
  const unidades = (await t.api('GET', '/unidades-medida', { token: admin })).data.data
  const unidad = unidades.find((u) => u.abreviatura === 'und')
  const m2 = unidades.find((u) => u.abreviatura === 'm²') || unidad
  const servicio = (await t.api('POST', '/articulos', {
    token: admin, body: { categoria_id: categoria.id, tipo: 'servicio', nombre: 'Soporte técnico', unidad_medida_id: unidad.id,
                          precios: [{ unidad_medida_id: unidad.id, precio_unitario: 1000 }] },
  })).data.data
  const producto = (await t.api('POST', '/articulos', {
    token: admin, body: { categoria_id: categoria.id, tipo: 'producto', nombre: 'Lona impresa', unidad_medida_id: m2.id, tiene_dimensiones: true,
                          precios: [{ unidad_medida_id: m2.id, precio_unitario: 250 }] },
  })).data.data

  const clientes = { cliente, consumidor }
  const itemServicio = (cantidad = 1, precio = 1000) =>
    ({ articulo_id: servicio.id, cantidad, unidad_medida_id: unidad.id, precio_unitario: precio })
  const itemConDimensiones = (cantidad = 2, ancho = 2, alto = 1.5) =>
    ({ articulo_id: producto.id, cantidad, ancho, alto, unidad_medida_id: m2.id, precio_unitario: 250 })

  /** Emite una factura del tipo indicado (E31, E32 o B01…) con `token` (por defecto el facturador). */
  const emitir = (tipo, { cliente: quien = 'cliente', items, token = facturador, ...extra } = {}) => t.api('POST', '/facturas', {
    token,
    body: {
      cliente_id: clientes[quien].id, empresa_id: empresa.empresaId, fecha: '2026-09-27', tipo_ncf: tipo,
      items: items || [itemServicio()], ...extra,
    },
  })

  return { ...empresa, admin, facturador, visor, configurar, certificado, secuencias, clientes, servicio, producto, unidad, itemServicio, itemConDimensiones, emitir }
}

/** Cuánto han avanzado los contadores de la empresa: sirve para comprobar que un rechazo no consumió números. */
export async function contadores(t, tenantId) {
  const [[cfg]] = await t.pool.query('SELECT factura_ultimo_numero AS facturas FROM configuracion WHERE tenant_id = ?', [tenantId])
  const [seqs] = await t.pool.query('SELECT tipo_ncf, ultimo_usado FROM nfc_secuencias WHERE tenant_id = ? AND activo = 1 ORDER BY tipo_ncf', [tenantId])
  const [[fila]] = await t.pool.query('SELECT COUNT(*) AS n FROM facturas WHERE tenant_id = ?', [tenantId])
  const [[ecf]] = await t.pool.query('SELECT COUNT(*) AS n FROM ecf_emitidos WHERE tenant_id = ?', [tenantId])
  return { facturas: cfg.facturas, filasFactura: fila.n, filasEcf: ecf.n, secuencias: Object.fromEntries(seqs.map((s) => [s.tipo_ncf, s.ultimo_usado])) }
}
