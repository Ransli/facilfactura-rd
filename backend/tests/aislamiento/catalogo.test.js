import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'

let t, A, B, adminA, adminB
let categoriaA, articuloA, tipoA
before(async () => {
  t = await iniciar()
  A = await t.crearEmpresa('Empresa Alfa')
  B = await t.crearEmpresa('Empresa Beta')
  adminA = (await t.sesionDe(A, 'admin')).token
  adminB = (await t.sesionDe(B, 'admin')).token

  categoriaA = (await t.api('POST', '/categorias', { token: adminA, body: { nombre: 'Categoría de Alfa', tipo: 'servicio' } })).data.data
  tipoA = (await t.api('POST', '/tipos-servicio', { token: adminA, body: { nombre: 'Tipo secreto de Alfa' } })).data.data
  const unidadA = (await t.api('GET', '/unidades-medida', { token: adminA })).data.data[0]
  articuloA = (await t.api('POST', '/articulos', {
    token: adminA,
    body: { categoria_id: categoriaA.id, nombre: 'Artículo de Alfa', codigo: 'SKU-1', unidad_medida_id: unidadA.id,
            precios: [{ unidad_medida_id: unidadA.id, precio_unitario: 100, es_precio_default: true }] },
  })).data.data
})
after(async () => { await t.cerrar() })

const filaDe = async (tabla, id) => (await t.pool.query(`SELECT * FROM \`${tabla}\` WHERE id = ?`, [id]))[0][0]

// ── Categorías ────────────────────────────────────────────────

test('categorías: B no ve las de A y cada empresa ve solo las suyas', async () => {
  const b = await t.api('GET', '/categorias', { token: adminB })
  assert.equal(b.data.data.length, 0)
  const a = await t.api('GET', '/categorias', { token: adminA })
  assert.deepEqual(a.data.data.map((c) => c.nombre), ['Categoría de Alfa'])
})

test('categorías: B recibe 404 al pedir, editar o eliminar una categoría de A, y esta no cambia', async () => {
  assert.equal((await t.api('GET', `/categorias/${categoriaA.id}`, { token: adminB })).status, 404)
  assert.equal((await t.api('PUT', `/categorias/${categoriaA.id}`, { token: adminB, body: { nombre: 'Hackeada' } })).status, 404)
  assert.equal((await t.api('DELETE', `/categorias/${categoriaA.id}`, { token: adminB })).status, 404)
  const fila = await filaDe('categorias', categoriaA.id)
  assert.equal(fila.nombre, 'Categoría de Alfa')
  assert.equal(fila.activo, 1)
})

test('categorías: la categoría creada queda asignada a la empresa que la creó', async () => {
  assert.equal((await filaDe('categorias', categoriaA.id)).tenant_id, A.tenantId)
})

// ── Unidades de medida ────────────────────────────────────────

test('unidades de medida: cada empresa recibe sus propias 13 unidades, con ids distintos', async () => {
  const a = (await t.api('GET', '/unidades-medida', { token: adminA })).data.data
  const b = (await t.api('GET', '/unidades-medida', { token: adminB })).data.data
  assert.equal(a.length, 13)
  assert.equal(b.length, 13)
  const idsA = new Set(a.map((u) => u.id))
  assert.ok(b.every((u) => !idsA.has(u.id)), 'las unidades de B no deben ser las de A')
})

// ── Tipos de servicio ─────────────────────────────────────────

test('tipos de servicio: B no ve el tipo creado por A', async () => {
  const b = await t.api('GET', '/tipos-servicio?buscar=secreto', { token: adminB })
  assert.equal(b.data.data.length, 0)
  const a = await t.api('GET', '/tipos-servicio?buscar=secreto', { token: adminA })
  assert.equal(a.data.data.length, 1)
})

test('tipos de servicio: B recibe 404 al editar o eliminar el de A, y este no cambia', async () => {
  assert.equal((await t.api('PUT', `/tipos-servicio/${tipoA.id}`, { token: adminB, body: { nombre: 'Hackeado' } })).status, 404)
  assert.equal((await t.api('DELETE', `/tipos-servicio/${tipoA.id}`, { token: adminB })).status, 404)
  const fila = await filaDe('tipos_servicio', tipoA.id)
  assert.equal(fila.nombre, 'Tipo secreto de Alfa')
  assert.equal(fila.activo, 1)
})

// ── Artículos ─────────────────────────────────────────────────

test('artículos: B no ve los artículos de A', async () => {
  const b = await t.api('GET', '/articulos', { token: adminB })
  assert.equal(b.data.data.length, 0)
  const a = await t.api('GET', '/articulos', { token: adminA })
  assert.equal(a.data.data.length, 1)
  assert.equal(a.data.data[0].precios.length, 1)
})

test('artículos: B recibe 404 al pedir, editar o eliminar un artículo de A, y este no cambia', async () => {
  assert.equal((await t.api('GET', `/articulos/${articuloA.id}`, { token: adminB })).status, 404)
  const unidadB = (await t.api('GET', '/unidades-medida', { token: adminB })).data.data[0]
  const catB = (await t.api('POST', '/categorias', { token: adminB, body: { nombre: 'Categoría de Beta' } })).data.data
  const put = await t.api('PUT', `/articulos/${articuloA.id}`, {
    token: adminB, body: { categoria_id: catB.id, nombre: 'Hackeado', unidad_medida_id: unidadB.id, precios: [] },
  })
  assert.equal(put.status, 404)
  assert.equal((await t.api('DELETE', `/articulos/${articuloA.id}`, { token: adminB })).status, 404)
  const fila = await filaDe('articulos', articuloA.id)
  assert.equal(fila.nombre, 'Artículo de Alfa')
  assert.equal(fila.activo, 1)
  const [[precios]] = await t.pool.query('SELECT COUNT(*) n FROM articulo_precios WHERE articulo_id = ?', [articuloA.id])
  assert.equal(precios.n, 1, 'los precios de A no deben borrarse')
})

test('artículos: B no puede crear un artículo apuntando a la categoría de A (400)', async () => {
  const unidadB = (await t.api('GET', '/unidades-medida', { token: adminB })).data.data[0]
  const r = await t.api('POST', '/articulos', {
    token: adminB, body: { categoria_id: categoriaA.id, nombre: 'Cruzado', unidad_medida_id: unidadB.id },
  })
  assert.equal(r.status, 400)
  assert.match(r.data.mensaje, /categoría/i)
})

test('artículos: B no puede usar una unidad de medida de A, ni en el artículo ni en sus precios (400)', async () => {
  const unidadA = (await t.api('GET', '/unidades-medida', { token: adminA })).data.data[0]
  const unidadB = (await t.api('GET', '/unidades-medida', { token: adminB })).data.data[0]
  const catB = (await t.api('GET', '/categorias', { token: adminB })).data.data[0]
  const enArticulo = await t.api('POST', '/articulos', {
    token: adminB, body: { categoria_id: catB.id, nombre: 'Cruzado 1', unidad_medida_id: unidadA.id },
  })
  assert.equal(enArticulo.status, 400)
  const enPrecio = await t.api('POST', '/articulos', {
    token: adminB,
    body: { categoria_id: catB.id, nombre: 'Cruzado 2', unidad_medida_id: unidadB.id,
            precios: [{ unidad_medida_id: unidadA.id, precio_unitario: 5 }] },
  })
  assert.equal(enPrecio.status, 400)
  const [[fila]] = await t.pool.query("SELECT COUNT(*) n FROM articulos WHERE nombre LIKE 'Cruzado%'")
  assert.equal(fila.n, 0, 'no debe quedar ningún artículo a medias')
})

test('artículos: dos empresas pueden usar el mismo código, pero no repetirlo dentro de una', async () => {
  const unidadB = (await t.api('GET', '/unidades-medida', { token: adminB })).data.data[0]
  const catB = (await t.api('GET', '/categorias', { token: adminB })).data.data[0]
  const cuerpo = { categoria_id: catB.id, nombre: 'Artículo de Beta', codigo: 'SKU-1', unidad_medida_id: unidadB.id }
  assert.equal((await t.api('POST', '/articulos', { token: adminB, body: cuerpo })).status, 201)
  const repetido = await t.api('POST', '/articulos', { token: adminB, body: { ...cuerpo, nombre: 'Otro' } })
  assert.equal(repetido.status, 400)
  assert.match(repetido.data.mensaje, /código/i)
})
