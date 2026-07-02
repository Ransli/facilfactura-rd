import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import './vistas.css'

const FORM_VACIO = { nombre: '', email: '', password: '', rol_id: '', activo: 1 }

const BADGE_ROL = { admin: 'badge-azul', facturador: 'badge-verde', visor: 'badge-gris' }

const fechaLegible = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit' }) : 'Nunca'

export default function Usuarios() {
  const { usuario: yo } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles]       = useState([])
  const [buscar, setBuscar]     = useState('')
  const [cargando, setCargando] = useState(true)
  const [modal, setModal]       = useState(false)
  const [modalElim, setModalElim] = useState(null)
  const [form, setForm]         = useState(FORM_VACIO)
  const [editId, setEditId]     = useState(null)
  const [verPass, setVerPass]   = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]       = useState('')
  const { toast, mostrar, cerrar } = useToast()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await api.get(`/usuarios${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`)
      setUsuarios(res.data)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [buscar])

  useEffect(() => {
    const t = setTimeout(cargar, 300)
    return () => clearTimeout(t)
  }, [cargar])

  useEffect(() => {
    api.get('/usuarios/roles').then(r => setRoles(r.data)).catch(() => {})
  }, [])

  function abrirNuevo() {
    setForm({ ...FORM_VACIO, rol_id: roles.find(r => r.nombre === 'facturador')?.id || roles[0]?.id || '' })
    setEditId(null); setVerPass(false); setError(''); setModal(true)
  }

  function abrirEditar(u) {
    setForm({ nombre: u.nombre, email: u.email, password: '', rol_id: String(u.rol_id), activo: u.activo })
    setEditId(u.id); setVerPass(false); setError(''); setModal(true)
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? (checked ? 1 : 0) : value }))
    setError('')
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    if (!form.email.trim())  { setError('El email es requerido'); return }
    if (!form.rol_id)        { setError('Selecciona un rol'); return }
    if (!editId && form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (editId && form.password && form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }

    setGuardando(true)
    try {
      if (editId) await api.put(`/usuarios/${editId}`, form)
      else        await api.post('/usuarios', form)
      setModal(false); cargar()
      mostrar(editId ? 'Usuario actualizado' : 'Usuario creado', 'success')
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function desactivar() {
    if (!modalElim) return
    try { await api.delete(`/usuarios/${modalElim.id}`); setModalElim(null); cargar(); mostrar('Usuario desactivado', 'success') }
    catch (err) { mostrar(err.message) }
  }

  return (
    <>
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-user-gear"></i> Usuarios</h2>
        <button className="btn-primary" onClick={abrirNuevo}><i className="fas fa-user-plus"></i> Nuevo usuario</button>
      </div>

      <div className="vista-toolbar">
        <input className="buscar-input" placeholder="Buscar por nombre o email..."
          value={buscar} onChange={e => setBuscar(e.target.value)} />
      </div>

      <div className="tabla-wrap">
        <table className="tabla-crud">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Último acceso</th>
              <th>Estado</th>
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={6} style={{ textAlign:'center', padding:'40px', color:'#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight:8 }}></i>Cargando...
              </td></tr>
            ) : usuarios.length === 0 ? (
              <tr className="tabla-vacia-row"><td colSpan={6}>
                <i className="fas fa-users"></i>{buscar ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
              </td></tr>
            ) : usuarios.map(u => (
              <tr key={u.id}>
                <td data-label="Nombre">
                  <strong>{u.nombre}</strong>
                  {u.id === yo?.id && <span className="badge badge-naranja" style={{ marginLeft:6, fontSize:'0.72rem' }}>tú</span>}
                </td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Rol"><span className={`badge ${BADGE_ROL[u.rol] || 'badge-gris'}`}>{u.rol}</span></td>
                <td data-label="Último acceso" style={{ fontSize:'0.88rem' }}>{fechaLegible(u.ultimo_acceso)}</td>
                <td data-label="Estado"><span className={`badge ${u.activo ? 'badge-verde' : 'badge-rojo'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td className="col-acciones">
                  <button className="btn-icono editar" onClick={() => abrirEditar(u)} title="Editar"><i className="fas fa-pen"></i></button>
                  {u.id !== yo?.id && u.activo === 1 && (
                    <button className="btn-icono eliminar" onClick={() => setModalElim(u)} title="Desactivar"><i className="fas fa-user-slash"></i></button>
                  )}
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
              <h3><i className="fas fa-user-gear"></i> {editId ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="modal-cerrar" onClick={() => setModal(false)}><i className="fas fa-xmark"></i></button>
            </div>
            <form onSubmit={guardar}>
              <div className="form-grid">
                <div className="form-grupo col-span-2">
                  <label>Nombre completo <span className="requerido">*</span></label>
                  <input name="nombre" value={form.nombre} onChange={onChange} placeholder="Nombre del empleado" autoFocus />
                </div>
                <div className="form-grupo col-span-2">
                  <label>Email <span className="requerido">*</span></label>
                  <input name="email" type="email" value={form.email} onChange={onChange} placeholder="empleado@empresa.com" />
                </div>
                <div className="form-grupo col-span-2">
                  <label>
                    Contraseña {editId ? <span style={{ color:'#99a', fontWeight:400 }}>(dejar en blanco para no cambiar)</span> : <span className="requerido">*</span>}
                  </label>
                  <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
                    <input
                      name="password"
                      type={verPass ? 'text' : 'password'}
                      value={form.password}
                      onChange={onChange}
                      placeholder={editId ? '••••••••' : 'Mínimo 6 caracteres'}
                      autoComplete="new-password"
                      style={{ width:'100%', paddingRight:40 }}
                    />
                    <button type="button" onClick={() => setVerPass(v => !v)} tabIndex={-1}
                      title={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                      style={{ position:'absolute', right:8, background:'none', border:'none', cursor:'pointer', color:'#7a8a9a', padding:4, display:'flex' }}>
                      <i className={`fas ${verPass ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                    </button>
                  </div>
                </div>
                <div className="form-grupo">
                  <label>Rol <span className="requerido">*</span></label>
                  <select name="rol_id" value={form.rol_id} onChange={onChange}>
                    <option value="">Seleccionar...</option>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                  </select>
                </div>
                {editId && (
                  <div className="form-grupo">
                    <label>Estado</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight:500, padding:'8px 0' }}>
                      <input type="checkbox" name="activo" checked={!!form.activo} onChange={onChange} style={{ width:16, height:16 }} />
                      {form.activo ? 'Activo' : 'Inactivo'}
                    </label>
                  </div>
                )}
              </div>

              {form.rol_id && (
                <div className="alerta-box alerta-info" style={{ marginTop:12 }}>
                  <i className="fas fa-circle-info"></i>
                  {roles.find(r => String(r.id) === String(form.rol_id))?.descripcion || 'Permisos según el rol seleccionado.'}
                </div>
              )}

              {error && <div className="alerta-box alerta-danger" style={{ marginTop:14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

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
              <h3><i className="fas fa-triangle-exclamation"></i> Desactivar usuario</h3>
              <button className="modal-cerrar" onClick={() => setModalElim(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p style={{ color:'#444' }}>¿Desactivar a <strong>{modalElim.nombre}</strong>? No podrá iniciar sesión hasta reactivarlo.</p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModalElim(null)}>Cancelar</button>
              <button className="btn-danger" onClick={desactivar}><i className="fas fa-user-slash"></i> Desactivar</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <Toast toast={toast} onClose={cerrar} />
    </>
  )
}
