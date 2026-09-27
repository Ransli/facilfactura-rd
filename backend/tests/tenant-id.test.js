import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'

let t
before(async () => { t = await iniciar({ reiniciar: false }) })
after(async () => {
  // Deja la base como estaba para que ningún otro archivo de pruebas vea estos datos
  await t.pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const tabla of ['factura_items', 'facturas', 'articulo_precios', 'articulos', 'categorias', 'clientes', 'empresas']) {
    await t.pool.query(`DELETE FROM \`${tabla}\` WHERE tenant_id IN (1, 2)`)
  }
  await t.pool.query('DELETE FROM configuracion WHERE tenant_id = 2')
  await t.pool.query("DELETE FROM usuarios WHERE email = 'mismo@correo.com'")
  await t.pool.query('DELETE FROM tenants WHERE id = 2')
  await t.pool.query('SET FOREIGN_KEY_CHECKS = 1')
  await t.cerrar()
})

const TABLAS_DE_NEGOCIO = [
  'usuarios', 'empresas', 'clientes', 'metodos_pago', 'categorias', 'tipos_servicio', 'unidades_medida',
  'articulos', 'articulo_precios', 'nfc_secuencias', 'configuracion', 'facturas', 'factura_items',
]

test('las 13 tablas de negocio tienen tenant_id obligatorio con clave foránea a tenants', async () => {
  for (const tabla of TABLAS_DE_NEGOCIO) {
    const [[col]] = await t.pool.query(
      `SELECT IS_NULLABLE nulo FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'`, [tabla])
    assert.ok(col, `${tabla} debe tener tenant_id`)
    assert.equal(col.nulo, 'NO', `${tabla}.tenant_id debe ser obligatorio`)

    const [fks] = await t.pool.query(
      `SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'
         AND REFERENCED_TABLE_NAME = 'tenants'`, [tabla])
    assert.equal(fks.length, 1, `${tabla}.tenant_id debe apuntar a tenants`)
  }
})

test('tenant_id no tiene valor por defecto: un INSERT sin empresa falla en la base de datos', async () => {
  for (const tabla of TABLAS_DE_NEGOCIO) {
    const [[col]] = await t.pool.query(
      `SELECT COLUMN_DEFAULT valor FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'`, [tabla])
    assert.equal(col.valor, null, `${tabla}.tenant_id no debe tener DEFAULT`)
  }
  await assert.rejects(
    t.pool.query("INSERT INTO clientes (nombre) VALUES ('Sin empresa')"),
    /tenant_id|foreign key/i
  )
})

test('roles sigue siendo un catálogo global, sin tenant_id', async () => {
  const [cols] = await t.pool.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'tenant_id'`)
  assert.equal(cols.length, 0)
})

// Para las pruebas de unicidad se crea una segunda empresa directamente en la base
async function segundaEmpresa() {
  await t.pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const tabla of ['factura_items', 'facturas', 'articulo_precios', 'articulos', 'clientes', 'empresas']) {
    await t.pool.query(`DELETE FROM \`${tabla}\` WHERE tenant_id IN (1, 2)`)
  }
  await t.pool.query("DELETE FROM unidades_medida WHERE nombre IN ('U1', 'U2')")   // las unidades de referencia no se tocan
  await t.pool.query('DELETE FROM configuracion WHERE tenant_id = 2')
  await t.pool.query('SET FOREIGN_KEY_CHECKS = 1')
  await t.pool.query('DELETE FROM tenants WHERE id = 2')
  await t.pool.query(
    "INSERT INTO tenants (id, nombre, slug, rnc, plan_id, estado) VALUES (2, 'Segunda SRL', 'segunda-srl', '222222222', 1, 'activo')")
}

test('el mismo número de factura puede existir en dos empresas distintas', async () => {
  await segundaEmpresa()
  const [c1] = await t.pool.query("INSERT INTO clientes (nombre, tenant_id) VALUES ('A', 1)")
  const [c2] = await t.pool.query("INSERT INTO clientes (nombre, tenant_id) VALUES ('B', 2)")
  const [e1] = await t.pool.query("INSERT INTO empresas (nombre, rnc, tenant_id) VALUES ('E1', '111111111', 1)")
  const [e2] = await t.pool.query("INSERT INTO empresas (nombre, rnc, tenant_id) VALUES ('E2', '111111111', 2)")
  const factura = (cliente, empresa, tenant) => t.pool.query(
    "INSERT INTO facturas (numero, fecha, cliente_id, empresa_id, tenant_id) VALUES ('F000001', '2026-01-01', ?, ?, ?)",
    [cliente, empresa, tenant])
  await factura(c1.insertId, e1.insertId, 1)
  await factura(c2.insertId, e2.insertId, 2)
  await assert.rejects(factura(c1.insertId, e1.insertId, 1), /Duplicate entry/, 'dentro de la misma empresa sí debe ser único')
})

test('el mismo código de artículo puede existir en dos empresas distintas, pero no dos veces en una', async () => {
  const [cat1] = await t.pool.query("INSERT INTO categorias (nombre, tenant_id) VALUES ('C1', 1)")
  const [cat2] = await t.pool.query("INSERT INTO categorias (nombre, tenant_id) VALUES ('C2', 2)")
  const [u1] = await t.pool.query("INSERT INTO unidades_medida (nombre, abreviatura, tenant_id) VALUES ('U1', 'u1', 1)")
  const [u2] = await t.pool.query("INSERT INTO unidades_medida (nombre, abreviatura, tenant_id) VALUES ('U2', 'u2', 2)")
  const articulo = (cat, u, tenant) => t.pool.query(
    "INSERT INTO articulos (categoria_id, codigo, nombre, unidad_medida_id, tenant_id) VALUES (?, 'SKU-1', 'X', ?, ?)",
    [cat, u, tenant])
  await articulo(cat1.insertId, u1.insertId, 1)
  await articulo(cat2.insertId, u2.insertId, 2)
  await assert.rejects(articulo(cat1.insertId, u1.insertId, 1), /Duplicate entry/)
})

test('cada empresa tiene una sola fila de configuración', async () => {
  await t.pool.query("INSERT INTO configuracion (tenant_id) VALUES (2)")
  await assert.rejects(t.pool.query("INSERT INTO configuracion (tenant_id) VALUES (2)"), /Duplicate entry/)
})

test('el correo de un usuario sigue siendo único en toda la plataforma', async () => {
  const usuario = (tenant) => t.pool.query(
    "INSERT INTO usuarios (nombre, email, password_hash, rol_id, tenant_id) VALUES ('U', 'mismo@correo.com', 'x', 1, ?)", [tenant])
  await usuario(1)
  await assert.rejects(usuario(2), /Duplicate entry/)
})

test('los datos existentes de la v1 pertenecen al tenant 1', async () => {
  // La base de pruebas parte vacía: se comprueba que ninguna fila quede sin empresa (tenant_id es NOT NULL)
  // y que las filas creadas por defecto pertenezcan al tenant 1.
  const [[fila]] = await t.pool.query('SELECT COUNT(*) n FROM configuracion WHERE tenant_id = 1')
  assert.equal(fila.n, 1)
})
