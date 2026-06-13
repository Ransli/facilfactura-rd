import { useState, useEffect } from 'react'
import { api } from '../api/config'
import './vistas.css'

const FORM_VACIO = { tipo_ncf: 'B01', descripcion: '', desde: '', hasta: '', fecha_vencimiento: '' }

const TIPOS_NCF = [
  { valor: 'B01', label: 'B01 — Crédito Fiscal' },
  { valor: 'B02', label: 'B02 — Consumidor Final' },
  { valor: 'B14', label: 'B14 — Regímenes Especiales' },
  { valor: 'B15', label: 'B15 — Gubernamental' },
  { valor: 'B16', label: 'B16 — Proveedores Informales' },
]

export default function NFC() {
  const [secuencias, setSecuencias] = useState([])
  const [activa, setActiva]         = useState(null)
  const [cargando, setCargando]     = useState(true)
  const [modal, setModal]           = useState(false)
  const [form, setForm]             = useState(FORM_VACIO)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const [lista, act] = await Promise.all([
        api.get('/nfc'),
        api.get('/nfc/activa').catch(() => ({ data: null })),
      ])
      setSecuencias(lista.data)
      setActiva(act.data || null)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }

  useEffect(() => { cargar() }, [])

  function onChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setError('')
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.tipo_ncf || !form.desde || !form.hasta) { setError('Tipo, Desde y Hasta son requeridos'); return }
    if (Number(form.desde) >= Number(form.hasta))     { setError('"Desde" debe ser menor que "Hasta"'); return }
    setGuardando(true)
    try {
      await api.post('/nfc', form)
      setModal(false); setForm(FORM_VACIO); cargar()
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  const pct = s => s.hasta > 0 ? Math.round((s.ultimo_usado / s.hasta) * 100) : 0
  const colorBarra = p => p >= 90 ? '#c0392b' : p >= 70 ? '#e67e22' : '#27ae60'

  return (
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-barcode"></i> Secuencias NCF</h2>
        <button className="btn-primary" onClick={() => { setForm(FORM_VACIO); setError(''); setModal(true) }}>
          <i className="fas fa-plus"></i> Nueva secuencia
        </button>
      </div>

      {activa && (
        <div style={{ background: activa.ultimo_usado >= activa.alerta_desde ? '#fff8e1' : '#e8f4ff',
                      border: `1px solid ${activa.ultimo_usado >= activa.alerta_desde ? '#ffe082' : '#b6d9f7'}`,
                      borderRadius: 12, padding: '18px 20px', marginBottom: 22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
            <div>
              <div style={{ fontWeight:700, fontSize:'1.05rem', color:'#17406d', marginBottom:4 }}>
                <i className="fas fa-circle-check" style={{ color:'#27ae60', marginRight:8 }}></i>
                Secuencia activa: <span style={{ fontFamily:'monospace' }}>{activa.tipo_ncf}</span>
              </div>
              <div style={{ fontSize:'0.88rem', color:'#556' }}>{activa.descripcion}</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'1.1rem', fontWeight:700, color: activa.ultimo_usado >= activa.alerta_desde ? '#b45309' : '#17406d' }}>
                {activa.disponibles} disponibles
              </div>
              <div style={{ fontSize:'0.82rem', color:'#778' }}>
                Usados: {activa.ultimo_usado} / {activa.hasta}
              </div>
            </div>
          </div>
          <div style={{ marginTop:12, background:'#e0e8f0', borderRadius:6, height:10, overflow:'hidden' }}>
            <div style={{ width:`${pct(activa)}%`, background: colorBarra(pct(activa)), height:'100%', borderRadius:6, transition:'width 0.4s' }}></div>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', color:'#778', marginTop:4 }}>
            <span>Desde: {activa.desde}</span>
            <span style={{ fontWeight:600, color: colorBarra(pct(activa)) }}>{pct(activa)}% usado</span>
            <span>Hasta: {activa.hasta}</span>
          </div>
          {activa.ultimo_usado >= activa.alerta_desde && (
            <div className="alerta-box alerta-warning" style={{ marginTop:12, marginBottom:0 }}>
              <i className="fas fa-triangle-exclamation"></i>
              <div>
                <strong>¡Atención!</strong> Te quedan solo <strong>{activa.disponibles}</strong> comprobantes fiscales.
                Solicita una nueva secuencia NCF a la DGII antes de agotarlos.
              </div>
            </div>
          )}
        </div>
      )}

      {!activa && !cargando && (
        <div className="alerta-box alerta-danger" style={{ marginBottom:22 }}>
          <i className="fas fa-circle-xmark"></i>
          No hay secuencia NCF activa. Registra una para poder emitir facturas.
        </div>
      )}

      <div className="tabla-wrap">
        <table className="tabla-crud">
          <thead>
            <tr>
              <th>Tipo NCF</th>
              <th>Descripción</th>
              <th>Rango</th>
              <th>Usado</th>
              <th>Disponibles</th>
              <th>Vencimiento</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px', color:'#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight:8 }}></i>Cargando...
              </td></tr>
            ) : secuencias.length === 0 ? (
              <tr className="tabla-vacia-row"><td colSpan={7}>
                <i className="fas fa-barcode"></i>No hay secuencias registradas
              </td></tr>
            ) : secuencias.map(s => {
              const p = pct(s)
              return (
                <tr key={s.id}>
                  <td data-label="Tipo NCF"><span style={{ fontFamily:'monospace', fontWeight:700, color:'#17406d' }}>{s.tipo_ncf}</span></td>
                  <td data-label="Descripción">{s.descripcion || '—'}</td>
                  <td data-label="Rango" style={{ fontFamily:'monospace', fontSize:'0.88rem' }}>{s.desde} — {s.hasta}</td>
                  <td data-label="Usado">
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ background:'#e0e8f0', borderRadius:4, height:8, width:80, overflow:'hidden' }}>
                        <div style={{ width:`${p}%`, background: colorBarra(p), height:'100%' }}></div>
                      </div>
                      <span style={{ fontSize:'0.82rem', color:'#556' }}>{s.ultimo_usado}</span>
                    </div>
                  </td>
                  <td data-label="Disponibles" style={{ fontWeight:600, color: s.disponibles <= 50 ? '#c0392b' : '#27ae60' }}>
                    {s.disponibles}
                  </td>
                  <td data-label="Vencimiento" style={{ fontSize:'0.88rem' }}>{s.fecha_vencimiento ? new Date(s.fecha_vencimiento).toLocaleDateString('es-DO') : '—'}</td>
                  <td data-label="Estado">
                    <span className={`badge ${s.activo ? 'badge-verde' : 'badge-gris'}`}>
                      {s.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <h3><i className="fas fa-barcode"></i> Nueva secuencia NCF</h3>
              <button className="modal-cerrar" onClick={() => setModal(false)}><i className="fas fa-xmark"></i></button>
            </div>

            <div className="alerta-box alerta-info" style={{ marginBottom:16 }}>
              <i className="fas fa-circle-info"></i>
              Al registrar una nueva secuencia, la anterior se desactivará automáticamente.
            </div>

            <form onSubmit={guardar}>
              <div className="form-grid">
                <div className="form-grupo">
                  <label>Tipo NCF <span className="requerido">*</span></label>
                  <select name="tipo_ncf" value={form.tipo_ncf} onChange={onChange}>
                    {TIPOS_NCF.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Descripción</label>
                  <input name="descripcion" value={form.descripcion} onChange={onChange} placeholder="Opcional" />
                </div>
                <div className="form-grupo">
                  <label>Desde (número inicial) <span className="requerido">*</span></label>
                  <input type="number" name="desde" min="1" value={form.desde} onChange={onChange} placeholder="1" autoFocus />
                </div>
                <div className="form-grupo">
                  <label>Hasta (número final) <span className="requerido">*</span></label>
                  <input type="number" name="hasta" min="1" value={form.hasta} onChange={onChange} placeholder="500" />
                </div>
                <div className="form-grupo col-span-2">
                  <label>Fecha de vencimiento</label>
                  <input type="date" name="fecha_vencimiento" value={form.fecha_vencimiento} onChange={onChange} />
                </div>
              </div>

              {form.desde && form.hasta && Number(form.desde) < Number(form.hasta) && (
                <div className="alerta-box alerta-success" style={{ marginTop:12 }}>
                  <i className="fas fa-circle-check"></i>
                  Rango de <strong>{Number(form.hasta) - Number(form.desde) + 1}</strong> comprobantes.
                  Alerta automática cuando queden el 20% ({Math.floor((Number(form.hasta) - Number(form.desde) + 1) * 0.2)} comprobantes).
                </div>
              )}

              {error && <div className="alerta-box alerta-danger" style={{ marginTop:14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={guardando}>
                  {guardando ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</> : <><i className="fas fa-floppy-disk"></i> Registrar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
