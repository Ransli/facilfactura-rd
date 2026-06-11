import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/config'
import './Login.css'

export default function Login() {
  const { login } = useAuth()
  const [form, setForm]         = useState({ email: '', password: '' })
  const [error, setError]       = useState('')
  const [cargando, setCargando] = useState(false)
  const [verPass, setVerPass]   = useState(false)

  function onChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) {
      setError('Completa todos los campos')
      return
    }
    setCargando(true)
    try {
      const res = await api.post('/auth/login', form)
      login(res.token, res.usuario)
    } catch (err) {
      setError(err.message || 'Credenciales incorrectas')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-fondo">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.svg" alt="Logo" />
          <h1>FácilFactura RD</h1>
        </div>

        <form onSubmit={onSubmit} className="login-form" noValidate>
          <div className="login-campo">
            <label htmlFor="email">
              <i className="fas fa-envelope"></i> Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              placeholder="usuario@correo.com"
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="login-campo">
            <label htmlFor="password">
              <i className="fas fa-lock"></i> Contraseña
            </label>
            <div className="login-input-pass">
              <input
                id="password"
                type={verPass ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={onChange}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-ver-pass"
                onClick={() => setVerPass(v => !v)}
                tabIndex={-1}
                title={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                <i className={`fas ${verPass ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              <i className="fas fa-circle-exclamation"></i> {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={cargando}>
            {cargando
              ? <><i className="fas fa-spinner fa-spin"></i> Entrando...</>
              : <><i className="fas fa-right-to-bracket"></i> Iniciar sesión</>
            }
          </button>
        </form>
      </div>
    </div>
  )
}
