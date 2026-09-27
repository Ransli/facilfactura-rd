import './entorno.js'   // siempre primero: fija la base de pruebas antes de cargar la app
import { USUARIOS, reiniciarDatos } from './datos.js'

/**
 * Levanta la app en un puerto libre y devuelve las herramientas de una prueba de integración:
 *   const t = await iniciar()
 *   const { token } = await t.sesion('admin')
 *   const r = await t.api('GET', '/clientes', { token })
 *   await t.cerrar()
 */
export async function iniciar({ reiniciar = true } = {}) {
  const { default: app } = await import('../../app.js')
  const { default: pool } = await import('../../config/database.js')

  const [[{ bd }]] = await pool.query('SELECT DATABASE() AS bd')
  if (bd !== 'facilfactura_test') throw new Error(`Las pruebas apuntan a ${bd}, no a facilfactura_test`)
  if (reiniciar) await reiniciarDatos()

  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const base = `http://localhost:${servidor.address().port}/api`

  async function api(metodo, ruta, { token, body } = {}) {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    let data = null
    try { data = await res.json() } catch { /* respuesta sin cuerpo JSON */ }
    return { status: res.status, data }
  }

  async function sesion(rol) {
    const u = USUARIOS[rol]
    const r = await api('POST', '/auth/login', { body: { email: u.email, password: u.password } })
    if (r.status !== 200) throw new Error(`No se pudo iniciar sesión como ${rol}: ${r.status}`)
    return { token: r.data.token, usuario: r.data.usuario }
  }

  async function cerrar() {
    await new Promise((resolve) => servidor.close(resolve))
    await pool.end()
  }

  return { api, sesion, cerrar, pool, base }
}
