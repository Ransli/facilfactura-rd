import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import {
  formatearRncCedula, formatearTelefono, formatearCuenta, formatearPorcentaje,
  validarRncCedula, validarEmail, validarTelefono, validarSitioWeb,
  validarPorcentaje, validarRequerido,
} from '../utils/formato'
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

  const [errores, setErrores]   = useState({})

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

  // Cada campo se formatea mientras se escribe y se valida al salir de él.
  const FORMATO_EMPRESA = {
    empresa_rnc: formatearRncCedula,
    telefono:    formatearTelefono,
    celular:     formatearTelefono,
  }
  const VALIDA_EMPRESA = {
    empresa_nombre: validarRequerido,
    empresa_rnc:    (v) => validarRequerido(v) || validarRncCedula(v),
    telefono:       validarTelefono,
    celular:        validarTelefono,
    email:          validarEmail,
    sitio_web:      validarSitioWeb,
  }

  const onEmpresa = (e) => {
    const { name, value } = e.target
    const v = FORMATO_EMPRESA[name] ? FORMATO_EMPRESA[name](value) : value
    setEmpresa(f => ({ ...f, [name]: v }))
    if (errores[name]) setErrores(err => ({ ...err, [name]: '' }))
  }

  const onEmpresaBlur = (e) => {
    const { name, value } = e.target
    const err = VALIDA_EMPRESA[name] ? VALIDA_EMPRESA[name](value) : ''
    setErrores(prev => ({ ...prev, [name]: err }))
  }

  const onFiscal = (e) => {
    const { name, value } = e.target
    setFiscal(f => ({ ...f, [name]: formatearPorcentaje(value) }))
    if (errores[name]) setErrores(err => ({ ...err, [name]: '' }))
  }

  const onFiscalBlur = (e) => {
    const { name, value } = e.target
    setErrores(prev => ({ ...prev, [name]: validarPorcentaje(value) }))
  }

  // La moneda y el prefijo se guardan siempre en mayúsculas: 'dop' rompería el
  // formateo de montos, y textTransform solo cambia lo que se ve.
  const onTexto = (e) => {
    const { name, value } = e.target
    setFiscal(f => ({ ...f, [name]: value.toUpperCase() }))
  }

  async function guardar() {
    const errs = {}
    for (const [campo, validar] of Object.entries(VALIDA_EMPRESA)) {
      const err = validar(empresa[campo])
      if (err) errs[campo] = err
    }
    for (const campo of ['itbis_porcentaje', 'ret_itbis_porcentaje', 'ret_isr_porcentaje', 'nfc_alerta_porcentaje']) {
      const err = validarPorcentaje(fiscal[campo])
      if (err) errs[campo] = err
    }

    if (Object.keys(errs).length) {
      setErrores(errs)
      mostrar('Revisa los campos marcados en rojo', 'warning')
      return
    }

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
            <input name="empresa_nombre" value={empresa.empresa_nombre} onChange={onEmpresa} onBlur={onEmpresaBlur}
              placeholder="Mi Empresa SRL" maxLength={200} autoComplete="organization"
              className={errores.empresa_nombre ? 'input-error' : ''} />
            {errores.empresa_nombre && <span className="campo-error">{errores.empresa_nombre}</span>}
          </div>
          <div className="form-grupo">
            <label>RNC o Cédula <span className="requerido">*</span></label>
            <input name="empresa_rnc" value={empresa.empresa_rnc} onChange={onEmpresa} onBlur={onEmpresaBlur}
              placeholder="130-88170-7" inputMode="numeric" maxLength={13}
              className={errores.empresa_rnc ? 'input-error' : ''} />
            {errores.empresa_rnc
              ? <span className="campo-error">{errores.empresa_rnc}</span>
              : <span className="campo-ayuda">RNC: 9 dígitos · Cédula: 11 dígitos</span>}
          </div>
          <div className="form-grupo">
            <label>Teléfono</label>
            <input name="telefono" value={empresa.telefono} onChange={onEmpresa} onBlur={onEmpresaBlur}
              placeholder="809-000-0000" inputMode="tel" maxLength={12} autoComplete="tel"
              className={errores.telefono ? 'input-error' : ''} />
            {errores.telefono && <span className="campo-error">{errores.telefono}</span>}
          </div>
          <div className="form-grupo">
            <label>Celular</label>
            <input name="celular" value={empresa.celular} onChange={onEmpresa} onBlur={onEmpresaBlur}
              placeholder="829-000-0000" inputMode="tel" maxLength={12}
              className={errores.celular ? 'input-error' : ''} />
            {errores.celular && <span className="campo-error">{errores.celular}</span>}
          </div>
          <div className="form-grupo">
            <label>Email</label>
            <input type="email" name="email" value={empresa.email} onChange={onEmpresa} onBlur={onEmpresaBlur}
              placeholder="correo@empresa.com" maxLength={150} autoComplete="email" inputMode="email"
              className={errores.email ? 'input-error' : ''} />
            {errores.email && <span className="campo-error">{errores.email}</span>}
          </div>
          <div className="form-grupo col-span-2">
            <label>Dirección</label>
            <input name="direccion" value={empresa.direccion} onChange={onEmpresa}
              placeholder="Calle, sector, ciudad" maxLength={255} autoComplete="street-address" />
          </div>
          <div className="form-grupo">
            <label>Ciudad</label>
            <input name="ciudad" value={empresa.ciudad} onChange={onEmpresa}
              placeholder="Santo Domingo" maxLength={100} autoComplete="address-level2" />
          </div>
          <div className="form-grupo">
            <label>Sitio web</label>
            <input name="sitio_web" value={empresa.sitio_web} onChange={onEmpresa} onBlur={onEmpresaBlur}
              placeholder="www.empresa.com" maxLength={150} inputMode="url"
              className={errores.sitio_web ? 'input-error' : ''} />
            {errores.sitio_web && <span className="campo-error">{errores.sitio_web}</span>}
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
          <input name="itbis_porcentaje" value={fiscal.itbis_porcentaje} onChange={onFiscal} onBlur={onFiscalBlur}
            inputMode="decimal" maxLength={6} placeholder="18"
            className={errores.itbis_porcentaje ? 'input-error' : ''} />
          {errores.itbis_porcentaje && <span className="campo-error">{errores.itbis_porcentaje}</span>}
        </div>
        <div className="form-grupo">
          <label>Retención ITBIS (%)</label>
          <input name="ret_itbis_porcentaje" value={fiscal.ret_itbis_porcentaje} onChange={onFiscal} onBlur={onFiscalBlur}
            inputMode="decimal" maxLength={6} placeholder="100"
            className={errores.ret_itbis_porcentaje ? 'input-error' : ''} />
          {errores.ret_itbis_porcentaje && <span className="campo-error">{errores.ret_itbis_porcentaje}</span>}
        </div>
        <div className="form-grupo">
          <label>Retención ISR (%)</label>
          <input name="ret_isr_porcentaje" value={fiscal.ret_isr_porcentaje} onChange={onFiscal} onBlur={onFiscalBlur}
            inputMode="decimal" maxLength={6} placeholder="10"
            className={errores.ret_isr_porcentaje ? 'input-error' : ''} />
          {errores.ret_isr_porcentaje && <span className="campo-error">{errores.ret_isr_porcentaje}</span>}
        </div>
        <div className="form-grupo">
          <label>Moneda</label>
          <input name="moneda" value={fiscal.moneda} onChange={onTexto} placeholder="DOP" maxLength={3}
            style={{ textTransform: 'uppercase' }} />
        </div>
        <div className="form-grupo">
          <label>Prefijo de factura</label>
          <input name="factura_prefijo" value={fiscal.factura_prefijo} onChange={onTexto} placeholder="F" maxLength={5}
            style={{ textTransform: 'uppercase' }} />
        </div>
        <div className="form-grupo">
          <label>Alerta NCF al (% usado)</label>
          <input name="nfc_alerta_porcentaje" value={fiscal.nfc_alerta_porcentaje} onChange={onFiscal} onBlur={onFiscalBlur}
            inputMode="decimal" maxLength={6} placeholder="80"
            className={errores.nfc_alerta_porcentaje ? 'input-error' : ''} />
          {errores.nfc_alerta_porcentaje && <span className="campo-error">{errores.nfc_alerta_porcentaje}</span>}
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
                  <input value={formMet.banco} onChange={e => setFormMet(f => ({ ...f, banco: e.target.value }))}
                    placeholder="Banco Popular" maxLength={100} />
                </div>
                <div className="form-grupo">
                  <label>Número de cuenta</label>
                  <input value={formMet.numero_cuenta} inputMode="numeric" maxLength={20}
                    onChange={e => setFormMet(f => ({ ...f, numero_cuenta: formatearCuenta(e.target.value) }))}
                    placeholder="7960123456" />
                  <span className="campo-ayuda">Solo números, hasta 20 dígitos</span>
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
                  <input value={formMet.titular} onChange={e => setFormMet(f => ({ ...f, titular: e.target.value }))}
                    placeholder="Nombre del titular" maxLength={150} />
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
