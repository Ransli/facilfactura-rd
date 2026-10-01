import { useState, useEffect, useCallback } from 'react'
import { masterApi, urlDeImpersonacion } from './masterApi'
import '../vistas/Login.css'
import '../vistas/vistas.css'

const ESTADOS = {
  activo:          { label: 'Activo',           clase: 'badge-verde' },
  prueba:          { label: 'Prueba',           clase: 'badge-azul' },
  pendiente_pago:  { label: 'Pendiente de pago', clase: 'badge-naranja' },
  suspendido:      { label: 'Suspendido',        clase: 'badge-rojo' },
  cancelado:       { label: 'Cancelado',         clase: 'badge-gris' },
  exento:          { label: 'Exento',            clase: 'badge-azul' },
}

const dinero = (n) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO') : '—')

// ── Login ─────────────────────────────────────────────────────

function MasterLogin({ onEntrar }) {
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
          <button type="submit" className="login-boton" disabled={cargando}>
            {cargando ? <><i className="fas fa-spinner fa-spin"></i> Entrando...</> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Detalle de una empresa ──────────────────────────────────────

function DetalleEmpresa({ tenantId, planes, onCerrar, onCambio }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pago, setPago] = useState({ monto: '', metodo: 'transferencia', referencia: '' })
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    try { setD((await masterApi.get(`/empresas/${tenantId}`)).data) } catch (err) { setError(err.message) }
  }, [tenantId])
  useEffect(() => { cargar() }, [cargar])

  async function accion(fn) {
    setOcupado(true); setError('')
    try { await fn(); await cargar(); onCambio() } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  const cambiarPlan = (planId) => accion(() => masterApi.put(`/empresas/${tenantId}/plan`, { plan_id: Number(planId) }))
  const cambiarEstado = (accionNombre) => accion(() => masterApi.post(`/empresas/${tenantId}/estado`, { accion: accionNombre, motivo }))
  const registrarPago = async (e) => {
    e.preventDefault()
    const enviado = { ...pago }
    await accion(() => masterApi.post(`/empresas/${tenantId}/pagos`, { ...enviado, monto: Number(enviado.monto) }))
    setPago({ monto: '', metodo: 'transferencia', referencia: '' })
  }
  async function impersonar(modo) {
    setOcupado(true); setError('')
    try {
      const r = await masterApi.post(`/empresas/${tenantId}/impersonar`, { modo })
      window.open(urlDeImpersonacion(r.data.token), '_blank')
    } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  if (!d) return null
  const est = ESTADOS[d.tenant.estado] || { label: d.tenant.estado, clase: 'badge-gris' }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box modal-lg">
        <div className="modal-header">
          <h3><i className="fas fa-building"></i> {d.tenant.nombre}</h3>
          <button className="modal-cerrar" onClick={onCerrar}><i className="fas fa-xmark"></i></button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <span className={`badge ${est.clase}`}>{est.label}</span>
          <span style={{ color: '#667', fontSize: '0.88rem' }}>RNC: {d.tenant.rnc || '—'} · creada el {fechaCorta(d.tenant.created_at)}</span>
        </div>

        {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

        <div className="form-grid">
          <div className="form-grupo">
            <label>Plan</label>
            <select value={d.suscripcion.plan.id} disabled={ocupado} onChange={(e) => cambiarPlan(e.target.value)}>
              {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre} — RD$ {dinero(p.precio_mensual)}/mes</option>)}
            </select>
          </div>
          <div className="form-grupo">
            <label>Uso</label>
            <div style={{ fontSize: '0.85rem', color: '#556' }}>
              Usuarios: {d.limites.usuarios.actual}/{d.limites.usuarios.max === -1 ? '∞' : d.limites.usuarios.max} ·
              {' '}Clientes: {d.limites.clientes.actual}/{d.limites.clientes.max === -1 ? '∞' : d.limites.clientes.max} ·
              {' '}e-CF/mes: {d.limites.ecf_mes.actual}/{d.limites.ecf_mes.max === -1 ? '∞' : d.limites.ecf_mes.max}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0' }}>
          <button className="btn-secondary" disabled={ocupado} onClick={() => impersonar('ver')}><i className="fas fa-eye"></i> Entrar a ver</button>
          <button className="btn-secondary" disabled={ocupado} onClick={() => impersonar('editar')}><i className="fas fa-pen"></i> Entrar a editar</button>
          {d.tenant.estado !== 'suspendido' && (
            <button className="btn-secondary" style={{ color: '#a05e00' }} disabled={ocupado} onClick={() => cambiarEstado('suspender')}>
              <i className="fas fa-pause"></i> Suspender
            </button>
          )}
          {d.tenant.estado === 'suspendido' && (
            <button className="btn-secondary" style={{ color: '#1a7a45' }} disabled={ocupado} onClick={() => cambiarEstado('reactivar')}>
              <i className="fas fa-play"></i> Reactivar
            </button>
          )}
          {d.tenant.estado !== 'cancelado' && (
            <button className="btn-secondary" style={{ color: '#9b2323' }} disabled={ocupado} onClick={() => cambiarEstado('cancelar')}>
              <i className="fas fa-ban"></i> Cancelar
            </button>
          )}
          {d.tenant.estado !== 'exento' ? (
            <button className="btn-secondary" disabled={ocupado} onClick={() => cambiarEstado('exentar')}><i className="fas fa-gift"></i> Marcar exenta</button>
          ) : (
            <button className="btn-secondary" disabled={ocupado} onClick={() => cambiarEstado('quitar_exencion')}><i className="fas fa-gift"></i> Quitar exención</button>
          )}
        </div>
        <input placeholder="Motivo (opcional, para suspender/cancelar/exentar)" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          style={{ width: '100%', border: '1px solid #d0d8e4', borderRadius: 6, padding: '6px 10px', fontSize: '0.85rem', marginBottom: 18 }} />

        <h4 style={{ margin: '0 0 8px', color: '#17406d' }}>Registrar pago</h4>
        <form onSubmit={registrarPago} className="form-grid" style={{ marginBottom: 18 }}>
          <div className="form-grupo">
            <label>Monto (RD$)</label>
            <input type="number" min="0.01" step="0.01" required value={pago.monto} onChange={(e) => setPago((p) => ({ ...p, monto: e.target.value }))} />
          </div>
          <div className="form-grupo">
            <label>Método</label>
            <select value={pago.metodo} onChange={(e) => setPago((p) => ({ ...p, metodo: e.target.value }))}>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>
          <div className="form-grupo col-span-2">
            <label>Referencia (opcional)</label>
            <input value={pago.referencia} onChange={(e) => setPago((p) => ({ ...p, referencia: e.target.value }))} />
          </div>
          <div className="form-grupo col-span-2">
            <button type="submit" className="btn-primary" disabled={ocupado}><i className="fas fa-floppy-disk"></i> Registrar pago</button>
          </div>
        </form>

        <h4 style={{ margin: '0 0 8px', color: '#17406d' }}>Historial</h4>
        <div className="tabla-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
          <table className="tabla-crud">
            <thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th><th>Responsable</th></tr></thead>
            <tbody>
              {d.historial.length === 0 ? (
                <tr className="tabla-vacia-row"><td colSpan={4}>Sin movimientos</td></tr>
              ) : d.historial.slice().reverse().map((h, i) => (
                <tr key={i}>
                  <td data-label="Fecha">{fechaCorta(h.created_at)}</td>
                  <td data-label="Acción">{h.accion}</td>
                  <td data-label="Detalle">{h.detalle || '—'}</td>
                  <td data-label="Responsable">{h.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Panel principal ──────────────────────────────────────────

export default function MasterApp() {
  const [master, setMaster] = useState(() => {
    const guardado = localStorage.getItem('master')
    return guardado ? JSON.parse(guardado) : null
  })
  const [empresas, setEmpresas] = useState([])
  const [planes, setPlanes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [detalleId, setDetalleId] = useState(null)

  const cargar = useCallback(async () => {
    if (!master) return
    setCargando(true)
    try {
      const [emp, cfg] = await Promise.all([masterApi.get('/empresas'), fetch('http://localhost:3002/api/suscripcion/planes').then((r) => r.json())])
      setEmpresas(emp.data)
      setPlanes(cfg.data || [])
    } catch { /* silencioso: masterApi ya recarga la página en un 401 */ }
    finally { setCargando(false) }
  }, [master])

  useEffect(() => { cargar() }, [cargar])

  function salir() {
    localStorage.removeItem('master_token')
    localStorage.removeItem('master')
    setMaster(null)
  }

  if (!master) return <MasterLogin onEntrar={setMaster} />

  const lista = empresas.filter((e) => !buscar || e.nombre.toLowerCase().includes(buscar.toLowerCase()) || e.rnc?.includes(buscar))

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-user-shield"></i> Consola Master</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#556', fontSize: '0.9rem' }}>{master.nombre}</span>
          <button className="btn-secondary" onClick={salir}><i className="fas fa-right-from-bracket"></i> Salir</button>
        </div>
      </div>

      <input placeholder="Buscar por nombre o RNC..." value={buscar} onChange={(e) => setBuscar(e.target.value)}
        style={{ width: '100%', border: '1px solid #d0d8e4', borderRadius: 8, padding: '8px 12px', marginBottom: 16, boxSizing: 'border-box' }} />

      <div className="vista-card" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table className="tabla-crud">
            <thead>
              <tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Uso</th><th>Creada</th><th className="col-acciones">Acciones</th></tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#aab' }}><i className="fas fa-spinner fa-spin"></i></td></tr>
              ) : lista.length === 0 ? (
                <tr className="tabla-vacia-row"><td colSpan={6}><i className="fas fa-building"></i>Sin empresas</td></tr>
              ) : lista.map((e) => {
                const est = ESTADOS[e.estado] || { label: e.estado, clase: 'badge-gris' }
                return (
                  <tr key={e.tenant_id} style={{ cursor: 'pointer' }} onClick={() => setDetalleId(e.tenant_id)}>
                    <td data-label="Empresa"><strong>{e.nombre}</strong><div style={{ fontSize: '0.78rem', color: '#99a' }}>{e.rnc || '—'}</div></td>
                    <td data-label="Plan">{e.plan.nombre}</td>
                    <td data-label="Estado"><span className={`badge ${est.clase}`}>{est.label}</span></td>
                    <td data-label="Uso" style={{ fontSize: '0.82rem' }}>
                      {e.uso.usuarios.actual}u · {e.uso.clientes.actual}c · {e.uso.ecf_mes.actual} e-CF/mes
                    </td>
                    <td data-label="Creada">{fechaCorta(e.creada)}</td>
                    <td data-label="Acciones" className="col-acciones">
                      <button className="btn-mini" onClick={(ev) => { ev.stopPropagation(); setDetalleId(e.tenant_id) }}>
                        <i className="fas fa-arrow-up-right-from-square"></i>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detalleId && (
        <DetalleEmpresa tenantId={detalleId} planes={planes} onCerrar={() => setDetalleId(null)} onCambio={cargar} />
      )}
    </div>
  )
}
