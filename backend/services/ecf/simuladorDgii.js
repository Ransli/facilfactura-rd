// Simulador local de los servicios de la DGII (autenticación, recepción y consulta de resultado).
//
// Sirve para desarrollar y probar sin depender de la DGII: valida la firma del XML como lo haría ella, rechaza e-NCF repetidos
// y responde con el resultado que se le configure (aceptado, condicional, rechazado, en proceso, caído, lento).
// NO sustituye la certificación: los servicios reales se prueban en el ambiente TesteCF de la DGII.
//
// Uso:  npm run dgii:simulador --prefix backend      (escucha en el puerto 3900; DGII_URL_BASE=http://localhost:3900)
//
// Rutas (después del ambiente: /testecf, /certecf o /ecf):
//   GET  /{amb}/autenticacion/api/autenticacion/semilla
//   POST /{amb}/autenticacion/api/autenticacion/validacioncertificado     (xml de la semilla firmada)
//   POST /{amb}/recepcion/api/facturaselectronicas                        (xml del e-CF firmado, con Bearer)
//   GET  /{amb}/consultaresultado/api/consultas/estado?trackid=...        (con Bearer)

import http from 'node:http'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'
import { verificarFirma } from './firma.js'

const CODIGOS = { aceptado: [1, 'Aceptado'], rechazado: [2, 'Rechazado'], en_proceso: [3, 'En Proceso'], aceptado_condicional: [4, 'Aceptado Condicional'] }

const configuracionInicial = () => ({
  resultado: 'aceptado',           // aceptado | aceptado_condicional | rechazado
  motivo: 'Rechazado por el simulador',
  consultasEnProceso: 0,           // cuántas consultas devuelven «En Proceso» antes del resultado final
  caido: false,                    // responde 503 a todo
  latenciaMs: 0,                   // demora artificial antes de responder
  duracionTokenMs: 60 * 60 * 1000,
})

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const partes = []
    req.on('data', (p) => partes.push(p))
    req.on('end', () => resolve(Buffer.concat(partes)))
    req.on('error', reject)
  })
}

/** Archivo `xml` de un envío multipart/form-data: { texto, nombre }. */
async function leerXmlEnviado(req, cuerpo) {
  const form = await new Request('http://simulador.local/', {
    method: 'POST', headers: { 'content-type': req.headers['content-type'] || '' }, body: cuerpo,
  }).formData()
  const archivo = form.get('xml')
  if (!archivo || typeof archivo === 'string') return null
  return { texto: await archivo.text(), nombre: archivo.name }
}

const enviarJson = (res, estado, objeto) => {
  res.writeHead(estado, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(objeto))
}

function datosDelEcf(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const valor = (ruta) => xpath.select(`string(${ruta})`, doc)
  return { encf: valor('//IdDoc/eNCF'), rncEmisor: valor('//Emisor/RNCEmisor') }
}

export async function iniciarSimulador({ puerto = 0 } = {}) {
  let config = configuracionInicial()
  let recibidos = []
  let rutas = []
  let semillas = new Set()
  let tokens = new Map()          // token -> expira (ms)
  let contadorAutenticaciones = 0
  const estados = new Map()       // trackId -> { recibido, consultas }

  const estado = {
    get config() { return config },
    get recibidos() { return recibidos },
    get rutas() { return rutas },
    autenticaciones: () => contadorAutenticaciones,
    olvidarTokens: () => tokens.clear(),
    reiniciar() {
      config = configuracionInicial()
      recibidos = []
      rutas = []
      semillas = new Set()
      tokens = new Map()
      contadorAutenticaciones = 0
      estados.clear()
    },
  }

  const servidor = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://simulador.local')
      rutas.push(url.pathname)
      if (config.latenciaMs) await new Promise((r) => setTimeout(r, config.latenciaMs))
      if (config.caido) return enviarJson(res, 503, { error: 'Servicio no disponible' })

      const ruta = url.pathname.toLowerCase().replace(/^\/(testecf|certecf|ecf)/, '')
      const cuerpo = req.method === 'POST' ? await leerCuerpo(req) : null

      // ── Autenticación ───────────────────────────────────────
      if (req.method === 'GET' && ruta === '/autenticacion/api/autenticacion/semilla') {
        const valor = crypto.randomBytes(24).toString('base64')
        semillas.add(valor)
        res.writeHead(200, { 'Content-Type': 'application/xml' })
        return res.end(`<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>${valor}</valor><fecha>${new Date().toISOString()}</fecha></SemillaModel>`)
      }

      if (req.method === 'POST' && ruta === '/autenticacion/api/autenticacion/validacioncertificado') {
        const enviado = await leerXmlEnviado(req, cuerpo)
        if (!enviado) return enviarJson(res, 400, { error: 'Falta el archivo xml' })
        const firma = verificarFirma(enviado.texto)
        const valor = /<valor>([^<]+)<\/valor>/.exec(enviado.texto)?.[1]
        if (!firma.valida || !valor || !semillas.has(valor)) {
          return enviarJson(res, 401, { error: 'La semilla no está firmada correctamente o ya no es válida' })
        }
        semillas.delete(valor)                     // una semilla sirve una sola vez
        contadorAutenticaciones += 1
        const token = `sim-${crypto.randomBytes(24).toString('hex')}`
        const expira = Date.now() + config.duracionTokenMs
        tokens.set(token, expira)
        return enviarJson(res, 200, { token, expira: new Date(expira).toISOString(), expedido: new Date().toISOString() })
      }

      // ── Servicios con token ─────────────────────────────────
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1]
      if (!token || !tokens.has(token)) return enviarJson(res, 401, { error: 'Token inválido o vencido' })

      if (req.method === 'POST' && ruta === '/recepcion/api/facturaselectronicas') {
        const enviado = await leerXmlEnviado(req, cuerpo)
        if (!enviado) return enviarJson(res, 400, { trackId: null, error: 'Falta el archivo xml', mensaje: ['Falta el archivo xml'] })
        const firma = verificarFirma(enviado.texto)
        if (!firma.valida) {
          return enviarJson(res, 400, { trackId: null, error: 'Firma inválida', mensaje: [`Firma inválida: ${firma.motivo}`] })
        }
        const { encf, rncEmisor } = datosDelEcf(enviado.texto)
        if (!encf || !rncEmisor) return enviarJson(res, 400, { trackId: null, error: 'XML incompleto', mensaje: ['XML incompleto: faltan eNCF o RNCEmisor'] })
        if (recibidos.some((r) => r.encf === encf && r.rncEmisor === rncEmisor)) {
          return enviarJson(res, 400, { trackId: null, error: 'e-NCF duplicado', mensaje: [`El e-NCF ${encf} ya fue recibido`] })
        }
        const trackId = crypto.randomUUID()
        const recibido = { trackId, encf, rncEmisor, archivo: enviado.nombre, xml: enviado.texto, recibidoEn: new Date().toISOString() }
        recibidos.push(recibido)
        estados.set(trackId, { recibido, consultas: 0 })
        return enviarJson(res, 200, { trackId, error: null, mensaje: null })
      }

      if (req.method === 'GET' && ruta === '/consultaresultado/api/consultas/estado') {
        const trackId = url.searchParams.get('trackid')
        const registro = estados.get(trackId)
        if (!registro) return enviarJson(res, 200, { trackId, codigo: 0, estado: 'No encontrado', mensajes: [] })
        registro.consultas += 1
        const final = registro.consultas > config.consultasEnProceso
        const clave = final ? config.resultado : 'en_proceso'
        const [codigo, texto] = CODIGOS[clave]
        const mensajes = final && clave !== 'aceptado' ? [{ valor: config.motivo, codigo: 1 }] : []
        return enviarJson(res, 200, {
          trackId, codigo, estado: texto, rnc: registro.recibido.rncEmisor, encf: registro.recibido.encf,
          secuenciaUtilizada: final && clave !== 'rechazado', fechaRecepcion: registro.recibido.recibidoEn, mensajes,
        })
      }

      return enviarJson(res, 404, { error: `Ruta desconocida: ${url.pathname}` })
    } catch (err) {
      console.error('[simulador DGII]', err)
      enviarJson(res, 500, { error: 'Error del simulador' })
    }
  })

  await new Promise((resolve) => servidor.listen(puerto, resolve))
  const escuchando = servidor.address().port
  estado.puerto = escuchando
  estado.url = `http://localhost:${escuchando}`
  estado.cerrar = () => new Promise((resolve) => { servidor.closeAllConnections?.(); servidor.close(resolve) })
  return estado
}

// Ejecutado directamente: `node services/ecf/simuladorDgii.js`
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const puerto = Number(process.env.DGII_SIMULADOR_PUERTO) || 3900
  const s = await iniciarSimulador({ puerto })
  console.log(`✔  Simulador de la DGII en ${s.url}  (usa DGII_URL_BASE=${s.url})`)
}
