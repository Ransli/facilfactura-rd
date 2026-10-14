// Lector del XML de un e-CF recibido de un proveedor (no firma ni envía nada: solo extrae los datos para la
// bandeja de recibidos y, si se aprueba, para precargar un gasto). Reutiliza las mismas librerías que ya usa el
// conector e-CF emisor (@xmldom/xmldom + xpath, ver backend/services/ecf/simuladorDgii.js), así que no hace falta
// agregar ninguna dependencia nueva.
//
// DÓNDE VA: backend/services/contabilidad/
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'

export class XmlEcfInvalido extends Error {}

/** Extrae los campos de un e-CF (mismo árbol de etiquetas que backend/services/ecf/xml.js) de un XML de proveedor. */
export function leerEcfRecibido(xmlTexto) {
  if (!xmlTexto || !String(xmlTexto).trim()) throw new XmlEcfInvalido('El XML está vacío')

  let doc
  try {
    doc = new DOMParser({
      // onError(level, mensaje): 'warning' se ignora (xmldom avisa hasta de cosas sin importancia); 'error' y
      // 'fatalError' sí cortan el parseo (XML mal formado).
      onError: (level, mensaje) => { if (level !== 'warning') throw new XmlEcfInvalido(`XML inválido: ${mensaje}`) },
    }).parseFromString(String(xmlTexto), 'text/xml')
  } catch (err) {
    throw err instanceof XmlEcfInvalido ? err : new XmlEcfInvalido('No se pudo leer el XML')
  }

  const valor = (ruta) => xpath.select(`string(${ruta})`, doc)
  const encf = valor('//IdDoc/eNCF')
  const rncEmisor = valor('//Emisor/RNCEmisor')
  if (!encf || !rncEmisor) throw new XmlEcfInvalido('El XML no tiene eNCF o RNCEmisor: no parece un e-CF')

  const fechaTexto = valor('//Emisor/FechaEmision') // DD-MM-AAAA, formato del conector emisor del propio sistema
  const [d, m, a] = /^\d{2}-\d{2}-\d{4}$/.test(fechaTexto) ? fechaTexto.split('-') : [null, null, null]

  return {
    encf,
    tipo_ecf: Number(valor('//IdDoc/TipoeCF')) || Number(encf.slice(1, 3)) || null,
    rnc_emisor: rncEmisor,
    razon_social_emisor: valor('//Emisor/RazonSocialEmisor') || null,
    fecha_emision: a ? `${a}-${m}-${d}` : null,
    monto_total: Number(valor('//Totales/MontoTotal')) || 0,
    total_itbis: Number(valor('//Totales/TotalITBIS')) || 0,
    codigo_seguridad: valor('//CodigoSeguridad') || null,
  }
}
