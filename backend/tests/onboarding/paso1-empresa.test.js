import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { iniciar } from '../helpers/contexto.js'
import { hoyRD } from '../../services/suscripcion/estado.js'
import { sumarDias } from '../../services/suscripcion/fechas.js'

let t
before(async () => { t = await iniciar() })
after(async () => { await t.cerrar() })

const datosValidos = (extra = {}) => ({
  nombre: 'Ferretería El Éxito SRL', rnc: '130-88170-7', correo: 'contacto@elexito.do',
  telefono: '809-555-0100', direccion: 'Calle Duarte 15, Santiago', ...extra,
})
const registrar = (cuerpo) => t.api('POST', '/registro/empresa', { body: cuerpo })
const fechaDe = (v) => (v instanceof Date ? v.toLocaleDateString('en-CA') : String(v).slice(0, 10))

test('paso 1: una empresa nueva se registra sin sesión y recibe un token de registro', async () => {
  const r = await registrar(datosValidos())
  assert.equal(r.status, 201)
  assert.ok(r.data.token_registro)
  assert.equal(r.data.empresa.nombre, 'Ferretería El Éxito SRL')
  assert.equal(r.data.empresa.slug, 'ferreteria-el-exito-srl')
})

test('paso 1: la empresa queda en prueba gratuita de 30 días, con su historial y su IP de registro', async () => {
  const [[tenant]] = await t.pool.query("SELECT * FROM tenants WHERE slug = 'ferreteria-el-exito-srl'")
  assert.equal(tenant.estado, 'prueba')
  assert.equal(tenant.rnc, '130881707', 'el RNC se guarda solo con dígitos')
  assert.equal(tenant.email, 'contacto@elexito.do')
  assert.ok(tenant.ip_registro)
  assert.equal(fechaDe(tenant.fecha_fin_prueba), sumarDias(hoyRD(), 30))
  const [[plan]] = await t.pool.query('SELECT es_plan_prueba FROM planes WHERE id = ?', [tenant.plan_id])
  assert.equal(plan.es_plan_prueba, 1)
  const [historial] = await t.pool.query('SELECT accion FROM subscription_history WHERE tenant_id = ?', [tenant.id])
  assert.equal(historial[0].accion, 'creada')
})

test('paso 1: la empresa se aprovisiona con su emisora, su configuración y sus catálogos, sin secuencias NCF', async () => {
  const [[tenant]] = await t.pool.query("SELECT id FROM tenants WHERE slug = 'ferreteria-el-exito-srl'")
  const [[empresa]] = await t.pool.query('SELECT * FROM empresas WHERE tenant_id = ?', [tenant.id])
  assert.equal(empresa.nombre, 'Ferretería El Éxito SRL')
  assert.equal(empresa.rnc, '130-88170-7', 'la empresa emisora guarda el RNC con formato')
  const [[cfg]] = await t.pool.query('SELECT * FROM configuracion WHERE tenant_id = ?', [tenant.id])
  assert.equal(cfg.empresa_id, empresa.id)
  const [[u]] = await t.pool.query('SELECT COUNT(*) n FROM unidades_medida WHERE tenant_id = ?', [tenant.id])
  const [[ts]] = await t.pool.query('SELECT COUNT(*) n FROM tipos_servicio WHERE tenant_id = ?', [tenant.id])
  const [[nfc]] = await t.pool.query('SELECT COUNT(*) n FROM nfc_secuencias WHERE tenant_id = ?', [tenant.id])
  assert.equal(u.n, 13)
  assert.equal(ts.n, 5)
  assert.equal(nfc.n, 0)
  const [[usuarios]] = await t.pool.query('SELECT COUNT(*) n FROM usuarios WHERE tenant_id = ?', [tenant.id])
  assert.equal(usuarios.n, 0, 'todavía no hay administrador')
})

test('paso 1: el token de registro está ligado a esa empresa y vence en 2 horas', async () => {
  const r = await registrar(datosValidos({ nombre: 'Otra Empresa SRL', rnc: '131-00000-1', correo: 'otra@empresa.do' }))
  const decodificado = jwt.decode(r.data.token_registro)
  const [[tenant]] = await t.pool.query("SELECT id FROM tenants WHERE slug = 'otra-empresa-srl'")
  assert.equal(decodificado.tenant_id, tenant.id)
  assert.equal(decodificado.exp - decodificado.iat, 2 * 60 * 60)
})

test('paso 1: el RNC de 11 dígitos (cédula de una persona física) también es válido', async () => {
  const r = await registrar(datosValidos({ nombre: 'Juan Pérez Consultor', rnc: '001-1234567-8', correo: 'juan@consultor.do' }))
  assert.equal(r.status, 201)
  const [[e]] = await t.pool.query("SELECT rnc FROM empresas WHERE nombre = 'Juan Pérez Consultor'")
  assert.equal(e.rnc, '001-1234567-8')
})

test('paso 1: dos nombres que dan el mismo slug reciben slugs distintos', async () => {
  const a = await registrar(datosValidos({ nombre: 'Casa Azul', rnc: '132-00000-1', correo: 'a@azul.do' }))
  const b = await registrar(datosValidos({ nombre: 'Casa-Azul', rnc: '132-00000-2', correo: 'b@azul.do' }))
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)
  assert.notEqual(a.data.empresa.slug, b.data.empresa.slug)
})

// ── Validaciones ──────────────────────────────────────────────

const CAMPOS_OBLIGATORIOS = { nombre: /nombre/i, rnc: /rnc/i, correo: /correo/i, telefono: /teléfono/i, direccion: /dirección/i }
for (const [campo, mensaje] of Object.entries(CAMPOS_OBLIGATORIOS)) {
  test(`paso 1: el campo ${campo} es obligatorio`, async () => {
    const r = await registrar(datosValidos({ [campo]: '' }))
    assert.equal(r.status, 400)
    assert.match(r.data.mensaje, mensaje)
  })
}

test('paso 1: rechaza un correo con formato inválido', async () => {
  const r = await registrar(datosValidos({ nombre: 'Correo Malo SRL', rnc: '133-00000-1', correo: 'esto-no-es-un-correo' }))
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /correo/i)
})

test('paso 1: rechaza un RNC que no tiene 9 ni 11 dígitos', async () => {
  for (const rnc of ['12345', '1234567890', 'abcdefghi']) {
    const r = await registrar(datosValidos({ nombre: `Rnc ${rnc} SRL`, rnc, correo: `x${rnc.length}@x.do` }))
    assert.equal(r.status, 400, `RNC ${rnc}`)
    assert.match(r.data.mensaje, /rnc/i)
  }
})

test('paso 1: no permite registrar dos veces el mismo RNC, con o sin guiones', async () => {
  const r = await registrar(datosValidos({ nombre: 'Copia SRL', rnc: '130881707', correo: 'copia@x.do' }))
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /RNC ya está registrado/i)
})

test('paso 1: no permite dos empresas con el mismo nombre, sin importar mayúsculas ni acentos', async () => {
  const r = await registrar(datosValidos({ nombre: 'FERRETERIA EL EXITO SRL', rnc: '134-00000-1', correo: 'otro@x.do' }))
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /nombre/i)
})

test('paso 1: una empresa que falla la validación no deja nada creado', async () => {
  const [[antes]] = await t.pool.query('SELECT COUNT(*) n FROM tenants')
  await registrar(datosValidos({ nombre: 'Fallida SRL', rnc: '12' }))
  const [[despues]] = await t.pool.query('SELECT COUNT(*) n FROM tenants')
  assert.equal(despues.n, antes.n)
})

// ── Límite por IP ─────────────────────────────────────────────

test('paso 1: cada IP puede registrar un máximo de empresas (429 al pasarse)', async () => {
  const [[{ n }]] = await t.pool.query('SELECT COUNT(*) n FROM tenants WHERE ip_registro IS NOT NULL')
  const anterior = process.env.LIMITE_REGISTROS_POR_IP
  process.env.LIMITE_REGISTROS_POR_IP = String(n + 1)
  try {
    const permitida = await registrar(datosValidos({ nombre: 'Última Permitida SRL', rnc: '135-00000-1', correo: 'ultima@x.do' }))
    assert.equal(permitida.status, 201)
    const bloqueada = await registrar(datosValidos({ nombre: 'Excedida SRL', rnc: '135-00000-2', correo: 'excedida@x.do' }))
    assert.equal(bloqueada.status, 429)
    assert.match(bloqueada.data.mensaje, /límite/i)
  } finally {
    process.env.LIMITE_REGISTROS_POR_IP = anterior
  }
})
