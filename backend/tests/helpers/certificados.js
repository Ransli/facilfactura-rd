// Certificados digitales de PRUEBA (autofirmados). Nunca son válidos ante la DGII: sirven para probar la firma y el
// almacenamiento sin depender de un certificado real de INDOTEL.
import crypto from 'node:crypto'
import forge from 'node-forge'

/**
 * Genera un certificado autofirmado y su archivo PKCS#12.
 * @returns { p12Base64, password, clavePem, certificadoPem }
 */
export function crearCertificadoDePrueba({
  nombre = 'Empresa de Prueba SRL', rnc = '131000001', diasDeVigencia = 365, diasDesdeInicio = 0, bits = 2048, password = 'clave-de-prueba',
} = {}) {
  const { privateKey: clavePem } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  const clave = forge.pki.privateKeyFromPem(clavePem)
  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.setRsaPublicKey(clave.n, clave.e)
  cert.serialNumber = crypto.randomBytes(8).toString('hex')

  const dia = 24 * 60 * 60 * 1000
  cert.validity.notBefore = new Date(Date.now() + diasDesdeInicio * dia)
  cert.validity.notAfter = new Date(Date.now() + (diasDesdeInicio + diasDeVigencia) * dia)
  const atributos = [
    { name: 'commonName', value: nombre },
    { name: 'countryName', value: 'DO' },
    { name: 'organizationalUnitName', value: 'Certificado de prueba' },
    { name: 'serialNumber', value: rnc },
  ]
  cert.setSubject(atributos)
  cert.setIssuer([{ name: 'commonName', value: 'Autoridad de prueba' }, { name: 'countryName', value: 'DO' }])
  cert.sign(clave, forge.md.sha256.create())

  const p12 = forge.pkcs12.toPkcs12Asn1(clave, [cert], password, { algorithm: '3des' })
  const p12Base64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes())
  return { p12Base64, password, clavePem, certificadoPem: forge.pki.certificateToPem(cert) }
}

/** Un PKCS#12 que contiene solo el certificado, sin llave privada. */
export function crearP12SinLlave({ password = 'clave-de-prueba' } = {}) {
  const { certificadoPem } = crearCertificadoDePrueba({ bits: 1024 })
  const cert = forge.pki.certificateFromPem(certificadoPem)
  const p12 = forge.pkcs12.toPkcs12Asn1(null, [cert], password, { algorithm: '3des' })
  return { p12Base64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), password }
}
