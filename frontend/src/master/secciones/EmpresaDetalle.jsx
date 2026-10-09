// Vista completa de una empresa (no un modal): la consola master necesita administrar, no solo asomarse.
// Se llega aquí desde Empresas, el Dashboard o Pagos/Cambios de plan (todos abren el mismo tenant_id).
import { useState, useEffect, useCallback } from 'react'
import { masterApi, urlDeImpersonacion } from '../masterApi'

const ESTADOS = {
  activo: { label: 'Activo', clase: 'badge-verde' }, prueba: { label: 'Prueba', clase: 'badge-azul' },
  pendiente_pago: { label: 'Pendiente de pago', clase: 'badge-naranja' }, suspendido: { label: 'Suspendido', clase: 'badge-rojo' },
  cancelado: { label: 'Cancelado', clase: 'badge-gris' }, exento: { label: 'Exento', clase: 'badge-azul' },
  pendiente: { label: 'Pendiente', clase: 'badge-gris' },
}
const dinero = (n) => `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO') : '—')
const PESTANAS = [
  { id: 'resumen', label: 'Resumen', icono: 'fa-solid fa-gauge' },
  { id: 'pagos', label: 'Pagos', icono: 'fa-solid fa-sack-dollar' },
  { id: 'historial', label: 'Historial', icono: 'fa-solid fa-clock-rotate-left' },
]

function BarraLimite({ etiqueta, actual, max }) {
  const ilimitado = max === -1
  const pct = ilimitado ? 0 : Math.min(100, Math.round((actual / Math.max(max, 1)) * 100))
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#556', marginBottom: 3 }}>
        <span>{etiqueta}</span>
        <span>{actual} / {ilimitado ? '∞' : max}</span>
      </div>
      {!ilimitado && (
        <div style={{ height: 6, borderRadius: 4, background: '#e8edf2', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: pct > 90 ? '#c0392b' : '#1555a5' }} />
        </div>
      )}
    </div>
  )
}

export default function EmpresaDetalle({ tenantId, onVolver, onCambio, volverALabel = 'empresas' }) {
  const [d, setD] = useState(null)
  const [planes, setPlanes] = useState([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pestana, setPestana] = useState('resumen')
  const [pago, setPago] = useState({ monto: '', metodo: 'transferencia', referencia: '' })
  const [motivo, setMotivo] = useState('')

  const cargar = useCallback(async () => {
    try {
      const [detalle, listaPlanes] = await Promise.all([
        masterApi.get(`/empresas/${tenantId}`), masterApi.get('/planes'),
      ])
      setD(detalle.data)
      setPlanes(listaPlanes.data.filter((p) => p.activo))
    } catch (err) { setError(err.message) }
  }, [tenantId])
  useEffect(() => { cargar() }, [cargar])

  async function accion(fn) {
    setOcupado(true); setError('')
    try { await fn(); await cargar(); onCambio?.() } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  const cambiarPlan = (planId) => accion(() => masterApi.put(`/empresas/${tenantId}/plan`, { plan_id: Number(planId) }))
  const cambiarEstado = (accionNombre) => accion(() => masterApi.post(`/empresas/${tenantId}/estado`, { accion: accionNombre, motivo }))
  const registrarPago = async (e) => {
    e.preventDefault()
    await accion(() => masterApi.post(`/empresas/${tenantId}/pagos`, { ...pago, monto: Number(pago.monto) }))
    setPago({ monto: '', metodo: 'transferencia', referencia: '' })
  }
  async function impersonar(modo) {
    setOcupado(true); setError('')
    try {
      const r = await masterApi.post(`/empresas/${tenantId}/impersonar`, { modo })
      window.open(urlDeImpersonacion(r.data.token), '_blank')
    } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  if (error && !d) return (
    <div>
      <BotonVolver onVolver={onVolver} etiqueta={volverALabel} />
      <div className="alerta-box alerta-danger"><i className="fas fa-circle-exclamation"></i>{error}</div>
    </div>
  )
  if (!d) return <div style={{ textAlign: 'center', padding: 60, color: '#aab' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: '1.6rem' }}></i></div>

  const est = ESTADOS[d.tenant.estado] || { label: d.tenant.estado, clase: 'badge-gris' }

  return (
    <div>
      <BotonVolver onVolver={onVolver} etiqueta={volverALabel} />

      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-building"></i> {d.tenant.nombre}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" disabled={ocupado} onClick={() => impersonar('ver')}><i className="fas fa-eye"></i> Entrar a ver</button>
          <button className="btn-primary" disabled={ocupado} onClick={() => impersonar('editar')}><i className="fas fa-pen"></i> Entrar a editar</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <span className={`badge ${est.clase}`}>{est.label}</span>
        <span style={{ color: '#667', fontSize: '0.88rem' }}>RNC: {d.tenant.rnc || '—'} · creada el {fechaCorta(d.tenant.created_at)}</span>
      </div>

      {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

      <div className="master-pestanas">
        {PESTANAS.map((p) => (
          <button key={p.id} className={`master-pestana${pestana === p.id ? ' activa' : ''}`} onClick={() => setPestana(p.id)}>
            <i className={p.icono}></i> {p.label}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="form-grid">
          <div className="vista-card">
            <h3 style={{ margin: '0 0 12px', color: '#3c1f6b', fontSize: '1rem' }}>Plan y acciones</h3>
            <div className="form-grupo" style={{ marginBottom: 14 }}>
              <label>Plan asignado</label>
              <select value={d.suscripcion.plan.id} disabled={ocupado} onChange={(e) => cambiarPlan(e.target.value)}>
                {planes.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {dinero(p.precio_mensual)}/mes</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
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
              style={{ width: '100%', border: '1px solid #d0d8e4', borderRadius: 6, padding: '6px 10px', fontSize: '0.85rem', boxSizing: 'border-box' }} />
          </div>

          <div className="vista-card">
            <h3 style={{ margin: '0 0 12px', color: '#3c1f6b', fontSize: '1rem' }}>Uso del plan</h3>
            <BarraLimite etiqueta="Usuarios" actual={d.limites.usuarios.actual} max={d.limites.usuarios.max} />
            <BarraLimite etiqueta="Clientes" actual={d.limites.clientes.actual} max={d.limites.clientes.max} />
            <BarraLimite etiqueta="e-CF este mes" actual={d.limites.ecf_mes.actual} max={d.limites.ecf_mes.max} />
            {d.suscripcion.enGracia && (
              <div className="alerta-box alerta-info" style={{ marginTop: 10 }}>
                <i className="fas fa-circle-info"></i> En período de gracia{d.suscripcion.motivo ? `: ${d.suscripcion.motivo}` : ''}.
              </div>
            )}
          </div>
        </div>
      )}

      {pestana === 'pagos' && (
        <div className="vista-card">
          <h3 style={{ margin: '0 0 12px', color: '#3c1f6b', fontSize: '1rem' }}>Registrar pago</h3>
          <form onSubmit={registrarPago} className="form-grid" style={{ marginBottom: 20 }}>
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

          <h3 style={{ margin: '0 0 12px', color: '#3c1f6b', fontSize: '1rem' }}>Pagos de esta empresa</h3>
          <div className="tabla-wrap">
            <table className="tabla-crud">
              <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Referencia</th><th>Estado</th></tr></thead>
              <tbody>
                {d.pagos.length === 0 ? (
                  <tr className="tabla-vacia-row"><td colSpan={5}>Sin pagos registrados</td></tr>
                ) : d.pagos.map((p, i) => (
                  <tr key={i}>
                    <td data-label="Fecha">{fechaCorta(p.fecha_pago)}</td>
                    <td data-label="Monto">{dinero(p.monto)}</td>
                    <td data-label="Método">{p.metodo}</td>
                    <td data-label="Referencia">{p.referencia || '—'}</td>
                    <td data-label="Estado"><span className="badge badge-verde">{p.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pestana === 'historial' && (
        <div className="vista-card">
          <h3 style={{ margin: '0 0 12px', color: '#3c1f6b', fontSize: '1rem' }}>Historial completo</h3>
          <div className="tabla-wrap">
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
      )}
    </div>
  )
}

function BotonVolver({ onVolver, etiqueta }) {
  return (
    <button type="button" className="login-volver-inicio" onClick={onVolver} style={{ marginBottom: 14 }}>
      <i className="fas fa-arrow-left"></i> Volver a {etiqueta}
    </button>
  )
}
