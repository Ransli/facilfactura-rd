import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import './vistas.css'

const API_ORIGIN = 'http://localhost:3002'

const EMPRESA_VACIA = {
  empresa_nombre: '', empresa_rnc: '', telefono: '', celular: '', email: '',
  direccion: '', ciudad: '', sitio_web: '',
}
const FISCAL_DEF = {
  moneda: 'DOP', factura_prefijo: 'F',
  itbis_porcentaje: '18', ret_itbis_porcentaje: '100', ret_isr_porcentaje: '10',
  nfc_alerta_porcentaje: '80',
}
const METODO_VACIO = { tipo: 'transferencia', banco: '', numero_cuenta: '', tipo_cuenta: 'corriente', titular: '' }

export default function Configuracion() {
  const [empresa, setEmpresa]   = useState(EMPRESA_VACIA)
  const [fiscal, setFiscal]     = useState(FISCAL_DEF)
  const [logoPath, setLogoPath] = useState(null)
  const [empresaId, setEmpresaId] = useState(null)
  const [metodos, setMetodos]   = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)

  const [modalMet, setModalMet] = useState(false)
  const [formMet, setFormMet]   = useState(METODO_VACIO)
  const [editMet, setEditMet]   = useState(null)
  const [modalElim, setModalElim] = useState(null)

  const { toast, mostrar, cerrar } = useToast()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await api.get('/configuracion')
      const d = res.data
      setEmpresa({
        empresa_nombre: d.empresa_nombre || '', empresa_rnc: d.empresa_rnc || '',
        telefono: d.telefono || '', celular: d.celular || '', email: d.email || '',
        direccion: d.direccion || '', ciudad: d.ciudad || '', sitio_web: d.sitio_web || '',
      })
      setFiscal({
        moneda: d.moneda || 'DOP', factura_prefijo: d.factura_prefijo || 'F',
        itbis_porcentaje: String(d.itbis_porcentaje ?? '18'),
        ret_itbis_porcentaje: String(d.ret_itbis_porcentaje ?? '100'),
        ret_isr_porcentaje: String(d.ret_isr_porcentaje ?? '10'),
        nfc_alerta_porcentaje: String(d.nfc_alerta_porcentaje ?? '80'),
      })
      setLogoPath(d.logo_path || null)
      setEmpresaId(d.empresa_id || null)
      setMetodos(d.metodos_pago || [])
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const onEmpresa = e => setEmpresa(f => ({ ...f, [e.target.name]: e.target.value }))
  const onFiscal  = e => setFiscal(f => ({ ...f, [e.target.name]: e.target.value }))

  async function guardar() {
    if (!empresa.empresa_nombre.trim()) { mostrar('El nombre de la empresa es requerido', 'warning'); return }
    if (!empresa.empresa_rnc.trim())    { mostrar('El RNC de la empresa es requerido', 'warning'); return }
    setGuardando(true)
    try {
      await api.put('/configuracion', { ...empresa, ...fiscal })
      mostrar('Configuración guardada', 'success')
      cargar()
    } catch (err) { mostrar(err.message) }
    finally { setGuardando(false) }
  }

  async function subirLogo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!empresaId) { mostrar('Guarda primero los datos de la empresa', 'warning'); return }
    setSubiendo(true)
    try {
      const fd = new FormData()
      fd.append('logo', file)
      const res = await api.upload('/configuracion/logo', fd)
      if (res.ok) { setLogoPath(res.data.logo_path); mostrar('Logo actualizado', 'success') }
      else mostrar(res.mensaje || 'No se pudo subir el logo')
    } catch (err) { mostrar(err.message) }
    finally { setSubiendo(false) }
  }

  function abrirMetodo(m) {
    if (m) { setFormMet({ tipo: m.tipo, banco: m.banco || '', numero_cuenta: m.numero_cuenta || '', tipo_cuenta: m.tipo_cuenta || 'corriente', titular: m.titular || '' }); setEditMet(m.id) }
    else   { setFormMet(METODO_VACIO); setEditMet(null) }
    setModalMet(true)
  }

  async function guardarMetodo(e) {
    e.preventDefault()
    if (!empresaId) { mostrar('Guarda primero los datos de la empresa', 'warning'); return }
    try {
      if (editMet) await api.put(`/metodos-pago/${editMet}`, formMet)
      else         await api.post('/metodos-pago', { ...formMet, empresa_id: empresaId })
      setModalMet(false); cargar()
    } catch (err) { mostrar(err.message) }
  }

  async function eliminarMetodo() {
    if (!modalElim) return
    try { await api.delete(`/metodos-pago/${modalElim.id}`); setModalElim(null); cargar() }
    catch (err) { mostrar(err.message) }
  }

  if (cargando) {
    return <div className="vista-card"><div style={{ textAlign:'center', padding:'50px', color:'#aab' }}>
      <i className="fas fa-spinner fa-spin" style={{ fontSize:'1.6rem' }}></i></div></div>
  }

  return (
    <>
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-cog"></i> Configuración</h2>
        <button className="btn-primary" onClick={guardar} disabled={guardando}>
          {guardando ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</> : <><i className="fas fa-floppy-disk"></i> Guardar cambios</>}
        </button>
      </div>

      {/* ── DATOS DE LA EMPRESA ── */}
      <h3 style={{ color:'#17406d', fontSize:'1rem', margin:'8px 0 14px' }}><i className="fas fa-building" style={{ marginRight:8 }}></i>Datos de la empresa emisora</h3>

      <div style={{ display:'flex', gap:20, alignItems:'flex-start', flexWrap:'wrap', marginBottom:10 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:120, height:120, borderRadius:12, border:'2px dashed #cdd8e6', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', marginBottom:8 }}>
            {logoPath
              ? <img src={`${API_ORIGIN}${logoPath}`} alt="Logo" style={{ maxWidth:'100%', maxHeight:'100%' }} />
              : <i className="fas fa-image" style={{ fontSize:'2rem', color:'#cdd8e6' }}></i>}
          </div>
          <label className="btn-secondary" style={{ cursor:'pointer', fontSize:'0.83rem', padding:'6px 12px' }}>
            {subiendo ? 'Subiendo...' : 'Cambiar logo'}
            <input type="file" accept="image/*" hidden onChange={subirLogo} disabled={subiendo} />
          </label>
        </div>

        <div className="form-grid" style={{ flex:1, minWidth:280 }}>
          <div className="form-grupo col-span-2">
            <label>Nombre de la empresa <span className="requerido">*</span></label>
            <input name="empresa_nombre" value={empresa.empresa_nombre} onChange={onEmpresa} placeholder="Mi Empresa SRL" />
          </div>
          <div className="form-grupo">
            <label>RNC <span className="requerido">*</span></label>
            <input name="empresa_rnc" value={empresa.empresa_rnc} onChange={onEmpresa} placeholder="130000000" />
          </div>
          <div className="form-grupo">
            <label>Teléfono</label>
            <input name="telefono" value={empresa.telefono} onChange={onEmpresa} placeholder="809-000-0000" />
          </div>
          <div className="form-grupo">
            <label>Celular</label>
            <input name="celular" value={empresa.celular} onChange={onEmpresa} placeholder="829-000-0000" />
          </div>
          <div className="form-grupo">
            <label>Email</label>
            <input name="email" value={empresa.email} onChange={onEmpresa} placeholder="correo@empresa.com" />
          </div>
          <div className="form-grupo col-span-2">
            <label>Dirección</label>
            <input name="direccion" value={empresa.direccion} onChange={onEmpresa} placeholder="Calle, sector, ciudad" />
          </div>
          <div className="form-grupo">
            <label>Ciudad</label>
            <input name="ciudad" value={empresa.ciudad} onChange={onEmpresa} placeholder="Santo Domingo" />
          </div>
          <div className="form-grupo">
            <label>Sitio web</label>
            <input name="sitio_web" value={empresa.sitio_web} onChange={onEmpresa} placeholder="www.empresa.com" />
          </div>
        </div>
      </div>

      {/* ── PARÁMETROS FISCALES ── */}
      <h3 style={{ color:'#17406d', fontSize:'1rem', margin:'22px 0 14px', borderTop:'1px solid #edf1f7', paddingTop:18 }}>
        <i className="fas fa-percent" style={{ marginRight:8 }}></i>Parámetros fiscales
      </h3>
      <div className="form-grid">
        <div className="form-grupo">
          <label>ITBIS (%)</label>
          <input type="number" step="0.01" name="itbis_porcentaje" value={fiscal.itbis_porcentaje} onChange={onFiscal} />
        </div>
        <div className="form-grupo">
          <label>Retención ITBIS (%)</label>
          <input type="number" step="0.01" name="ret_itbis_porcentaje" value={fiscal.ret_itbis_porcentaje} onChange={onFiscal} />
        </div>
        <div className="form-grupo">
          <label>Retención ISR (%)</label>
          <input type="number" step="0.01" name="ret_isr_porcentaje" value={fiscal.ret_isr_porcentaje} onChange={onFiscal} />
        </div>
        <div className="form-grupo">
          <label>Moneda</label>
          <input name="moneda" value={fiscal.moneda} onChange={onFiscal} placeholder="DOP" />
        </div>
        <div className="form-grupo">
          <label>Prefijo de factura</label>
          <input name="factura_prefijo" value={fiscal.factura_prefijo} onChange={onFiscal} placeholder="F" maxLength={5} />
        </div>
        <div className="form-grupo">
          <label>Alerta NCF al (% usado)</label>
          <input type="number" name="nfc_alerta_porcentaje" value={fiscal.nfc_alerta_porcentaje} onChange={onFiscal} />
        </div>
      </div>

      {/* ── MÉTODOS DE PAGO ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', margin:'22px 0 14px', borderTop:'1px solid #edf1f7', paddingTop:18 }}>
        <h3 style={{ color:'#17406d', fontSize:'1rem', margin:0 }}><i className="fas fa-money-check-dollar" style={{ marginRight:8 }}></i>Métodos de pago</h3>
        <button className="btn-primary" style={{ padding:'6px 12px', fontSize:'0.85rem' }} onClick={() => abrirMetodo(null)}>
          <i className="fas fa-plus"></i> Agregar
        </button>
      </div>

      {metodos.length === 0 ? (
        <div className="alerta-box alerta-info"><i className="fas fa-circle-info"></i>Sin métodos de pago. Aparecen al pie de la factura impresa.</div>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla-crud">
            <thead><tr><th>Tipo</th><th>Banco</th><th>Cuenta</th><th>Titular</th><th className="col-acciones">Acciones</th></tr></thead>
            <tbody>
              {metodos.map(m => (
                <tr key={m.id}>
                  <td data-label="Tipo"><span className="badge badge-azul">{m.tipo}</span></td>
                  <td data-label="Banco">{m.banco || '—'}</td>
                  <td data-label="Cuenta" style={{ fontFamily:'monospace' }}>{m.numero_cuenta || '—'}</td>
                  <td data-label="Titular">{m.titular || '—'}</td>
                  <td className="col-acciones">
                    <button className="btn-icono editar" onClick={() => abrirMetodo(m)} title="Editar"><i className="fas fa-pen"></i></button>
                    <button className="btn-icono eliminar" onClick={() => setModalElim(m)} title="Eliminar"><i className="fas fa-trash"></i></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalMet && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalMet(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <h3><i className="fas fa-money-check-dollar"></i> {editMet ? 'Editar método' : 'Nuevo método de pago'}</h3>
              <button className="modal-cerrar" onClick={() => setModalMet(false)}><i className="fas fa-xmark"></i></button>
            </div>
            <form onSubmit={guardarMetodo}>
              <div className="form-grid">
                <div className="form-grupo">
                  <label>Tipo</label>
                  <select value={formMet.tipo} onChange={e => setFormMet(f => ({ ...f, tipo: e.target.value }))}>
                    <option value="transferencia">Transferencia</option>
                    <option value="cheque">Cheque</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta">Tarjeta</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Banco</label>
                  <input value={formMet.banco} onChange={e => setFormMet(f => ({ ...f, banco: e.target.value }))} placeholder="Banco Popular" />
                </div>
                <div className="form-grupo">
                  <label>Número de cuenta</label>
                  <input value={formMet.numero_cuenta} onChange={e => setFormMet(f => ({ ...f, numero_cuenta: e.target.value }))} placeholder="000-0000000-0" />
                </div>
                <div className="form-grupo">
                  <label>Tipo de cuenta</label>
                  <select value={formMet.tipo_cuenta} onChange={e => setFormMet(f => ({ ...f, tipo_cuenta: e.target.value }))}>
                    <option value="corriente">Corriente</option>
                    <option value="ahorros">Ahorros</option>
                  </select>
                </div>
                <div className="form-grupo col-span-2">
                  <label>Titular</label>
                  <input value={formMet.titular} onChange={e => setFormMet(f => ({ ...f, titular: e.target.value }))} placeholder="Nombre del titular" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalMet(false)}>Cancelar</button>
                <button type="submit" className="btn-primary"><i className="fas fa-floppy-disk"></i> Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalElim && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalElim(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <h3><i className="fas fa-triangle-exclamation"></i> Eliminar método</h3>
              <button className="modal-cerrar" onClick={() => setModalElim(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p style={{ color:'#444' }}>¿Eliminar este método de pago?</p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModalElim(null)}>Cancelar</button>
              <button className="btn-danger" onClick={eliminarMetodo}><i className="fas fa-trash"></i> Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <Toast toast={toast} onClose={cerrar} />
    </>
  )
}
