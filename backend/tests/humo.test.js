import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from './helpers/contexto.js'

let t
before(async () => { t = await iniciar() })
after(async () => { await t.cerrar() })

test('la app responde en /api/health', async () => {
  const r = await t.api('GET', '/health')
  assert.equal(r.status, 200)
  assert.equal(r.data.status, 'ok')
})

test('las pruebas corren sobre facilfactura_test y no sobre la base real', async () => {
  const [[{ bd }]] = await t.pool.query('SELECT DATABASE() AS bd')
  assert.equal(bd, 'facilfactura_test')
})

test('el administrador de la base de pruebas puede iniciar sesión', async () => {
  const { usuario } = await t.sesion('admin')
  assert.equal(usuario.rol, 'admin')
})
