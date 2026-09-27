// Certificado digital tributario (archivo .p12/.pfx de una entidad acreditada por el INDOTEL).
// Aquí se lee y se valida; el almacenamiento cifrado por empresa está más abajo.

import crypto from 'node:crypto'
import forge from 'node-forge'

const BITS_MINIMOS = 2048
const DIAS_AVISO_VENCIMIENTO = 30
const MS_DIA = 24 * 60 * 60 * 1000

/** Error de negocio con un mensaje que puede mostrarse tal cual al administrador de la empresa. */
export class ErrorDeCertificado extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje)
    this.name = 'ErrorDeCertificado'
    this.estado = estado
  }
}

const formatoFecha = (d) => d.toISOString().slice(0, 10)

function nombreDe(atributos, ...nombres) {
  for (const n of nombres) {
    const a = atributos.getField(n)
    if (a?.value) return String(a.value)
  }
  return null
}

/**
 * Lee y valida un PKCS#12 en base64.
 * @returns { clavePem, certificadoPem, titular, emisor, serie, valido_desde, valido_hasta, huella, bits }
 * @throws  ErrorDeCertificado si la contraseña no es correcta, no es un .p12, no trae llave privada, no está vigente
 *          o la llave es menor a 2048 bits.
 */
export function leerP12(p12Base64, password) {
  let p12
  try {
    if (!p12Base64 || typeof p12Base64 !== 'string') throw new Error('vacío')
    const asn1 = forge.asn1.fromDer(forge.util.decode64(p12Base64.replace(/\s+/g, '')))
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, String(password ?? ''))
  } catch (err) {
    if (/MAC|password|Invalid/i.test(err.message) && !/vacío|Too few bytes|Unparsed/i.test(err.message)) {
      throw new ErrorDeCertificado('La contraseña del certificado es incorrecta')
    }
    throw new ErrorDeCertificado('El archivo no es un certificado .p12 válido')
  }

  const claves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ]
  const certificados = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const clave = claves[0]?.key
  const cert = certificados[0]?.cert
  if (!clave) throw new ErrorDeCertificado('El certificado no contiene la llave privada')
  if (!cert) throw new ErrorDeCertificado('El archivo no contiene un certificado')

  const ahora = new Date()
  if (cert.validity.notBefore > ahora) {
    throw new ErrorDeCertificado(`El certificado todavía no es válido (comienza el ${formatoFecha(cert.validity.notBefore)})`)
  }
  if (cert.validity.notAfter < ahora) {
    throw new ErrorDeCertificado(`El certificado está vencido (venció el ${formatoFecha(cert.validity.notAfter)})`)
  }
  const bits = clave.n.bitLength()
  if (bits < BITS_MINIMOS) throw new ErrorDeCertificado(`La llave del certificado debe ser RSA de ${BITS_MINIMOS} bits o más (tiene ${bits})`)

  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  return {
    clavePem: forge.pki.privateKeyToPem(clave),
    certificadoPem: forge.pki.certificateToPem(cert),
    titular: nombreDe(cert.subject, 'CN', 'commonName') || 'Sin nombre',
    emisor: nombreDe(cert.issuer, 'CN', 'commonName') || 'Desconocido',
    serie: cert.serialNumber,
    valido_desde: cert.validity.notBefore,
    valido_hasta: cert.validity.notAfter,
    huella: crypto.createHash('sha256').update(Buffer.from(der, 'binary')).digest('hex'),
    bits,
  }
}

/** vigente, por vencer (30 días o menos) o vencido, con los días que faltan. */
export function estadoDeVigencia(validoHasta, ahora = new Date()) {
  const dias = Math.floor((new Date(validoHasta).getTime() - ahora.getTime()) / MS_DIA)
  if (dias < 0) return { estado: 'vencido', dias_para_vencer: dias }
  return { estado: dias <= DIAS_AVISO_VENCIMIENTO ? 'por_vencer' : 'vigente', dias_para_vencer: dias }
}
