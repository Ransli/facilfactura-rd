// Cliente de la consola master. Guarda su sesión aparte de la app de empresa (localStorage con otras claves:
// `master_token`/`master`), para que abrir la consola en una pestaña nunca cierre la sesión de una empresa
// abierta en otra, y viceversa.
const BASE_URL = 'http://localhost:3002/api/master'

const getToken = () => localStorage.getItem('master_token')

async function request(endpoint, options = {}) {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (res.status === 401 && endpoint !== '/auth/login') {
    localStorage.removeItem('master_token')
    localStorage.removeItem('master')
    window.location.reload()
    return
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.mensaje || 'Error en la solicitud')
  return data
}

export const masterApi = {
  get:    (endpoint)        => request(endpoint),
  post:   (endpoint, body)  => request(endpoint, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put:    (endpoint, body)  => request(endpoint, { method: 'PUT',  body: JSON.stringify(body ?? {}) }),
}

/** URL de la app de la empresa con el token de impersonación en un fragmento de la URL (nunca en el historial del servidor). */
export const urlDeImpersonacion = (token) => `http://localhost:5175/#impersonar=${token}`
