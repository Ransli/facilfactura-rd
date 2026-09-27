import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from '../helpers/contexto.js'

let t, planes
before(async () => {
  t = await iniciar()
  const [filas] = await t.pool.query('SELECT id, slug FROM planes')
  planes = Object.fromEntries(filas.map((p) => [p.slug, p.id]))
})
after(async () => { await t.cerrar() })

let contador = 0
async function registrar() {
  contador++
  const nombre = `Empresa Registrada ${contador} SRL`
  const rnc = `15${String(contador).padStart(7, '0')}`
  const r = await t.api('POST', '/registro/empresa', {
    body: { nombre, rnc, correo: `empresa${contador}@x.do`, telefono: '809-555-0100', direccion: 'Calle 1' },
  })
  const [[tenant]] = await t.pool.query('SELECT id FROM tenants WHERE nombre = ?', [nombre])
  return { token: r.data.token_registro, tenantId: tenant.id, nombre }
}
const crearAdmin = (token, cuerpo) => t.api('POST', '/registro/administrador', { token, body: cuerpo })
const adminValido = (extra = {}) => ({ nombre: 'Ana Gómez', email: `ana${Math.random().toString(36).slice(2, 8)}@x.do`, password: 'Clave2026!', ...extra })

test('recorrido completo: la empresa nueva se da de alta y su administrador queda con la sesión iniciada', async () => {
  const emp = await registrar()
  assert.equal((await t.api('POST', '/registro/plan', { token: emp.token, body: { plan_id: planes.prueba } })).status, 200)

  const datos = adminValido({ email: 'ana@recorrido.do' })
  const r = await crearAdmin(emp.token, datos)
  assert.equal(r.status, 201)
  assert.ok(r.data.token)
  assert.equal(r.data.usuario.rol, 'admin')
  assert.equal(r.data.usuario.email, 'ana@recorrido.do')
  assert.equal(r.data.usuario.tenant_id, emp.tenantId)
  assert.equal('password_hash' in r.data.usuario, false)

  // La sesión recibida ya funciona en el sistema, sobre la empresa nueva
  const sesion = r.data.token
  const cfg = (await t.api('GET', '/configuracion', { token: sesion })).data.data
  assert.equal(cfg.empresa_nombre, emp.nombre)
  assert.equal((await t.api('GET', '/unidades-medida', { token: sesion })).data.data.length, 13)
  assert.equal((await t.api('GET', '/nfc', { token: sesion })).data.data.length, 0)
  const susc = (await t.api('GET', '/suscripcion/mi-suscripcion', { token: sesion })).data.data
  assert.equal(susc.estado, 'prueba')
  assert.equal(susc.bloqueado, false)
  assert.equal((await t.api('POST', '/clientes', { token: sesion, body: { nombre: 'Primer cliente' } })).status, 201)

  // Y puede volver a entrar con su correo y contraseña
  const login = await t.api('POST', '/auth/login', { body: { email: 'ana@recorrido.do', password: 'Clave2026!' } })
  assert.equal(login.status, 200)
  assert.equal(login.data.usuario.tenant_id, emp.tenantId)
})

test('el administrador queda registrado con contraseña cifrada, activo y con el rol de administrador', async () => {
  const [[u]] = await t.pool.query("SELECT * FROM usuarios WHERE email = 'ana@recorrido.do'")
  assert.equal(u.rol_id, 1)
  assert.equal(u.activo, 1)
  assert.notEqual(u.password_hash, 'Clave2026!')
  assert.match(u.password_hash, /^\$2[aby]\$/)
})

test('una empresa recién registrada no ve ni toca los datos de las demás', async () => {
  const emp = await registrar()
  const { data } = await crearAdmin(emp.token, adminValido())
  const sesion = data.token
  assert.equal((await t.api('GET', '/clientes', { token: sesion })).data.data.length, 0)
  assert.equal((await t.api('GET', '/facturas', { token: sesion })).data.data.length, 0)
  assert.equal((await t.api('GET', '/usuarios', { token: sesion })).data.data.length, 1)
})

// ── Validaciones ──────────────────────────────────────────────

test('paso 3: exige nombre, correo y contraseña', async () => {
  const emp = await registrar()
  for (const [campo, mensaje] of [['nombre', /nombre/i], ['email', /correo/i], ['password', /contraseña/i]]) {
    const r = await crearAdmin(emp.token, adminValido({ [campo]: '' }))
    assert.equal(r.status, 400, campo)
    assert.match(r.data.mensaje, mensaje)
  }
})

test('paso 3: rechaza un correo inválido y una contraseña de menos de 8 caracteres', async () => {
  const emp = await registrar()
  assert.equal((await crearAdmin(emp.token, adminValido({ email: 'no-es-correo' }))).status, 400)
  const corta = await crearAdmin(emp.token, adminValido({ password: 'abc123' }))
  assert.equal(corta.status, 400)
  assert.match(corta.data.mensaje, /8 caracteres/)
})

test('paso 3: no permite un correo que ya usa otro usuario de la plataforma', async () => {
  const emp = await registrar()
  const r = await crearAdmin(emp.token, adminValido({ email: 'admin@facilfactura.com' }))
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /correo/i)
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM usuarios WHERE tenant_id = ?', [emp.tenantId])
  assert.equal(n, 0, 'la empresa no debe quedar con un usuario a medias')
})

// ── Un solo uso y concurrencia ────────────────────────────────

test('paso 3: solo funciona una vez; el segundo intento responde 409 y no crea otro usuario', async () => {
  const emp = await registrar()
  assert.equal((await crearAdmin(emp.token, adminValido())).status, 201)
  const segundo = await crearAdmin(emp.token, adminValido())
  assert.equal(segundo.status, 409)
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM usuarios WHERE tenant_id = ?', [emp.tenantId])
  assert.equal(n, 1)
})

test('paso 3: con dos intentos simultáneos gana uno solo', async () => {
  const emp = await registrar()
  const [a, b] = await Promise.all([crearAdmin(emp.token, adminValido()), crearAdmin(emp.token, adminValido())])
  assert.deepEqual([a.status, b.status].sort(), [201, 409])
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM usuarios WHERE tenant_id = ?', [emp.tenantId])
  assert.equal(n, 1)
})

test('una vez creado el administrador, el token de registro ya no permite cambiar el plan', async () => {
  const emp = await registrar()
  await crearAdmin(emp.token, adminValido())
  const r = await t.api('POST', '/registro/plan', { token: emp.token, body: { plan_id: planes.empresarial } })
  assert.equal(r.status, 409)
})

// ── Seguridad ─────────────────────────────────────────────────

test('paso 3: no se puede crear un administrador en una empresa que ya existe', async () => {
  // Ataque: un token falsificado con el tenant_id de la empresa 1 (la de la v1), o un token de sesión normal
  const falso = jwt.sign({ tenant_id: 1, fase: 'registro' }, 'clave-inventada', { expiresIn: '2h' })
  assert.equal((await crearAdmin(falso, adminValido())).status, 401)
  const { token: sesionNormal } = await t.sesion('admin')
  assert.equal((await crearAdmin(sesionNormal, adminValido())).status, 401)
  assert.equal((await crearAdmin(undefined, adminValido())).status, 401)
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM usuarios WHERE tenant_id = 1')
  assert.equal(n, 3, 'la empresa 1 conserva solo sus 3 usuarios')
})

test('paso 3: aunque el cuerpo mande otro tenant_id, el administrador se crea en la empresa del token', async () => {
  const emp = await registrar()
  const r = await crearAdmin(emp.token, adminValido({ tenant_id: 1 }))
  assert.equal(r.status, 201)
  assert.equal(r.data.usuario.tenant_id, emp.tenantId)
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM usuarios WHERE tenant_id = 1')
  assert.equal(n, 3)
})

test('paso 3: no se puede fijar el rol desde el cuerpo: siempre es administrador de su propia empresa', async () => {
  const emp = await registrar()
  const r = await crearAdmin(emp.token, adminValido({ rol_id: 3, rol: 'visor' }))
  assert.equal(r.status, 201)
  assert.equal(r.data.usuario.rol, 'admin')
})
