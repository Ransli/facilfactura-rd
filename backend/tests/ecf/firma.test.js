import '../helpers/entorno.js'
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { crearCertificadoDePrueba } from '../helpers/certificados.js'
import { firmarXml, verificarFirma, codigoSeguridad } from '../../services/ecf/firma.js'

const XML = '<ECF><Encabezado><Version>1.0</Version><IdDoc><TipoeCF>31</TipoeCF><eNCF>E310000000001</eNCF></IdDoc>' +
  '<Totales><MontoTotal>1180.00</MontoTotal></Totales></Encabezado><FechaHoraFirma>27-09-2026 10:00:00</FechaHoraFirma></ECF>'

let cert
before(() => { cert = crearCertificadoDePrueba() })

const firmar = (xml = XML) => firmarXml(xml, { clavePem: cert.clavePem, certificadoPem: cert.certificadoPem })

test('firmarXml agrega una firma enveloped al final del documento, con el certificado en KeyInfo', () => {
  const firmado = firmar()
  assert.match(firmado, /<Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/)
  assert.ok(firmado.endsWith('</Signature></ECF>'), 'la firma va dentro del elemento raíz, al final')
  assert.match(firmado, /<X509Certificate>/)
  assert.match(firmado, /<Reference URI="">/)
  assert.match(firmado, /enveloped-signature/)
})

test('la firma usa RSA-SHA256, digest SHA-256 y canonicalización C14N 1.0 (formato de la DGII)', () => {
  const firmado = firmar()
  assert.match(firmado, /Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#rsa-sha256"/)
  assert.match(firmado, /Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmlenc#sha256"/)
  assert.match(firmado, /Algorithm="http:\/\/www\.w3\.org\/TR\/2001\/REC-xml-c14n-20010315"/)
})

test('un XML firmado se verifica', () => {
  const r = verificarFirma(firmar())
  assert.equal(r.valida, true)
})

test('cambiar cualquier dato del contenido invalida la firma', () => {
  const firmado = firmar()
  assert.equal(verificarFirma(firmado.replace('1180.00', '1.00')).valida, false)
  assert.equal(verificarFirma(firmado.replace('E310000000001', 'E310000000002')).valida, false)
  assert.equal(verificarFirma(firmado.replace('<Version>1.0</Version>', '<Version>1.1</Version>')).valida, false)
})

test('un XML sin firma, roto o con la firma alterada no es válido y dice por qué', () => {
  assert.match(verificarFirma(XML).motivo, /no tiene firma/i)
  assert.equal(verificarFirma('<ECF><sin cerrar>').valida, false)
  const firmado = firmar()
  const alterado = firmado.replace(/<SignatureValue>(.{5})/, '<SignatureValue>AAAAA')
  assert.equal(verificarFirma(alterado).valida, false)
})

test('una firma que no cubre todo el documento se rechaza (protección contra reubicar contenido)', () => {
  const firmado = firmar()
  const soloUnaParte = firmado.replace('<Reference URI="">', '<Reference URI="#otro">')
  assert.equal(verificarFirma(soloUnaParte).valida, false)
})

test('con dos firmas el documento no es válido', () => {
  const doble = firmar(firmar())
  assert.equal(verificarFirma(doble).valida, false)
})

test('el código de seguridad son los 6 primeros caracteres del SignatureValue', () => {
  const firmado = firmar()
  const valor = firmado.match(/<SignatureValue>([^<]+)<\/SignatureValue>/)[1].replace(/\s+/g, '')
  const codigo = codigoSeguridad(firmado)
  assert.equal(codigo.length, 6)
  assert.equal(codigo, valor.slice(0, 6))
  assert.equal(codigoSeguridad(firmado), codigo, 'es determinista para el mismo documento firmado')
})

test('firmar el mismo contenido dos veces da la misma firma (RSA-SHA256 determinista) y el mismo código', () => {
  assert.equal(codigoSeguridad(firmar()), codigoSeguridad(firmar()))
})

test('el código de seguridad de un documento sin firma es un error claro', () => {
  assert.throws(() => codigoSeguridad(XML), /firma/i)
})

test('los acentos y símbolos del contenido sobreviven a la firma y a la verificación', () => {
  const xml = '<ECF><Encabezado><RazonSocialEmisor>Ferretería Pérez &amp; Hijos "El Éxito" &lt;SRL&gt;</RazonSocialEmisor></Encabezado></ECF>'
  const firmado = firmar(xml)
  assert.ok(firmado.includes('Ferretería Pérez &amp; Hijos'))
  assert.equal(verificarFirma(firmado).valida, true)
})
