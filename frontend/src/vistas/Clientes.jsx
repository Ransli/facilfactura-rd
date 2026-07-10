import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import {
  formatearRncCedula, formatearTelefono,
  validarRncCedula, validarEmail, validarTelefono,
  whatsappUrl,
} from '../utils/formato'
import './vistas.css'

const FORM_VACIO = { nombre: '', rnc: '', telefono: '', celular: '', email: '', direccion: '', ciudad: '', tipo: 'empresa' }

export default function Clientes() {
  const [clientes, setClientes]   = useState([])
  const [buscar, setBuscar]       = useState('')
  const [cargando, setCargando]   = useState(true)
  const [modal, setModal]         = useState(false)
  const [modalElim, setModalElim] = useState(null)
  const [form, setForm]           = useState(FORM_VACIO)
  const [editId, setEditId]       = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const [errores, setErrores]     = useState({})
  const { toast, mostrar, cerrar } = useToast()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await api.get(`/clientes${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`)
      setClientes(res.data)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [buscar])

  useEffect(() => {
    const t = setTimeout(cargar, 300)
    return () => clearTimeout(t)
  }, [cargar])

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setEditId(null)
    setError(''); setErrores({})
    setModal(true)
  }

  function abrirEditar(c) {
    setForm({ nombre: c.nombre, rnc: c.rnc || '', telefono: c.telefono || '', celular: c.celular || '',
              email: c.email || '', direccion: c.direccion || '', ciudad: c.ciudad || '', tipo: c.tipo })
    setEditId(c.id)
    setError(''); setErrores({})
    setModal(true)
  }

  function onChange(e) {
    const { name, value } = e.target
    let v = value
    if (name === 'rnc')      v = formatearRncCedula(value)
    if (name === 'telefono') v = formatearTelefono(value)
    if (name === 'celular')  v = formatearTelefono(value)
    setForm(f => ({ ...f, [name]: v }))
    setErrores(er => ({ ...er, [name]: '' }))
  }

  function onBlur(e) {
    const { name, value } = e.target
    let err = ''
    if (name === 'rnc')      err = validarRncCedula(value)
    if (name === 'email')    err = validarEmail(value)
    if (name === 'telefono') err = validarTelefono(value)
    if (name === 'celular')  err = validarTelefono(value)
    if (err) setErrores(er => ({ ...er, [name]: err }))
  }

  async function guardar(e) {
    e.preventDefault()
    const errs = {}
    if (!form.nombre.trim())  errs.nombre   = 'El nombre es requerido'
    if (form.rnc)      { const e = validarRncCedula(form.rnc);    if (e) errs.rnc      = e }
    if (form.email)    { const e = validarEmail(form.email);       if (e) errs.email    = e }
    if (form.telefono) { const e = validarTelefono(form.telefono); if (e) errs.telefono = e }
    if (form.celular)  { const e = validarTelefono(form.celular);  if (e) errs.celular  = e }
    if (Object.keys(errs).length) { setErrores(errs); return }
    setGuardando(true)
    try {
      if (editId) await api.put(`/clientes/${editId}`, form)
      else        await api.post('/clientes', form)
      setModal(false)
      cargar()
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!modalElim) return
    try {
      await api.delete(`/clientes/${modalElim.id}`)
      setModalElim(null)
      cargar()
    } catch (err) { mostrar(err.message) }
  }

  return (
    <>
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-users"></i> Clientes</h2>
        <button className="btn-primary" onClick={abrirNuevo}>
          <i className="fas fa-plus"></i> Nuevo cliente
        </button>
      </div>

      <div className="vista-toolbar">
        <input
          className="buscar-input"
          placeholder="Buscar por nombre o RNC..."
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
        />
      </div>

      <div className="tabla-wrap">
        <table className="tabla-crud">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>RNC / Cédula</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Tipo</th>
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }}></i>Cargando...
              </td></tr>
            ) : clientes.length === 0 ? (
              <tr className="tabla-vacia-row">
                <td colSpan={6}>
                  <i className="fas fa-users-slash"></i>
                  {buscar ? 'No se encontraron resultados' : 'No hay clientes registrados'}
                </td>
              </tr>
            ) : clientes.map(c => (
              <tr key={c.id}>
                <td data-label="Nombre"><strong>{c.nombre}</strong></td>
                <td data-label="RNC / Cédula">{c.rnc || '—'}</td>
                <td data-label="Teléfono">{c.telefono || c.celular || '—'}</td>
                <td data-label="Email">{c.email || '—'}</td>
                <td data-label="Tipo">
                  <span className={`badge ${c.tipo === 'empresa' ? 'badge-azul' : 'badge-verde'}`}>
                    {c.tipo === 'empresa' ? 'Empresa' : 'Persona'}
                  </span>
                </td>
                <td className="col-acciones">
                  {whatsappUrl(c.telefono, c.celular)
                    ? (
                      <a className="btn-icono whatsapp" href={whatsappUrl(c.telefono, c.celular)}
                        target="_blank" rel="noreferrer" title={`WhatsApp ${c.celular || c.telefono}`}>
                        <i className="fab fa-whatsapp"></i>
                      </a>
                    ) : (
                      <span className="btn-icono" style={{ color:'#ccd', cursor:'default' }} title="Sin número de teléfono">
                        <i className="fab fa-whatsapp"></i>
                      </span>
                    )
                  }
                  <button className="btn-icono editar" onClick={() => abrirEditar(c)} title="Editar">
                    <i className="fas fa-pen"></i>
                  </button>
                  <button className="btn-icono eliminar" onClick={() => setModalElim(c)} title="Eliminar">
                    <i className="fas fa-trash"></i>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <h3><i className="fas fa-user"></i> {editId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
              <button className="modal-cerrar" onClick={() => setModal(false)}><i className="fas fa-xmark"></i></button>
            </div>

            <form onSubmit={guardar}>
              <div className="form-grid">
                <div className="form-grupo col-span-2">
                  <label>Nombre / Razón social <span className="requerido">*</span></label>
                  <input name="nombre" value={form.nombre} onChange={onChange} onBlur={onBlur}
                    placeholder="Nombre completo o empresa" autoFocus
                    className={errores.nombre ? 'input-error' : ''} />
                  {errores.nombre && <span className="campo-error">{errores.nombre}</span>}
                </div>
                <div className="form-grupo">
                  <label>RNC / Cédula</label>
                  <input name="rnc" value={form.rnc} onChange={onChange} onBlur={onBlur}
                    placeholder="RNC: 130-88170-7  ·  Cédula: 001-1234567-8"
                    className={errores.rnc ? 'input-error' : ''} />
                  {errores.rnc && <span className="campo-error">{errores.rnc}</span>}
                </div>
                <div className="form-grupo">
                  <label>Tipo</label>
                  <select name="tipo" value={form.tipo} onChange={onChange}>
                    <option value="empresa">Empresa</option>
                    <option value="persona">Persona</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Teléfono</label>
                  <input name="telefono" value={form.telefono} onChange={onChange} onBlur={onBlur}
                    placeholder="809-555-0000"
                    className={errores.telefono ? 'input-error' : ''} />
                  {errores.telefono && <span className="campo-error">{errores.telefono}</span>}
                </div>
                <div className="form-grupo">
                  <label>Celular</label>
                  <input name="celular" value={form.celular} onChange={onChange} onBlur={onBlur}
                    placeholder="829-555-0000"
                    className={errores.celular ? 'input-error' : ''} />
                  {errores.celular && <span className="campo-error">{errores.celular}</span>}
                </div>
                <div className="form-grupo col-span-2">
                  <label>Email</label>
                  <input name="email" value={form.email} onChange={onChange} onBlur={onBlur}
                    placeholder="correo@ejemplo.com"
                    className={errores.email ? 'input-error' : ''} />
                  {errores.email && <span className="campo-error">{errores.email}</span>}
                </div>
                <div className="form-grupo">
                  <label>Ciudad</label>
                  <input name="ciudad" value={form.ciudad} onChange={onChange} placeholder="Santo Domingo" />
                </div>
                <div className="form-grupo">
                  <label>Dirección</label>
                  <input name="direccion" value={form.direccion} onChange={onChange} placeholder="Calle, sector..." />
                </div>
              </div>

              {error && <div className="alerta-box alerta-danger" style={{ marginTop: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={guardando}>
                  {guardando ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</> : <><i className="fas fa-floppy-disk"></i> Guardar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalElim && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModalElim(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <h3><i className="fas fa-triangle-exclamation"></i> Eliminar cliente</h3>
              <button className="modal-cerrar" onClick={() => setModalElim(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p style={{ color: '#444', marginBottom: 0 }}>
              ¿Eliminar a <strong>{modalElim.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModalElim(null)}>Cancelar</button>
              <button className="btn-danger" onClick={eliminar}><i className="fas fa-trash"></i> Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <Toast toast={toast} onClose={cerrar} />
    </>
  )
}
