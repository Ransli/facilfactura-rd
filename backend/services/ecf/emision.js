// Emisión de e-CF: arma el XML de una factura ya guardada, lo firma con el certificado de la empresa y lo deja en
// `ecf_emitidos` listo para que la cola lo envíe a la DGII.
//
// Todo se hace con la conexión de la transacción de la factura: si algo falla (certificado, datos del comprador, formato),
// la factura, su número y su e-NCF se deshacen juntos y no se pierde ningún correlativo.

import { construirXml } from './xml.js'
import { firmarXml, codigoSeguridad } from './firma.js'
import { ErrorDeEcf, fechaHoraRD, round2 } from './formato.js'
import { obtenerCredenciales, ErrorDeCertificado } from './certificados.js'
import { obtenerSuscripcion } from '../suscripcion/consulta.js'
import { hoyRD, diasEntre } from '../suscripcion/estado.js'
import { enTransaccion } from '../../utils/transaccion.js'
import { cupoEcf } from '../suscripcion/limites.js'

/** Un ErrorDeEcf que además marca que se alcanzó el límite del plan (la ruta responde 403). */
export class ErrorDeLimite extends ErrorDeEcf {
  constructor(mensaje) {
    super(mensaje, 403)
    this.name = 'ErrorDeLimite'
    this.limiteAlcanzado = true
  }
}

/** El certificado vigente de la empresa; si no tiene, un error que le dice qué hacer. */
export async function credencialesDeLaEmpresa(db, tenantId) {
  try {
    const credenciales = await obtenerCredenciales(db, tenantId)
    if (!credenciales) throw new ErrorDeEcf('Para emitir comprobantes electrónicos primero sube tu certificado digital en la sección e-CF')
    return credenciales
  } catch (err) {
    if (err instanceof ErrorDeCertificado) throw new ErrorDeEcf(`El certificado digital de la empresa no se puede usar: ${err.message}`)
    throw err
  }
}

/** Verifica que el plan permita otro e-CF este mes. Lanza ErrorDeLimite si no. */
export async function verificarCupoEcf(db, tenantId) {
  const suscripcion = await obtenerSuscripcion(db, tenantId)
  const cupo = await cupoEcf(db, tenantId, suscripcion.plan)
  if (!cupo.permitido) {
    throw new ErrorDeLimite(
      `Llegaste al límite de ${cupo.max} comprobantes electrónicos al mes de tu plan ${suscripcion.plan.nombre}. ` +
      'Cambia de plan para seguir emitiendo.')
  }
  return cupo
}

const aTexto = (v) => (v === null || v === undefined ? '' : String(v))

/** Ítems de la factura tal como los pide el XML. */
async function cargarItems(conn, tenantId, facturaId) {
  const [rows] = await conn.query(
    `SELECT fi.cantidad, fi.ancho, fi.alto, fi.precio_unitario, fi.subtotal, fi.descripcion_custom, a.nombre, a.tipo
     FROM factura_items fi JOIN articulos a ON a.id = fi.articulo_id
     WHERE fi.factura_id = ? AND fi.tenant_id = ? ORDER BY fi.orden, fi.id`, [facturaId, tenantId])
  return rows.map((r) => {
    const cantidad = Number(r.cantidad)
    const conArea = r.ancho && r.alto
    const partes = [aTexto(r.descripcion_custom).trim(), conArea ? `${Number(r.ancho)} x ${Number(r.alto)}` : ''].filter(Boolean)
    return {
      nombre: r.nombre,
      descripcion: partes.join(' — '),
      cantidad,
      // con medidas el precio unitario del XML es el de la línea completa por unidad, para que cantidad × precio = monto
      precioUnitario: conArea && cantidad > 0 ? round2(Number(r.subtotal) / cantidad * 10000) / 10000 : Number(r.precio_unitario),
      monto: Number(r.subtotal),
      esServicio: r.tipo === 'servicio',
    }
  })
}

/** Datos de la factura, el emisor y el comprador para armar el XML (las fechas salen como texto AAAA-MM-DD). */
async function cargarFactura(conn, tenantId, facturaId) {
  const [[f]] = await conn.query(
    `SELECT f.numero, DATE_FORMAT(f.fecha, '%Y-%m-%d') AS fecha, DATE_FORMAT(f.vencimiento, '%Y-%m-%d') AS vencimiento,
            f.ret_itbis, f.ret_isr, f.subtotal, f.itbis,
            e.nombre AS emisor_nombre, e.rnc AS emisor_rnc, e.direccion AS emisor_direccion, e.email AS emisor_correo,
            c.nombre AS comprador_nombre, c.rnc AS comprador_rnc, c.direccion AS comprador_direccion
     FROM facturas f
     JOIN empresas e ON e.id = f.empresa_id AND e.tenant_id = f.tenant_id
     JOIN clientes c ON c.id = f.cliente_id AND c.tenant_id = f.tenant_id
     WHERE f.id = ? AND f.tenant_id = ?`, [facturaId, tenantId])
  return f
}

function armarDocumento(f, items, { tipo, encf, fechaVencimientoSecuencia, tasaItbis, ahora, extra = {} }) {
  const credito = f.vencimiento && f.vencimiento > f.fecha
  return {
    tipo,
    encf,
    fechaVencimientoSecuencia,
    fechaEmision: f.fecha,
    fechaHoraFirma: fechaHoraRD(ahora),
    tipoPago: credito ? 2 : 1,
    fechaLimitePago: credito ? f.vencimiento : undefined,
    numeroFacturaInterna: f.numero,
    emisor: { rnc: f.emisor_rnc, razonSocial: f.emisor_nombre, direccion: f.emisor_direccion, correo: f.emisor_correo },
    comprador: { rnc: f.comprador_rnc, razonSocial: f.comprador_nombre, direccion: f.comprador_direccion },
    tasaItbis,
    items,
    retenciones: { itbis: Number(f.ret_itbis), isr: Number(f.ret_isr) },
    ...extra,
  }
}

/** Construye, firma y guarda el e-CF. Devuelve la fila resumida (sin el XML). */
async function guardarEcf(conn, { tenantId, facturaId, tipo, encf, documento, credenciales, referenciaId = null, ahora }) {
  const xml = firmarXml(construirXml(documento), credenciales)
  const codigo = codigoSeguridad(xml)
  const subtotal = documento.items.reduce((s, i) => s + i.monto, 0)
  const total = round2(subtotal + round2(subtotal * (documento.tasaItbis / 100)))
  const rncComprador = String(documento.comprador.rnc ?? '').replace(/\D/g, '') || null

  const [r] = await conn.query(
    `INSERT INTO ecf_emitidos
       (tenant_id, factura_id, tipo_ecf, encf, ecf_referencia_id, xml_firmado, codigo_seguridad, fecha_firma,
        rnc_emisor, rnc_comprador, fecha_emision, monto_total, tasa_itbis, estado, proximo_intento)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'generado', ?)`,
    [tenantId, facturaId, tipo, encf, referenciaId, xml, codigo, ahora,
     String(documento.emisor.rnc).replace(/\D/g, ''), rncComprador, documento.fechaEmision, total, documento.tasaItbis, new Date(ahora.getTime() - 1000)])
  return { id: r.insertId, tipo_ecf: tipo, encf, estado: 'generado', codigo_seguridad: codigo }
}

/**
 * Emite el e-CF (31 o 32) de una factura recién insertada. Llamar dentro de la transacción de la factura.
 * @param opts { tenantId, facturaId, tipo, encf, secuenciaId, tasaItbis, credenciales }
 */
export async function emitirEcf(conn, { tenantId, facturaId, tipo, encf, secuenciaId, tasaItbis, credenciales, ahora = new Date() }) {
  const f = await cargarFactura(conn, tenantId, facturaId)
  const items = await cargarItems(conn, tenantId, facturaId)
  const [[seq]] = await conn.query(
    "SELECT DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS vencimiento FROM nfc_secuencias WHERE id = ? AND tenant_id = ?", [secuenciaId, tenantId])
  const documento = armarDocumento(f, items, { tipo, encf, fechaVencimientoSecuencia: seq?.vencimiento, tasaItbis, ahora })
  return guardarEcf(conn, { tenantId, facturaId, tipo, encf, documento, credenciales, ahora })
}

const DIAS_NOTA_SIN_INDICADOR = 30         // pasado este plazo desde el original, IndicadorNotaCredito = 1
const CODIGO_ANULA_NCF = 1                 // CodigoModificacion: «anula el NCF modificado»
const ESTADOS_ANULABLES = ['aceptado', 'aceptado_condicional']

/**
 * Anula un e-CF (31 o 32) ya aceptado por la DGII emitiendo una nota de crédito electrónica (34) por el total.
 * Todo o nada: el e-NCF E34, el XML firmado, el marcado de la factura como anulada y el cupo mensual se confirman juntos.
 * @returns { id, tipo_ecf, encf, estado, codigo_seguridad }
 * @throws  ErrorDeEcf (404 no existe, 409 no anulable o ya anulado, 400 sin secuencia/certificado, 403 límite del plan)
 */
export async function emitirNotaDeCredito(pool, { tenantId, ecfId, razon, ahora = new Date() }) {
  return enTransaccion(pool, async (conn) => {
    // 1. El e-CF original, bloqueado: dos anulaciones simultáneas se turnan y la segunda ve la nota de la primera
    const [[original]] = Number.isInteger(ecfId)
      ? await conn.query("SELECT *, DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS emision_iso FROM ecf_emitidos WHERE id = ? AND tenant_id = ? FOR UPDATE", [ecfId, tenantId])
      : [[]]
    if (!original) throw new ErrorDeEcf('Comprobante electrónico no encontrado', 404)
    if (original.tipo_ecf === 34) throw new ErrorDeEcf('Una nota de crédito no se anula con otra nota de crédito', 409)
    if (!ESTADOS_ANULABLES.includes(original.estado)) {
      throw new ErrorDeEcf('Solo se puede anular un comprobante que la DGII ya aceptó. Espera su resultado o, si fue rechazado, emite uno nuevo.', 409)
    }
    const [[existente]] = await conn.query(
      "SELECT encf FROM ecf_emitidos WHERE ecf_referencia_id = ? AND tenant_id = ? AND tipo_ecf = 34", [original.id, tenantId])
    if (existente) throw new ErrorDeEcf(`Este comprobante ya tiene una nota de crédito (${existente.encf})`, 409)

    // 2. Secuencia E34 y configuración, en el mismo orden que la emisión de facturas
    const [[seq]] = await conn.query(
      "SELECT * FROM nfc_secuencias WHERE tenant_id = ? AND tipo_ncf = 'E34' AND activo = 1 LIMIT 1 FOR UPDATE", [tenantId])
    if (!seq) throw new ErrorDeEcf('No hay una secuencia NCF activa del tipo E34. Registra una en la sección NCF.')
    await conn.query('SELECT id FROM configuracion WHERE tenant_id = ? LIMIT 1 FOR UPDATE', [tenantId])
    const siguiente = Math.max(seq.ultimo_usado + 1, seq.desde)
    if (siguiente > seq.hasta) throw new ErrorDeEcf('La secuencia E34 está agotada. Registra una nueva secuencia autorizada por la DGII.')

    const credenciales = await credencialesDeLaEmpresa(conn, tenantId)
    await verificarCupoEcf(conn, tenantId)

    // 3. El XML: mismos ítems y montos que el original, emitido hoy y referenciándolo
    const encf = `E34${String(siguiente).padStart(10, '0')}`
    const f = await cargarFactura(conn, tenantId, original.factura_id)
    const items = await cargarItems(conn, tenantId, original.factura_id)
    const hoy = hoyRD(ahora)
    const documento = armarDocumento(f, items, {
      tipo: 34, encf, tasaItbis: Number(original.tasa_itbis), ahora,
      extra: {
        fechaEmision: hoy,
        tipoPago: 1, fechaLimitePago: undefined,
        indicadorNotaCredito: diasEntre(original.emision_iso, hoy) > DIAS_NOTA_SIN_INDICADOR ? 1 : 0,
        referencia: {
          ncfModificado: original.encf, fechaNcfModificado: original.emision_iso, codigoModificacion: CODIGO_ANULA_NCF,
          razonModificacion: razon ? String(razon).slice(0, 90) : undefined,
        },
      },
    })
    const nota = await guardarEcf(conn, { tenantId, facturaId: original.factura_id, tipo: 34, encf, documento, credenciales, referenciaId: original.id, ahora })

    // 4. Consumir el número y dejar la factura anulada
    await conn.query('UPDATE nfc_secuencias SET ultimo_usado = ? WHERE id = ? AND tenant_id = ?', [siguiente, seq.id, tenantId])
    await conn.query("UPDATE facturas SET estado = 'anulada', updated_at = NOW() WHERE id = ? AND tenant_id = ?", [original.factura_id, tenantId])
    return nota
  })
}

export { cargarFactura, cargarItems, armarDocumento, guardarEcf }
