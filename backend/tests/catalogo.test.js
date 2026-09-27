import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'
import { prepararNegocio } from './helpers/negocio.js'

let t, n
before(async () => { t = await iniciar(); n = await prepararNegocio(t) })
after(async () => { await t.cerrar() })

test('CFG-01 el administrador registra la empresa emisora y sus parámetros fiscales', async () => {
  const cfg = (await t.api('GET', '/configuracion', { token: n.admin })).data.data
  assert.equal(cfg.empresa_nombre, 'Empresa de Prueba SRL')
  assert.equal(Number(cfg.itbis_porcentaje), 18)
  assert.equal(cfg.empresa_id, n.empresaId)
})

test('CFG-02 rechaza subir como logo un archivo que no es imagen', async () => {
  const form = new FormData()
  form.append('logo', new Blob(['no soy una imagen'], { type: 'text/plain' }), 'x.txt')
  const res = await fetch(`${t.base}/configuracion/logo`, {
    method: 'POST', headers: { Authorization: `Bearer ${n.admin}` }, body: form,
  })
  const data = await res.json()
  assert.equal(res.status, 400)
  assert.match(data.mensaje, /imágenes/)
})

test('CLI-01 un facturador registra un cliente', async () => {
  const { token } = await t.sesion('facturador')
  const r = await t.api('POST', '/clientes', { token, body: { nombre: 'Cliente Dos SRL', tipo: 'empresa' } })
  assert.equal(r.status, 201)
  assert.ok(r.data.data.id)
})

test('CLI-02 no se registra un cliente sin nombre', async () => {
  const { token } = await t.sesion('facturador')
  const r = await t.api('POST', '/clientes', { token, body: { rnc: '1' } })
  assert.equal(r.status, 400)
})

test('CLI-03 se busca un cliente por nombre', async () => {
  const { token } = await t.sesion('visor')
  const r = await t.api('GET', '/clientes?buscar=Uno', { token })
  assert.equal(r.data.data.length, 1)
})

test("SEG-01 el buscador de clientes resiste una inyección SQL", async () => {
  const r = await t.api('GET', "/clientes?buscar=' OR '1'='1", { token: n.admin })
  assert.equal(r.status, 200)
  assert.equal(r.data.data.length, 0)
})

test('ART-01 el administrador crea un artículo con precios y otro con dimensiones', () => {
  assert.equal(n.articuloA.precios.length, 1)
  assert.equal(n.articuloB.tiene_dimensiones, 1)
})

test('ROL-04 un facturador no puede crear artículos', async () => {
  const { token } = await t.sesion('facturador')
  const r = await t.api('POST', '/articulos', {
    token, body: { categoria_id: n.categoriaId, nombre: 'X', unidad_medida_id: 1 },
  })
  assert.equal(r.status, 403)
})
