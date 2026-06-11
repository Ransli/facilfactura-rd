import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '../api/config'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario]   = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
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
