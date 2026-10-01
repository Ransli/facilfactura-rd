// En desarrollo apunta al backend local; en producción se fija con VITE_API_URL en el .env del build
// (ver .env.production.example) — así el mismo código sirve en cualquier servidor sin tocarlo.
export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'
// Origen del backend sin el /api final: para servir archivos que no pasan por la API (p. ej. /uploads/logo.png).
export const API_ORIGIN = BASE_URL.replace(/\/api\/?$/, '')

function getToken() {
  return localStorage.getItem('token')
}

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

  const data = await res.json()

  // El registro de empresas usa su propio token: un 401 ahí es un mensaje, no un cierre de sesión
  if (res.status === 401 && !options.sinRedireccion) {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    window.location.href = '/'
    return
  }

  if (!res.ok) {
    throw new Error(data.mensaje || 'Error en la solicitud')
  }

  return data
}

export const api = {
  get:    (endpoint)         => request(endpoint),
  post:   (endpoint, body, opciones = {}) => request(endpoint, { method: 'POST', body: JSON.stringify(body), ...opciones }),
  put:    (endpoint, body)   => request(endpoint, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (endpoint)         => request(endpoint, { method: 'DELETE' }),

  upload: async (endpoint, formData) => {
    const token = getToken()
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })

    if (res.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('usuario')
      window.location.href = '/'
      return
    }

    // Un error no controlado del servidor responde HTML, no JSON.
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      throw new Error(data.mensaje || 'No se pudo subir el archivo')
    }

    return data
  },
}
