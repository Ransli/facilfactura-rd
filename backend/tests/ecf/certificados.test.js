import '../helpers/entorno.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearCertificadoDePrueba, crearP12SinLlave } from '../helpers/certificados.js'
import { leerP12, ErrorDeCertificado, estadoDeVigencia } from '../../services/ecf/certificados.js'

const dia = 24 * 60 * 60 * 1000

test('un .p12 válido se lee: entrega llave, certificado y datos del titular', () => {
  const { p12Base64, password } = crearCertificadoDePrueba({ nombre: 'Ferretería El Éxito SRL', rnc: '130881707' })
  const c = leerP12(p12Base64, password)
  assert.match(c.clavePem, /BEGIN (RSA )?PRIVATE KEY/)
  assert.match(c.certificadoPem, /BEGIN CERTIFICATE/)
  assert.equal(c.titular, 'Ferretería El Éxito SRL')
  assert.equal(c.emisor, 'Autoridad de prueba')
  assert.ok(c.serie)
  assert.equal(c.bits, 2048)
  assert.match(c.huella, /^[0-9a-f]{64}$/)
  assert.ok(c.valido_hasta > c.valido_desde)
})

test('una contraseña equivocada se rechaza con un mensaje claro', () => {
  const { p12Base64 } = crearCertificadoDePrueba()
  assert.throws(() => leerP12(p12Base64, 'otra-clave'), (e) => e instanceof ErrorDeCertificado && /contraseña/i.test(e.message))
})

test('un archivo que no es un .p12 se rechaza', () => {
  assert.throws(() => leerP12('esto no es un certificado', 'x'), (e) => e instanceof ErrorDeCertificado && /archivo/i.test(e.message))
  assert.throws(() => leerP12('', 'x'), ErrorDeCertificado)
})

test('un certificado sin llave privada se rechaza', () => {
  const { p12Base64, password } = crearP12SinLlave()
  assert.throws(() => leerP12(p12Base64, password), (e) => /llave privada/i.test(e.message))
})

test('un certificado vencido se rechaza', () => {
  const { p12Base64, password } = crearCertificadoDePrueba({ diasDeVigencia: 30, diasDesdeInicio: -60 })
  assert.throws(() => leerP12(p12Base64, password), (e) => /venci/i.test(e.message))
})

test('un certificado que todavía no es válido se rechaza', () => {
  const { p12Base64, password } = crearCertificadoDePrueba({ diasDesdeInicio: 10 })
  assert.throws(() => leerP12(p12Base64, password), (e) => /todavía no|aún no/i.test(e.message))
})

test('una llave menor a 2048 bits se rechaza', () => {
  const { p12Base64, password } = crearCertificadoDePrueba({ bits: 1024 })
  assert.throws(() => leerP12(p12Base64, password), (e) => /2048/.test(e.message))
})

test('estadoDeVigencia distingue vigente, por vencer (30 días o menos) y vencido', () => {
  const hoy = new Date('2026-09-27T12:00:00Z')
  const en = (dias) => new Date(hoy.getTime() + dias * dia)
  assert.deepEqual(estadoDeVigencia(en(200), hoy), { estado: 'vigente', dias_para_vencer: 200 })
  assert.deepEqual(estadoDeVigencia(en(30), hoy), { estado: 'por_vencer', dias_para_vencer: 30 })
  assert.deepEqual(estadoDeVigencia(en(5), hoy), { estado: 'por_vencer', dias_para_vencer: 5 })
  assert.equal(estadoDeVigencia(en(-1), hoy).estado, 'vencido')
})
