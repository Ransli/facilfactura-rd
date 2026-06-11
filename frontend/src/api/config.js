const BASE_URL = 'http://localhost:3002/api'

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

  if (res.status === 401) {
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
  post:   (endpoint, body)   => request(endpoint, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (endpoint, body)   => request(endpoint, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (endpoint)         => request(endpoint, { method: 'DELETE' }),

  upload: (endpoint, formData) => {
    const token = getToken()
    return fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(r => r.json())
  },
}
