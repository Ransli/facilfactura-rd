// Representación impresa del e-CF: una página HTML lista para imprimir o guardar como PDF, con el e-NCF, los datos de las
// partes, el detalle, los totales, el estado ante la DGII y —abajo a la izquierda— el código QR con el código de seguridad,
// como pide la DGII.

import QRCode from 'qrcode'
import { cargarItems } from './emision.js'
import { ErrorDeEcf, fechaDgii, escapar } from './formato.js'

const RUTA_AMBIENTE = { TesteCF: 'testecf', CerteCF: 'certecf', eCF: 'ecf' }
const URL_CONSULTA = 'https://ecf.dgii.gov.do'
const LIMITE_CONSUMO_COMPLETO = 250000

const TITULOS = { 31: 'Factura de Crédito Fiscal Electrónica', 32: 'Factura de Consumo Electrónica', 34: 'Nota de Crédito Electrónica' }

const ESTADOS = {
  generado:             ['Pendiente de envío a la DGII', 'pendiente'],
  enviado:              ['Enviado a la DGII, esperando resultado', 'pendiente'],
  en_proceso:           ['En proceso en la DGII', 'pendiente'],
  aceptado:             ['Aceptado por la DGII', 'ok'],
  aceptado_condicional: ['Aceptado condicionalmente por la DGII', 'aviso'],
  rechazado:            ['Rechazado por la DGII', 'error'],
  error:                ['No se pudo enviar a la DGII', 'error'],
}

const dinero = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Dirección que codifica el código QR. Para el e-CF 32 de menos de RD$ 250,000 la DGII usa una consulta más corta
 * (sin comprador ni fechas); en los demás casos, la consulta de timbre completa.
 * @param ecf  fila de ecf_emitidos (con fecha_emision como AAAA-MM-DD y fecha_firma como dd-MM-AAAA HH:mm:ss)
 */
export function urlDelQr(ecf, ambiente = 'TesteCF') {
  const base = `${URL_CONSULTA}/${RUTA_AMBIENTE[ambiente] || 'testecf'}`
  const monto = Number(ecf.monto_total).toFixed(2)
  const consumoCorto = Number(ecf.tipo_ecf) === 32 && Number(ecf.monto_total) < LIMITE_CONSUMO_COMPLETO
  const datos = consumoCorto
    ? [['RncEmisor', ecf.rnc_emisor], ['ENCF', ecf.encf], ['MontoTotal', monto], ['CodigoSeguridad', ecf.codigo_seguridad]]
    : [['RncEmisor', ecf.rnc_emisor], ['RncComprador', ecf.rnc_comprador ?? ''], ['ENCF', ecf.encf],
       ['FechaEmision', fechaDgii(ecf.fecha_emision)], ['MontoTotal', monto], ['FechaFirma', ecf.fecha_firma], ['CodigoSeguridad', ecf.codigo_seguridad]]
  const consulta = new URLSearchParams(datos).toString().replace(/\+/g, '%20')
  return `${base}/${consumoCorto ? 'ConsultaTimbreFC' : 'ConsultaTimbre'}?${consulta}`
}

async function cargarDatos(db, tenantId, ecfId) {
  const [[e]] = await db.query(
    `SELECT id, factura_id, tipo_ecf, encf, ecf_referencia_id, estado, mensaje_dgii, codigo_seguridad, fecha_firma,
            rnc_emisor, rnc_comprador, DATE_FORMAT(fecha_emision, '%Y-%m-%d') AS fecha_emision, monto_total, tasa_itbis,
            REGEXP_SUBSTR(xml_firmado, '<FechaVencimientoSecuencia>[^<]+') AS vencimiento_secuencia,
            REGEXP_SUBSTR(xml_firmado, '<FechaHoraFirma>[^<]+') AS hora_firma
     FROM ecf_emitidos WHERE id = ? AND tenant_id = ?`, [ecfId, tenantId])
  if (!e) return null
  const [[f]] = await db.query(
    `SELECT f.numero, f.subtotal, f.itbis, f.ret_itbis, f.ret_isr, f.total,
            em.nombre AS emisor_nombre, em.direccion AS emisor_direccion, em.telefono AS emisor_telefono, em.email AS emisor_correo,
            c.nombre AS comprador_nombre, c.direccion AS comprador_direccion
     FROM facturas f JOIN empresas em ON em.id = f.empresa_id JOIN clientes c ON c.id = f.cliente_id
     WHERE f.id = ? AND f.tenant_id = ?`, [e.factura_id, tenantId])
  const [[cfg]] = await db.query('SELECT ambiente FROM ecf_configuracion WHERE tenant_id = ?', [tenantId])
  let referencia = null
  if (e.ecf_referencia_id) {
    ;[[referencia]] = await db.query('SELECT encf FROM ecf_emitidos WHERE id = ? AND tenant_id = ?', [e.ecf_referencia_id, tenantId])
  }
  return { e, f, ambiente: cfg?.ambiente || 'TesteCF', items: await cargarItems(db, tenantId, e.factura_id), referencia }
}

const fila = (etiqueta, valor) => (valor ? `<div><span>${escapar(etiqueta)}</span> ${escapar(valor)}</div>` : '')

const ESTILOS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font: 13px/1.45 system-ui, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 24px; }
  main { max-width: 800px; margin: 0 auto; }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0; text-align: right; }
  .encf { font-size: 17px; font-weight: 700; letter-spacing: .5px; text-align: right; }
  .meta span { color: #555; }
  section { margin-top: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f3f3f3; font-size: 12px; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .totales { margin-left: auto; width: 320px; }
  .totales td { border: 0; padding: 3px 8px; }
  .totales tr.total td { border-top: 2px solid #1a1a1a; font-weight: 700; font-size: 14px; }
  .estado { display: inline-block; padding: 3px 10px; border-radius: 12px; font-weight: 600; border: 1px solid; }
  .estado.ok { color: #0a6b2f; border-color: #0a6b2f; background: #e8f6ed; }
  .estado.aviso { color: #8a5a00; border-color: #8a5a00; background: #fff5e0; }
  .estado.error { color: #a01818; border-color: #a01818; background: #fdeaea; }
  .estado.pendiente { color: #444; border-color: #999; background: #f3f3f3; }
  .timbre { display: flex; align-items: center; gap: 16px; margin-top: 28px; padding-top: 12px; border-top: 1px solid #ddd; }
  .timbre img { width: 140px; height: 140px; image-rendering: pixelated; }
  .timbre .codigo { font-size: 14px; }
  .timbre .codigo strong { font-family: ui-monospace, Consolas, monospace; font-size: 18px; letter-spacing: 2px; }
  footer { margin-top: 20px; color: #666; font-size: 11px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
`

/**
 * Página HTML de la representación impresa de un e-CF de la empresa.
 * @throws ErrorDeEcf (404) si el e-CF no existe o es de otra empresa
 */
export async function representacionImpresa(db, tenantId, ecfId) {
  const datos = Number.isInteger(ecfId) ? await cargarDatos(db, tenantId, ecfId) : null
  if (!datos) throw new ErrorDeEcf('Comprobante electrónico no encontrado', 404)
  const { e, f, ambiente, items, referencia } = datos

  const tipo = Number(e.tipo_ecf)
  const [textoEstado, claseEstado] = ESTADOS[e.estado] || [e.estado, 'pendiente']
  // La fecha de la firma se toma del propio XML, para que el QR y la página digan exactamente lo mismo que el documento firmado
  const fechaFirma = e.hora_firma.replace('<FechaHoraFirma>', '')
  const url = urlDelQr({ ...e, fecha_firma: fechaFirma }, ambiente)
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 280 })

  const vencimiento = e.vencimiento_secuencia?.replace('<FechaVencimientoSecuencia>', '')
  const retenciones = tipo !== 32 && (Number(f.ret_itbis) > 0 || Number(f.ret_isr) > 0)
  const lineas = items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapar(it.nombre)}${it.descripcion ? `<br><small>${escapar(it.descripcion)}</small>` : ''}</td>
        <td class="num">${escapar(Number(it.cantidad).toLocaleString('en-US', { maximumFractionDigits: 4 }))}</td>
        <td class="num">${dinero(it.precioUnitario)}</td>
        <td class="num">${dinero(it.monto)}</td>
      </tr>`).join('')

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(TITULOS[tipo])} ${escapar(e.encf)}</title>
<style>${ESTILOS}</style>
</head>
<body>
<main>
  <header>
    <div class="meta">
      <h1>${escapar(f.emisor_nombre)}</h1>
      ${fila('RNC', e.rnc_emisor)}
      ${fila('Dirección', f.emisor_direccion)}
      ${fila('Teléfono', f.emisor_telefono)}
      ${fila('Correo', f.emisor_correo)}
    </div>
    <div>
      <h2>${escapar(TITULOS[tipo])}</h2>
      <div class="encf">e-NCF: ${escapar(e.encf)}</div>
      <div class="meta">
        ${fila('Fecha de emisión:', fechaDgii(e.fecha_emision))}
        ${tipo === 31 && vencimiento ? fila('Vencimiento de la secuencia:', vencimiento) : ''}
        ${fila('Factura interna:', f.numero)}
      </div>
    </div>
  </header>

  <section class="meta">
    ${fila('Cliente:', f.comprador_nombre)}
    ${fila(tipo === 32 ? 'RNC / Cédula:' : 'RNC / Cédula del comprador:', e.rnc_comprador)}
    ${fila('Dirección:', f.comprador_direccion)}
    ${tipo === 34 && referencia ? fila('Modifica el e-NCF:', referencia.encf) : ''}
  </section>

  <section>
    <table>
      <thead><tr><th>#</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Monto</th></tr></thead>
      <tbody>${lineas}</tbody>
    </table>
  </section>

  <section>
    <table class="totales">
      <tr><td>Subtotal</td><td class="num">${dinero(f.subtotal)}</td></tr>
      <tr><td>ITBIS (${Number(e.tasa_itbis)}%)</td><td class="num">${dinero(f.itbis)}</td></tr>
      <tr class="total"><td>Monto total</td><td class="num">${dinero(e.monto_total)}</td></tr>
      ${retenciones ? `<tr><td>Retención de ITBIS</td><td class="num">− ${dinero(f.ret_itbis)}</td></tr>
      <tr><td>Retención de ISR</td><td class="num">− ${dinero(f.ret_isr)}</td></tr>
      <tr class="total"><td>Valor a pagar</td><td class="num">${dinero(f.total)}</td></tr>` : ''}
    </table>
  </section>

  <section>
    <span class="estado ${claseEstado}">${escapar(textoEstado)}</span>
    ${e.mensaje_dgii ? `<div class="meta"><span>Mensaje de la DGII:</span> ${escapar(e.mensaje_dgii)}</div>` : ''}
  </section>

  <div class="timbre">
    <img class="qr" src="${qr}" alt="Código QR del comprobante" data-url="${escapar(url)}">
    <div class="codigo">
      <div>Código de seguridad: <strong>${escapar(e.codigo_seguridad)}</strong></div>
      <div class="meta"><span>Fecha de firma digital:</span> ${escapar(fechaFirma)}</div>
      <div class="meta"><span>Ambiente:</span> ${escapar(ambiente)}</div>
    </div>
  </div>

  <footer>Representación impresa de un comprobante fiscal electrónico. Verifica su autenticidad escaneando el código QR.</footer>
</main>
</body>
</html>`
}
