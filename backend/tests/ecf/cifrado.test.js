import '../helpers/entorno.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cifrar, descifrar, descifrarTexto } from '../../services/ecf/cifrado.js'

test('cifrar y descifrar devuelven el mismo contenido, en texto o en bytes', () => {
  assert.equal(descifrarTexto(cifrar('clave-del-certificado')), 'clave-del-certificado')
  const bytes = Buffer.from([0, 1, 2, 250, 255, 128])
  assert.deepEqual(descifrar(cifrar(bytes)), bytes)
})

test('el resultado no contiene el texto original', () => {
  const secreto = 'contraseña-muy-secreta-123'
  const c = cifrar(secreto)
  assert.equal(c.includes(secreto), false)
  assert.equal(Buffer.from(c, 'utf8').includes(Buffer.from(secreto)), false)
})

test('cifrar dos veces lo mismo da resultados distintos (vector de inicialización aleatorio)', () => {
  assert.notEqual(cifrar('igual'), cifrar('igual'))
})

test('alterar un solo carácter del texto cifrado se detecta al descifrar', () => {
  const c = cifrar('contenido')
  const partes = c.split(':')
  const datos = Buffer.from(partes[3], 'base64')
  datos[0] ^= 1
  partes[3] = datos.toString('base64')
  assert.throws(() => descifrar(partes.join(':')), /alterado|inválido|autentic/i)
})

test('una clave distinta no puede descifrar', () => {
  const c = cifrar('contenido')
  const anterior = process.env.CLAVE_CIFRADO_CERTIFICADOS
  process.env.CLAVE_CIFRADO_CERTIFICADOS = 'b2'.repeat(32)
  try {
    assert.throws(() => descifrar(c), /alterado|inválido|autentic|clave/i)
  } finally {
    process.env.CLAVE_CIFRADO_CERTIFICADOS = anterior
  }
})

test('sin la clave de cifrado el módulo se niega a trabajar, con un mensaje claro', () => {
  const anterior = process.env.CLAVE_CIFRADO_CERTIFICADOS
  try {
    delete process.env.CLAVE_CIFRADO_CERTIFICADOS
    assert.throws(() => cifrar('x'), /CLAVE_CIFRADO_CERTIFICADOS/)
    process.env.CLAVE_CIFRADO_CERTIFICADOS = 'corta'
    assert.throws(() => cifrar('x'), /64 caracteres hexadecimales/)
  } finally {
    process.env.CLAVE_CIFRADO_CERTIFICADOS = anterior
  }
})

test('un formato desconocido no se acepta', () => {
  assert.throws(() => descifrar('texto-plano'), /formato/i)
  assert.throws(() => descifrar(''), /formato/i)
})
