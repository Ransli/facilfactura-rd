import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from '../helpers/contexto.js'
import { crearCertificadoDePrueba, crearP12SinLlave } from '../helpers/certificados.js'
import { obtenerCredenciales } from '../../services/ecf/certificados.js'
import { firmarXml, verificarFirma } from '../../services/ecf/firma.js'

let t, A, B, adminA, facturadorA, visorA, adminB
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  facturadorA = (await t.sesionDe(A, 'facturador')).token
  visorA = (await t.sesionDe(A, 'visor')).token
  adminB = (await t.sesionDe(B, 'admin')).token
})
after(async () => { await t.cerrar() })

const subir = (token, cert) => t.api('PUT', '/ecf/certificado', { token, body: { p12_base64: cert.p12Base64, password: cert.password } })
const consultar = (token) => t.api('GET', '/ecf/certificado', { token })
const filasDe = async (tenantId) => (await t.pool.query('SELECT * FROM certificados_digitales WHERE tenant_id = ?', [tenantId]))[0]

test('la tabla certificados_digitales tiene un solo certificado por empresa y está ligada a tenants', async () => {
  const [fks] = await t.pool.query(
    `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificados_digitales' AND COLUMN_NAME = 'tenant_id' AND REFERENCED_TABLE_NAME = 'tenants'`)
  assert.equal(fks.length, 1)
  const [unicos] = await t.pool.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificados_digitales' AND COLUMN_NAME = 'tenant_id' AND NON_UNIQUE = 0`)
  assert.ok(unicos.length >= 1, 'tenant_id debe ser único')
})

test('sin certificado, la consulta dice que no está configurado', async () => {
  const r = await consultar(adminA)
  assert.equal(r.status, 200)
  assert.deepEqual(r.data.data, { configurado: false })
})

test('el administrador sube un .p12 válido y recibe solo los metadatos', async () => {
  const cert = crearCertificadoDePrueba({ nombre: 'Empresa Alfa SRL', rnc: A.rnc })
  const r = await subir(adminA, cert)
  assert.equal(r.status, 200)
  assert.equal(r.data.ok, true)
  const d = r.data.data
  assert.equal(d.configurado, true)
  assert.equal(d.titular, 'Empresa Alfa SRL')
  assert.equal(d.emisor, 'Autoridad de prueba')
  assert.equal(d.estado, 'vigente')
  assert.ok(d.dias_para_vencer >= 364)
  assert.ok(d.serie && d.valido_desde && d.valido_hasta)

  const texto = JSON.stringify(r.data)
  assert.ok(!texto.includes(cert.password), 'la respuesta no debe contener la contraseña')
  assert.ok(!texto.includes(cert.p12Base64.slice(0, 60)), 'la respuesta no debe contener el archivo')
  assert.ok(!/PRIVATE KEY/.test(texto), 'la respuesta no debe contener la llave')
})

test('la consulta devuelve los metadatos y nunca el archivo, la contraseña ni la llave', async () => {
  const r = await consultar(visorA)
  assert.equal(r.status, 200)
  assert.equal(r.data.data.configurado, true)
  for (const prohibida of ['p12', 'p12_cifrado', 'password', 'password_cifrada', 'clave', 'clavePem']) {
    assert.ok(!(prohibida in r.data.data), `no debe exponer ${prohibida}`)
  }
})

test('en la base de datos el archivo y la contraseña están cifrados, no en claro', async () => {
  const cert = crearCertificadoDePrueba()
  await subir(adminA, cert)
  const [fila] = await filasDe(A.tenantId)
  assert.match(fila.p12_cifrado, /^v1:/)
  assert.match(fila.password_cifrada, /^v1:/)
  assert.ok(!fila.p12_cifrado.includes(cert.p12Base64.slice(0, 40)))
  assert.ok(!fila.password_cifrada.includes(cert.password))
  assert.equal(fila.subido_por, adminA ? (jwt.decode(adminA).id) : null)
})

test('el servicio recupera la llave y el certificado guardados y sirven para firmar', async () => {
  const cert = crearCertificadoDePrueba()
  await subir(adminA, cert)
  const cred = await obtenerCredenciales(t.pool, A.tenantId)
  assert.match(cred.clavePem, /PRIVATE KEY/)
  assert.match(cred.certificadoPem, /BEGIN CERTIFICATE/)
  const firmado = firmarXml('<ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>', cred)
  assert.equal(verificarFirma(firmado).valida, true)
})

test('subir otro certificado reemplaza al anterior: queda uno solo', async () => {
  await subir(adminA, crearCertificadoDePrueba({ nombre: 'Primero' }))
  const r = await subir(adminA, crearCertificadoDePrueba({ nombre: 'Segundo' }))
  assert.equal(r.status, 200)
  const filas = await filasDe(A.tenantId)
  assert.equal(filas.length, 1)
  assert.equal(filas[0].titular, 'Segundo')
})

test('un certificado que vence pronto se marca por_vencer con los días que faltan', async () => {
  const r = await subir(adminA, crearCertificadoDePrueba({ diasDeVigencia: 10 }))
  assert.equal(r.status, 200)
  assert.equal(r.data.data.estado, 'por_vencer')
  assert.ok(r.data.data.dias_para_vencer >= 9 && r.data.data.dias_para_vencer <= 10)
})

test('los certificados inválidos se rechazan con 400 y un motivo, y no reemplazan al que ya estaba', async () => {
  const bueno = crearCertificadoDePrueba({ nombre: 'El bueno' })
  await subir(adminA, bueno)

  const casos = [
    [{ ...crearCertificadoDePrueba(), password: 'equivocada' }, /contraseña/i],
    [crearCertificadoDePrueba({ diasDeVigencia: 30, diasDesdeInicio: -60 }), /venci/i],
    [crearCertificadoDePrueba({ diasDesdeInicio: 10 }), /todavía no/i],
    [crearCertificadoDePrueba({ bits: 1024 }), /2048/],
    [crearP12SinLlave(), /llave privada/i],
    [{ p12Base64: 'no es un p12', password: 'x' }, /archivo/i],
  ]
  for (const [cert, motivo] of casos) {
    const r = await subir(adminA, cert)
    assert.equal(r.status, 400, motivo.toString())
    assert.match(r.data.mensaje, motivo)
  }
  assert.equal((await consultar(adminA)).data.data.titular, 'El bueno')
})

test('faltan datos: sin archivo o sin contraseña es un 400', async () => {
  assert.equal((await t.api('PUT', '/ecf/certificado', { token: adminA, body: { password: 'x' } })).status, 400)
  assert.equal((await t.api('PUT', '/ecf/certificado', { token: adminA, body: { p12_base64: 'abc' } })).status, 400)
  assert.equal((await t.api('PUT', '/ecf/certificado', { token: adminA, body: {} })).status, 400)
})

test('solo el administrador sube o borra; facturador y visor pueden consultar', async () => {
  const cert = crearCertificadoDePrueba()
  assert.equal((await subir(facturadorA, cert)).status, 403)
  assert.equal((await subir(visorA, cert)).status, 403)
  assert.equal((await t.api('DELETE', '/ecf/certificado', { token: facturadorA })).status, 403)
  assert.equal((await consultar(facturadorA)).status, 200)
  assert.equal((await consultar(visorA)).status, 200)
})

test('sin sesión es 401 y un token sin empresa es 403', async () => {
  assert.equal((await t.api('GET', '/ecf/certificado')).status, 401)
  const sinEmpresa = jwt.sign({ id: 1, rol: 'admin' }, process.env.JWT_SECRET)
  assert.equal((await consultar(sinEmpresa)).status, 403)
})

test('cada empresa ve y usa solo su certificado', async () => {
  await subir(adminA, crearCertificadoDePrueba({ nombre: 'Solo de Alfa' }))
  assert.deepEqual((await consultar(adminB)).data.data, { configurado: false })
  assert.equal(await obtenerCredenciales(t.pool, B.tenantId), null)
  assert.equal((await t.api('DELETE', '/ecf/certificado', { token: adminB })).status, 404)
  assert.equal((await consultar(adminA)).data.data.titular, 'Solo de Alfa', 'el certificado de A sigue intacto')

  await subir(adminB, crearCertificadoDePrueba({ nombre: 'Solo de Beta' }))
  assert.equal((await consultar(adminA)).data.data.titular, 'Solo de Alfa')
  assert.equal((await consultar(adminB)).data.data.titular, 'Solo de Beta')
})

test('borrar el certificado lo elimina de verdad', async () => {
  await subir(adminA, crearCertificadoDePrueba())
  const r = await t.api('DELETE', '/ecf/certificado', { token: adminA })
  assert.equal(r.status, 200)
  assert.deepEqual((await consultar(adminA)).data.data, { configurado: false })
  assert.equal((await filasDe(A.tenantId)).length, 0)
  assert.equal((await t.api('DELETE', '/ecf/certificado', { token: adminA })).status, 404)
})

test('una empresa suspendida puede consultar pero no subir ni borrar', async () => {
  await subir(adminB, crearCertificadoDePrueba())
  await t.pool.query("UPDATE tenants SET estado = 'suspendido' WHERE id = ?", [B.tenantId])
  try {
    assert.equal((await consultar(adminB)).status, 200)
    const r = await subir(adminB, crearCertificadoDePrueba())
    assert.equal(r.status, 403)
    assert.equal(r.data.suscripcion_bloqueada, true)
    assert.equal((await t.api('DELETE', '/ecf/certificado', { token: adminB })).status, 403)
  } finally {
    await t.pool.query("UPDATE tenants SET estado = 'activo' WHERE id = ?", [B.tenantId])
  }
})

test('sin la clave de cifrado configurada el servidor se niega a guardar y lo dice', async () => {
  const guardada = process.env.CLAVE_CIFRADO_CERTIFICADOS
  delete process.env.CLAVE_CIFRADO_CERTIFICADOS
  try {
    const r = await subir(adminA, crearCertificadoDePrueba())
    assert.equal(r.status, 503)
    assert.match(r.data.mensaje, /cifrado/i)
    assert.ok(!('stack' in r.data))
  } finally {
    process.env.CLAVE_CIFRADO_CERTIFICADOS = guardada
  }
})
