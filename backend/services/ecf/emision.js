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
     String(documento.emisor.rnc).replace(/\D/g, ''), rncComprador, documento.fechaEmision, total, documento.tasaItbis, ahora])
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

export { cargarFactura, cargarItems, armarDocumento, guardarEcf }
