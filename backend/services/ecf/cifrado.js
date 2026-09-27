// Cifrado de secretos (certificados digitales y sus contraseñas) con AES-256-GCM.
//
// Formato del resultado:  v1:<iv en base64>:<etiqueta de autenticación en base64>:<datos cifrados en base64>
// GCM autentica el contenido: si alguien altera el texto cifrado, o la clave no coincide, descifrar falla.
//
// La clave sale de la variable de entorno CLAVE_CIFRADO_CERTIFICADOS (32 bytes en hexadecimal = 64 caracteres). Cambiarla
// hace ilegibles los certificados ya guardados: hay que volver a subirlos.

import crypto from 'node:crypto'

const VERSION = 'v1'

function clave() {
  const hex = process.env.CLAVE_CIFRADO_CERTIFICADOS
  if (!hex) throw new Error('Falta la variable de entorno CLAVE_CIFRADO_CERTIFICADOS (32 bytes en hexadecimal)')
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error('CLAVE_CIFRADO_CERTIFICADOS debe tener 64 caracteres hexadecimales (32 bytes)')
  return Buffer.from(hex, 'hex')
}

/** Cifra un texto o unos bytes y devuelve una cadena lista para guardar. */
export function cifrar(dato) {
  const contenido = Buffer.isBuffer(dato) ? dato : Buffer.from(String(dato), 'utf8')
  const iv = crypto.randomBytes(12)
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave(), iv)
  const datos = Buffer.concat([cifrador.update(contenido), cifrador.final()])
  return [VERSION, iv.toString('base64'), cifrador.getAuthTag().toString('base64'), datos.toString('base64')].join(':')
}

/** Descifra lo producido por `cifrar` y devuelve los bytes. */
export function descifrar(texto) {
  const partes = String(texto ?? '').split(':')
  if (partes.length !== 4 || partes[0] !== VERSION) throw new Error('Formato de dato cifrado desconocido')
  const [, iv, etiqueta, datos] = partes
  try {
    const descifrador = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'))
    descifrador.setAuthTag(Buffer.from(etiqueta, 'base64'))
    return Buffer.concat([descifrador.update(Buffer.from(datos, 'base64')), descifrador.final()])
  } catch (err) {
    if (/CLAVE_CIFRADO_CERTIFICADOS/.test(err.message)) throw err
    throw new Error('El dato cifrado está alterado o la clave de cifrado no coincide')
  }
}

export const descifrarTexto = (texto) => descifrar(texto).toString('utf8')
