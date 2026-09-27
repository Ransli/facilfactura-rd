import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { api } from '../api/config'
import { formatearRncCedula, formatearTelefono, validarRncCedula, validarEmail, validarTelefono } from '../utils/formato'
import './Login.css'
import './Registro.css'

const PASOS = ['Tu empresa', 'Tu plan', 'Tu cuenta']
const MIN_CLAVE = 8

const dinero = (n) => `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 0 })}`
const limite = (n) => (n === -1 ? 'Ilimitados' : n.toLocaleString('es-DO'))

// Asistente de alta de una empresa: 1) datos, 2) plan, 3) administrador. Al terminar, el administrador ya tiene sesión.
// El paso 1 devuelve un token de registro que los pasos 2 y 3 mandan en la cabecera Authorization.
export default function Registro({ onVolver }) {
  const { login } = useAuth()
  const [paso, setPaso] = useState(0)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [tokenRegistro, setTokenRegistro] = useState('')
  const [planes, setPlanes] = useState([])
  const [planElegido, setPlanElegido] = useState(null)   // respuesta del paso 2
  const [empresa, setEmpresa] = useState({ nombre: '', rnc: '', correo: '', telefono: '', direccion: '' })
  const [admin, setAdmin] = useState({ nombre: '', email: '', password: '', confirmar: '' })
  const [verClave, setVerClave] = useState(false)

  useEffect(() => {
    if (paso !== 1 || planes.length) return
    api.get('/suscripcion/planes').then((res) => setPlanes(res.data)).catch((e) => setError(e.message))
  }, [paso, planes.length])

  const cabecera = { headers: { Authorization: `Bearer ${tokenRegistro}` }, sinRedireccion: true }

  function cambiarEmpresa(e) {
    const { name, value } = e.target
    const v = name === 'rnc' ? formatearRncCedula(value) : name === 'telefono' ? formatearTelefono(value) : value
    setEmpresa((f) => ({ ...f, [name]: v }))
    setError('')
  }

  function cambiarAdmin(e) {
    setAdmin((f) => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function enviarEmpresa(e) {
    e.preventDefault()
    const faltan = Object.entries(empresa).find(([, v]) => !String(v).trim())
    if (faltan) return setError('Completa todos los campos')
    const invalido = validarRncCedula(empresa.rnc) || validarEmail(empresa.correo) || validarTelefono(empresa.telefono)
    if (invalido) return setError(invalido)

    setEnviando(true)
    try {
      const res = await api.post('/registro/empresa', empresa, { sinRedireccion: true })
      setTokenRegistro(res.token_registro)
      setPaso(1)
    } catch (err) { setError(err.message) }
    finally { setEnviando(false) }
  }

  async function elegirPlan(plan) {
    setEnviando(true)
    setError('')
    try {
      const res = await api.post('/registro/plan', { plan_id: plan.id }, cabecera)
      setPlanElegido(res)
      setPaso(2)
    } catch (err) { setError(err.message) }
    finally { setEnviando(false) }
  }

  async function enviarAdmin(e) {
    e.preventDefault()
    if (!admin.nombre.trim() || !admin.email.trim() || !admin.password) return setError('Completa todos los campos')
    const invalido = validarEmail(admin.email)
    if (invalido) return setError(invalido)
    if (admin.password.length < MIN_CLAVE) return setError(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres`)
    if (admin.password !== admin.confirmar) return setError('Las contraseñas no coinciden')

    setEnviando(true)
    try {
      const res = await api.post('/registro/administrador',
        { nombre: admin.nombre, email: admin.email, password: admin.password }, cabecera)
      login(res.token, res.usuario)      // el administrador queda dentro del sistema
    } catch (err) { setError(err.message) }
    finally { setEnviando(false) }
  }

  return (
    <div className="login-fondo">
      <div className={`login-card registro-card${paso === 1 ? ' ancha' : ''}`}>
        <div className="login-logo">
          <img src="/logo.svg" alt="Logo" />
          <h1>Crea tu cuenta en FácilFactura RD</h1>
        </div>

        <ol className="registro-pasos" aria-label="Progreso del registro">
          {PASOS.map((nombre, i) => (
            <li key={nombre} className={i === paso ? 'activo' : i < paso ? 'hecho' : ''} aria-current={i === paso ? 'step' : undefined}>
              <span>{i < paso ? <i className="fas fa-check"></i> : i + 1}</span>{nombre}
            </li>
          ))}
        </ol>

        {paso === 0 && (
          <form onSubmit={enviarEmpresa} className="login-form" noValidate>
            <Campo id="nombre" etiqueta="Nombre de la empresa" name="nombre" value={empresa.nombre} onChange={cambiarEmpresa} autoFocus />
            <Campo id="rnc" etiqueta="RNC o cédula" name="rnc" value={empresa.rnc} onChange={cambiarEmpresa} placeholder="130-88170-7" />
            <Campo id="correo" etiqueta="Correo de la empresa" name="correo" type="email" value={empresa.correo} onChange={cambiarEmpresa} />
            <Campo id="telefono" etiqueta="Teléfono" name="telefono" value={empresa.telefono} onChange={cambiarEmpresa} placeholder="809-555-0000" />
            <Campo id="direccion" etiqueta="Dirección" name="direccion" value={empresa.direccion} onChange={cambiarEmpresa} />
            <Error mensaje={error} />
            <button type="submit" className="login-btn" disabled={enviando}>
              {enviando ? <><i className="fas fa-spinner fa-spin"></i> Registrando...</> : 'Continuar'}
            </button>
          </form>
        )}

        {paso === 1 && (
          <div>
            <p className="registro-ayuda">Elige el plan con el que empezar. Puedes cambiarlo después.</p>
            <div className="registro-planes">
              {planes.map((p) => (
                <article key={p.id} className={`plan-tarjeta${p.es_plan_prueba ? ' gratis' : ''}`}>
                  <h3>{p.nombre}</h3>
                  <p className="plan-precio">{p.es_plan_prueba ? 'Gratis' : <>{dinero(p.precio_mensual)}<small>/mes</small></>}</p>
                  {p.es_plan_prueba && <p className="plan-nota">{p.dias_prueba} días de prueba, sin tarjeta</p>}
                  <p className="plan-desc">{p.descripcion}</p>
                  <ul>
                    <li>{limite(p.max_usuarios)} usuarios</li>
                    <li>{limite(p.max_clientes)} clientes</li>
                    <li>{limite(p.max_ecf_mes)} e-CF al mes</li>
                  </ul>
                  <button type="button" className="login-btn" disabled={enviando} onClick={() => elegirPlan(p)}>
                    {p.es_plan_prueba ? 'Empezar gratis' : 'Elegir plan'}
                  </button>
                </article>
              ))}
            </div>
            <Error mensaje={error} />
          </div>
        )}

        {paso === 2 && (
          <form onSubmit={enviarAdmin} className="login-form" noValidate>
            <p className="registro-ayuda">
              Plan <strong>{planElegido?.plan?.nombre}</strong>
              {planElegido?.dias_para_pagar ? `: tendrás ${planElegido.dias_para_pagar} días para realizar el pago.` : ': tu prueba comienza hoy.'}
            </p>
            <Campo id="anombre" etiqueta="Tu nombre" name="nombre" value={admin.nombre} onChange={cambiarAdmin} autoFocus />
            <Campo id="aemail" etiqueta="Tu correo (con él iniciarás sesión)" name="email" type="email" value={admin.email} onChange={cambiarAdmin} />
            <Campo id="apass" etiqueta={`Contraseña (mínimo ${MIN_CLAVE} caracteres)`} name="password" type={verClave ? 'text' : 'password'}
              value={admin.password} onChange={cambiarAdmin} autoComplete="new-password" />
            <Campo id="aconf" etiqueta="Repite la contraseña" name="confirmar" type={verClave ? 'text' : 'password'}
              value={admin.confirmar} onChange={cambiarAdmin} autoComplete="new-password" />
            <label className="registro-ver-clave">
              <input type="checkbox" checked={verClave} onChange={(e) => setVerClave(e.target.checked)} /> Mostrar contraseñas
            </label>
            <Error mensaje={error} />
            <button type="submit" className="login-btn" disabled={enviando}>
              {enviando ? <><i className="fas fa-spinner fa-spin"></i> Creando tu cuenta...</> : 'Crear cuenta y entrar'}
            </button>
          </form>
        )}

        <button type="button" className="registro-volver" onClick={onVolver}>
          <i className="fas fa-arrow-left"></i> Ya tengo una cuenta
        </button>
      </div>
    </div>
  )
}

function Campo({ id, etiqueta, ...props }) {
  return (
    <div className="login-campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} {...props} />
    </div>
  )
}

function Error({ mensaje }) {
  if (!mensaje) return null
  return <div className="login-error" role="alert"><i className="fas fa-circle-exclamation"></i> {mensaje}</div>
}
