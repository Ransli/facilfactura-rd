import { useState } from 'react'
import { masterApi } from '../masterApi'
import '../../vistas/Login.css'

export default function MasterLogin({ onEntrar }) {
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.email || !form.password) { setError('Completa todos los campos'); return }
    setCargando(true); setError('')
    try {
      const r = await masterApi.post('/auth/login', form)
      localStorage.setItem('master_token', r.token)
      localStorage.setItem('master', JSON.stringify(r.master))
      onEntrar(r.master)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-fondo">
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.svg" alt="Logo" />
          <h1>Consola Master</h1>
        </div>
        <form onSubmit={onSubmit} className="login-form" noValidate>
          <div className="login-campo">
            <label htmlFor="email"><i className="fas fa-envelope"></i> Correo electrónico</label>
            <input id="email" type="email" value={form.email} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="master@facilfactura.com" />
          </div>
          <div className="login-campo">
            <label htmlFor="password"><i className="fas fa-lock"></i> Contraseña</label>
            <input id="password" type="password" value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Contraseña" />
          </div>
          {error && <div className="alerta-box alerta-danger"><i className="fas fa-circle-exclamation"></i>{error}</div>}
          <button type="submit" className="login-btn" disabled={cargando}>
            {cargando ? <><i className="fas fa-spinner fa-spin"></i> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
