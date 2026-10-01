import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario]   = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // La consola master abre esta app con #impersonar=<token> (nunca como ?query, para que el token no
    // viaje en el Referer ni quede en ningún log del servidor). Se adopta como la sesión de este navegador,
    // igual que un login normal, y se limpia el fragmento de la URL enseguida.
    const enlaceImpersonacion = /^#impersonar=(.+)$/.exec(window.location.hash)
    if (enlaceImpersonacion) {
      const tokenImpersonado = enlaceImpersonacion[1]
      history.replaceState(null, '', window.location.pathname + window.location.search)
      localStorage.setItem('token', tokenImpersonado)   // para que api.get() lo use al pedir /auth/me
      api.get('/auth/me')
        .then((res) => login(tokenImpersonado, res.usuario))
        .catch(() => logout())
        .finally(() => setCargando(false))
      return
    }

    const token    = localStorage.getItem('token')
    const usuarioG = localStorage.getItem('usuario')

    if (token && usuarioG) {
      setUsuario(JSON.parse(usuarioG))
      api.get('/auth/me')
        .then(res => setUsuario(res.usuario))
        .catch(() => logout())
        .finally(() => setCargando(false))
    } else {
      setCargando(false)
    }
  }, [])

  function login(token, datosUsuario) {
    localStorage.setItem('token', token)
    localStorage.setItem('usuario', JSON.stringify(datosUsuario))
    setUsuario(datosUsuario)
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('usuario')
    // Sin esto el siguiente usuario aterriza en la vista del anterior,
    // y su factura a medio hacer sigue en el navegador.
    localStorage.removeItem('vista_activa')
    localStorage.removeItem('factura_borrador')
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
