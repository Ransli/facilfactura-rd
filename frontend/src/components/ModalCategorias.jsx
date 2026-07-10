import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'

const FORM_VACIO = { nombre: '', tipo: 'ambos', descripcion: '', orden: 1 }

const TIPOS = [
  { valor: 'ambos',    label: 'Ambos' },
  { valor: 'producto', label: 'Solo productos' },
  { valor: 'servicio', label: 'Solo servicios' },
]

const BADGE = { producto: 'badge-azul', servicio: 'badge-verde', ambos: 'badge-gris' }

/**
 * CRUD de categorías. Al cerrarse avisa al padre para que recargue su lista,
 * porque el usuario suele venir aquí justo cuando le falta una categoría.
 */
export default function ModalCategorias({ onCerrar, onCambio }) {
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando]     = useState(true)
  const [form, setForm]             = useState(FORM_VACIO)
  const [editId, setEditId]         = useState(null)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
  const [confirmar, setConfirmar]   = useState(null)
  const [huboCambios, setHuboCambios] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await api.get('/categorias')
      setCategorias(res.data)
    } catch (e) { setError(e.message) }
    finally { setCargando(false) }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function cerrar() {
    if (huboCambios) onCambio?.()
    onCerrar()
  }

  function editar(c) {
    setForm({ nombre: c.nombre, tipo: c.tipo, descripcion: c.descripcion || '', orden: c.orden })
    setEditId(c.id)
    setError('')
  }

  function cancelarEdicion() {
    setForm(FORM_VACIO)
    setEditId(null)
    setError('')
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }

    setGuardando(true)
    setError('')
    try {
      if (editId) await api.put(`/categorias/${editId}`, form)
      else        await api.post('/categorias', form)
      setHuboCambios(true)
      cancelarEdicion()
      cargar()
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function eliminar(id) {
    try {
      await api.delete(`/categorias/${id}`)
      setHuboCambios(true)
      setConfirmar(null)
      if (editId === id) cancelarEdicion()
      cargar()
    } catch (err) { setError(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && cerrar()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3><i className="fas fa-tags"></i> Categorías</h3>
          <button className="modal-cerrar" onClick={cerrar}><i className="fas fa-xmark"></i></button>
        </div>

        <form onSubmit={guardar}>
          <div className="form-grid">
            <div className="form-grupo col-span-2">
              <label>Nombre <span className="requerido">*</span></label>
              <input
                value={form.nombre} maxLength={100} autoFocus
                placeholder="Desarrollo Web"
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className={error && !form.nombre.trim() ? 'input-error' : ''}
              />
            </div>
            <div className="form-grupo">
              <label>Aplica a</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-grupo">
              <label>Orden</label>
              <input
                value={form.orden} inputMode="numeric" maxLength={3}
                onChange={e => setForm(f => ({ ...f, orden: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
              />
              <span className="campo-ayuda">Define el orden en los listados</span>
            </div>
            <div className="form-grupo col-span-2">
              <label>Descripción</label>
              <input
                value={form.descripcion} maxLength={255}
                placeholder="Sitios web, tiendas en línea y landing pages"
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              />
            </div>
          </div>

          {error && <div className="campo-error" style={{ marginTop: 6 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              <i className={`fas ${editId ? 'fa-floppy-disk' : 'fa-plus'}`}></i>
              {guardando ? ' Guardando...' : editId ? ' Guardar cambios' : ' Agregar categoría'}
            </button>
            {editId && (
              <button type="button" className="btn-secondary" onClick={cancelarEdicion}>
                Cancelar
              </button>
            )}
          </div>
        </form>

        <div style={{ marginTop: 20, borderTop: '1px solid #eef1f5', paddingTop: 14 }}>
          {cargando ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#aab' }}>
              <i className="fas fa-spinner fa-spin"></i>
            </div>
          ) : categorias.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#93a1b1', fontSize: '0.9rem', padding: '18px 0' }}>
              Todavía no hay categorías. Crea la primera arriba.
            </p>
          ) : (
            <div className="tabla-wrap">
              <table className="tabla-crud">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Aplica a</th>
                    <th>Orden</th>
                    <th style={{ width: 90 }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {categorias.map(c => (
                    <tr key={c.id} style={editId === c.id ? { background: '#f4f9ff' } : undefined}>
                      <td data-label="Nombre">
                        <strong>{c.nombre}</strong>
                        {c.descripcion && (
                          <span style={{ display: 'block', fontSize: '0.76rem', color: '#93a1b1' }}>
                            {c.descripcion}
                          </span>
                        )}
                      </td>
                      <td data-label="Aplica a">
                        <span className={`badge ${BADGE[c.tipo]}`}>
                          {TIPOS.find(t => t.valor === c.tipo)?.label}
                        </span>
                      </td>
                      <td data-label="Orden">{c.orden}</td>
                      <td data-label="Acción">
                        {confirmar === c.id ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icono" title="Confirmar" onClick={() => eliminar(c.id)}
                              style={{ color: '#c0392b' }}>
                              <i className="fas fa-check"></i>
                            </button>
                            <button className="btn-icono" title="Cancelar" onClick={() => setConfirmar(null)}>
                              <i className="fas fa-xmark"></i>
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icono" title="Editar" onClick={() => editar(c)}>
                              <i className="fas fa-pen"></i>
                            </button>
                            <button className="btn-icono" title="Eliminar" onClick={() => setConfirmar(c.id)}>
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={cerrar}>Cerrar</button>
        </div>
      </div>
    </div>
  )
}
