// Firma XMLDSig de los e-CF, según el formato de la DGII: firma «enveloped» sobre todo el documento, canonicalización
// C14N 1.0, RSA-SHA256 y digest SHA-256, con el certificado del emisor en KeyInfo.

import { SignedXml } from 'xml-crypto'
import { DOMParser } from '@xmldom/xmldom'
import xpath from 'xpath'

const ALG_FIRMA = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
const ALG_DIGEST = 'http://www.w3.org/2001/04/xmlenc#sha256'
const ALG_C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const TRANSFORM_ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#'

const select = xpath.useNamespaces({ ds: NS_DSIG })

/** Firma el XML y devuelve el documento con `<Signature>` al final del elemento raíz. */
export function firmarXml(xml, { clavePem, certificadoPem }) {
  const firma = new SignedXml({
    privateKey: clavePem,
    publicCert: certificadoPem,
    signatureAlgorithm: ALG_FIRMA,
    canonicalizationAlgorithm: ALG_C14N,
  })
  firma.addReference({
    xpath: '/*',
    transforms: [TRANSFORM_ENVELOPED, ALG_C14N],
    digestAlgorithm: ALG_DIGEST,
    isEmptyUri: true,
  })
  firma.computeSignature(xml, { location: { reference: '/*', action: 'append' } })
  return firma.getSignedXml()
}

function leerDocumento(xml) {
  const falla = (m) => { throw new Error(m) }
  return new DOMParser({ onError: (nivel, mensaje) => { if (nivel !== 'warning') falla(mensaje) } }).parseFromString(xml, 'text/xml')
}

/**
 * Verifica la firma con el certificado que trae el propio documento.
 * Exige exactamente UNA firma que cubra TODO el documento (`Reference URI=""`); si no, un atacante podría
 * reubicar contenido sin firmar dentro de un documento con una firma válida.
 * @returns { valida: boolean, motivo?: string }
 */
export function verificarFirma(xml) {
  let doc
  try {
    doc = leerDocumento(xml)
  } catch {
    return { valida: false, motivo: 'El XML no está bien formado' }
  }

  const firmas = select('//ds:Signature', doc)
  if (firmas.length === 0) return { valida: false, motivo: 'El documento no tiene firma' }
  if (firmas.length > 1) return { valida: false, motivo: 'El documento tiene más de una firma' }

  const referencias = select('.//ds:Reference', firmas[0])
  if (referencias.length !== 1 || referencias[0].getAttribute('URI') !== '') {
    return { valida: false, motivo: 'La firma no cubre todo el documento' }
  }

  const certificado = select('string(.//ds:X509Certificate)', firmas[0]).replace(/\s+/g, '')
  if (!certificado) return { valida: false, motivo: 'La firma no incluye el certificado del emisor' }
  const pem = `-----BEGIN CERTIFICATE-----\n${certificado.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----`

  try {
    const verificador = new SignedXml({ publicCert: pem })
    verificador.loadSignature(firmas[0])
    const valida = verificador.checkSignature(xml)
    return valida ? { valida: true } : { valida: false, motivo: 'La firma no corresponde al contenido (fue alterado)' }
  } catch (err) {
    return { valida: false, motivo: 'La firma no corresponde al contenido (fue alterado)' }
  }
}

/** Código de seguridad del e-CF: los 6 primeros caracteres del SignatureValue. */
export function codigoSeguridad(xmlFirmado) {
  const doc = leerDocumento(xmlFirmado)
  const valor = select('string(//ds:Signature/ds:SignatureValue)', doc).replace(/\s+/g, '')
  if (!valor) throw new Error('El documento no tiene firma: no se puede obtener el código de seguridad')
  return valor.slice(0, 6)
}
