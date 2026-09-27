// Cliente de los servicios de la DGII para facturación electrónica: autenticación (semilla firmada → token), recepción
// de e-CF (→ TrackID) y consulta de resultado.
//
// IMPORTANTE: las rutas y los formatos de respuesta siguen lo publicado por la DGII en su «Descripción Técnica de
// Servicios», pero deben VERIFICARSE contra la versión vigente antes de certificar. Se pueden ajustar con la variable de
// entorno DGII_URL_BASE (por defecto https://ecf.dgii.gov.do) sin tocar el código.
//
// Errores: `ErrorDeDgii` con `transitorio: true` cuando conviene reintentar más tarde (sin conexión, demora, 5xx, 429) y
// `transitorio: false` cuando la DGII rechazó el envío en sí (XML inválido, firma mala, e-NCF repetido).

import { firmarXml } from './firma.js'

const URL_BASE_POR_OMISION = 'https://ecf.dgii.gov.do'
const AMBIENTES = { TesteCF: 'testecf', CerteCF: 'certecf', eCF: 'ecf' }
const MARGEN_TOKEN_MS = 60 * 1000
const TIEMPO_MAXIMO_MS = 20 * 1000

export class ErrorDeDgii extends Error {
  constructor(mensaje, { transitorio = false, estadoHttp = null, mensajes = [] } = {}) {
    super(mensaje)
    this.name = 'ErrorDeDgii'
    this.transitorio = transitorio
    this.estadoHttp = estadoHttp
    this.mensajes = mensajes
  }
}

const ESTADOS_POR_CODIGO = { 1: 'aceptado', 2: 'rechazado', 3: 'en_proceso', 4: 'aceptado_condicional' }
const ESTADOS_POR_TEXTO = { aceptado: 'aceptado', rechazado: 'rechazado', 'en proceso': 'en_proceso', 'aceptado condicional': 'aceptado_condicional' }

/** Los mensajes de la DGII llegan como texto, lista de textos o lista de { valor, codigo }: siempre se devuelven como textos. */
function listaDeMensajes(mensajes) {
  if (!mensajes) return []
  return [].concat(mensajes).map((m) => (typeof m === 'string' ? m : m?.valor)).filter(Boolean)
}

/**
 * @param opts { ambiente, credenciales: {clavePem, certificadoPem}, baseUrl?, timeoutMs?, fetch? }
 */
export function crearClienteDgii({ ambiente = 'TesteCF', credenciales, baseUrl, timeoutMs = TIEMPO_MAXIMO_MS, fetch: peticion = globalThis.fetch } = {}) {
  const segmento = AMBIENTES[ambiente]
  if (!segmento) throw new Error(`Ambiente de la DGII desconocido: ${ambiente} (use TesteCF, CerteCF o eCF)`)
  const base = `${(baseUrl || process.env.DGII_URL_BASE || URL_BASE_POR_OMISION).replace(/\/+$/, '')}/${segmento}`

  let token = null
  let expira = 0

  async function llamar(metodo, ruta, { cuerpo, cabeceras } = {}) {
    let res
    try {
      res = await peticion(`${base}${ruta}`, { method: metodo, body: cuerpo, headers: cabeceras, signal: AbortSignal.timeout(timeoutMs) })
    } catch (err) {
      const demora = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      throw new ErrorDeDgii(
        demora ? `La DGII tardó más de ${Math.round(timeoutMs / 1000)} s en responder` : `No se pudo conectar con la DGII: ${err?.cause?.code || err?.message}`,
        { transitorio: true })
    }
    return res
  }

  async function autenticar() {
    const respuestaSemilla = await llamar('GET', '/autenticacion/api/autenticacion/semilla')
    if (!respuestaSemilla.ok) throw errorDeRespuesta(respuestaSemilla, await respuestaSemilla.text(), 'La DGII no entregó la semilla')
    const semilla = await respuestaSemilla.text()

    const firmada = firmarXml(semilla, credenciales)
    const form = new FormData()
    form.append('xml', new Blob([firmada], { type: 'text/xml' }), 'semilla.xml')
    const res = await llamar('POST', '/autenticacion/api/autenticacion/validacioncertificado', { cuerpo: form })
    const texto = await res.text()
    if (!res.ok) throw errorDeRespuesta(res, texto, 'La DGII no aceptó el certificado')

    const datos = JSON.parse(texto)
    if (!datos.token) throw new ErrorDeDgii('La DGII no devolvió un token', { transitorio: true, estadoHttp: res.status })
    token = datos.token
    expira = datos.expira ? Date.parse(datos.expira) : Date.now() + 50 * 60 * 1000
  }

  async function asegurarToken() {
    if (!token || Date.now() >= expira - MARGEN_TOKEN_MS) await autenticar()
  }

  /** Llama con token; si la DGII responde 401 renueva el token y reintenta UNA vez. */
  async function conToken(metodo, ruta, opciones = {}) {
    await asegurarToken()
    const intentar = () => llamar(metodo, ruta, { ...opciones, cabeceras: { ...opciones.cabeceras, Authorization: `Bearer ${token}` } })
    let res = await intentar()
    if (res.status === 401) {
      token = null
      await asegurarToken()
      res = await intentar()
    }
    return res
  }

  function errorDeRespuesta(res, texto, porOmision) {
    let mensajes = []
    let detalle = porOmision
    try {
      const j = JSON.parse(texto)
      mensajes = listaDeMensajes(j.mensaje ?? j.mensajes ?? j.error)
      if (mensajes.length) detalle = mensajes.join('; ')
    } catch { /* la respuesta no era JSON */ }
    const transitorio = res.status >= 500 || res.status === 429 || res.status === 408
    return new ErrorDeDgii(transitorio ? `La DGII respondió ${res.status}: ${detalle}` : detalle, { transitorio, estadoHttp: res.status, mensajes })
  }

  return {
    /** Envía el e-CF firmado. @returns { trackId } */
    async enviarEcf(xmlFirmado, nombreArchivo) {
      const form = new FormData()
      form.append('xml', new Blob([xmlFirmado], { type: 'text/xml' }), nombreArchivo)
      const res = await conToken('POST', '/recepcion/api/facturaselectronicas', { cuerpo: form })
      const texto = await res.text()
      if (!res.ok) throw errorDeRespuesta(res, texto, 'La DGII rechazó el envío')
      let datos
      try { datos = JSON.parse(texto) } catch { throw new ErrorDeDgii('La DGII respondió algo que no se entiende', { transitorio: true, estadoHttp: res.status }) }
      if (!datos.trackId) throw new ErrorDeDgii(listaDeMensajes(datos.mensaje).join('; ') || 'La DGII no devolvió TrackID', { transitorio: false, estadoHttp: res.status })
      return { trackId: datos.trackId }
    },

    /** Estado de un envío. @returns { estado: 'aceptado'|'aceptado_condicional'|'rechazado'|'en_proceso', mensajes: string[] } */
    async consultarEstado(trackId) {
      const res = await conToken('GET', `/consultaresultado/api/consultas/estado?trackid=${encodeURIComponent(trackId)}`)
      const texto = await res.text()
      if (!res.ok) throw errorDeRespuesta(res, texto, 'No se pudo consultar el estado en la DGII')
      let datos
      try { datos = JSON.parse(texto) } catch { throw new ErrorDeDgii('La DGII respondió algo que no se entiende', { transitorio: true, estadoHttp: res.status }) }
      // «No encontrado» (código 0) puede ser solo demora en aparecer: se sigue esperando
      const estado = ESTADOS_POR_CODIGO[datos.codigo] || ESTADOS_POR_TEXTO[String(datos.estado ?? '').toLowerCase()] || 'en_proceso'
      return { estado, mensajes: listaDeMensajes(datos.mensajes) }
    },
  }
}
