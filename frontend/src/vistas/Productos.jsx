import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import './vistas.css'

const FORM_VACIO = {
  nombre: '', codigo: '', descripcion: '', tipo: 'producto',
  categoria_id: '', unidad_medida_id: '', tiene_dimensiones: false,
}

export default function Productos() {
  const [articulos, setArticulos]   = useState([])
  const [categorias, setCategorias] = useState([])
  const [unidades, setUnidades]     = useState([])
  const [buscar, setBuscar]         = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [cargando, setCargando]     = useState(true)
  const [modal, setModal]           = useState(false)
  const [modalElim, setModalElim]   = useState(null)
  const [form, setForm]             = useState(FORM_VACIO)
  const [precios, setPrecios]       = useState([])
  const [editId, setEditId]         = useState(null)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
  const { toast, mostrar, cerrar }  = useToast()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      let url = '/articulos?'
      if (buscar)     url += `buscar=${encodeURIComponent(buscar)}&`
      if (filtroTipo) url += `tipo=${filtroTipo}`
      const res = await api.get(url)
      setArticulos(res.data)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [buscar, filtroTipo])

  useEffect(() => {
    const t = setTimeout(cargar, 300)
    return () => clearTimeout(t)
  }, [cargar])

  useEffect(() => {
    api.get('/categorias').then(r => setCategorias(r.data)).catch(() => {})
    api.get('/unidades-medida').then(r => setUnidades(r.data)).catch(() => {})
  }, [])

  function abrirNuevo() {
    setForm(FORM_VACIO); setPrecios([]); setEditId(null); setError(''); setModal(true)
  }

  function abrirEditar(a) {
    setForm({ nombre: a.nombre, codigo: a.codigo || '', descripcion: a.descripcion || '',
              tipo: a.tipo, categoria_id: String(a.categoria_id),
              unidad_medida_id: String(a.unidad_medida_id), tiene_dimensiones: !!a.tiene_dimensiones })
    setPrecios((a.precios || []).map(p => ({
      ...p, unidad_medida_id: String(p.unidad_medida_id),
      precio_unitario: p.precio_unitario || '', precio_detalle: p.precio_detalle || '',
      precio_mayoreo: p.precio_mayoreo || '',
    })))
    setEditId(a.id); setError(''); setModal(true)
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
    setError('')
  }

  function agregarPrecio() {
    setPrecios(p => [...p, { unidad_medida_id: '', precio_unitario: '', precio_detalle: '', precio_mayoreo: '', es_precio_default: p.length === 0 }])
  }

  function cambiarPrecio(i, campo, valor) {
    setPrecios(p => p.map((x, idx) => idx === i ? { ...x, [campo]: valor } : x))
  }

  function quitarPrecio(i) {
    setPrecios(p => {
      const nuevo = p.filter((_, idx) => idx !== i)
      if (nuevo.length > 0 && !nuevo.some(x => x.es_precio_default)) nuevo[0].es_precio_default = true
      return nuevo
    })
  }

  function marcarDefault(i) {
    setPrecios(p => p.map((x, idx) => ({ ...x, es_precio_default: idx === i })))
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.nombre.trim())    { setError('El nombre es requerido'); return }
    if (!form.categoria_id)     { setError('Selecciona una categoría'); return }
    if (!form.unidad_medida_id) { setError('Selecciona la unidad de medida por defecto'); return }
    if (precios.length === 0)   { setError('Agrega al menos un precio'); return }
    for (const p of precios) {
      if (!p.unidad_medida_id) { setError('Selecciona la unidad de medida en cada precio'); return }
      if (!p.precio_unitario)  { setError('El precio unitario no puede estar vacío'); return }
    }
    setGuardando(true)
    try {
      const body = { ...form, precios }
      if (editId) await api.put(`/articulos/${editId}`, body)
      else        await api.post('/articulos', body)
      setModal(false); cargar()
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function eliminar() {
    if (!modalElim) return
    try { await api.delete(`/articulos/${modalElim.id}`); setModalElim(null); cargar() }
    catch (err) { mostrar(err.message) }
  }

  const fmt = n => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })

  return (
    <>
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-box"></i> Productos y Servicios</h2>
        <button className="btn-primary" onClick={abrirNuevo}><i className="fas fa-plus"></i> Nuevo artículo</button>
      </div>

      <div className="vista-toolbar">
        <input className="buscar-input" placeholder="Buscar por nombre o código..."
          value={buscar} onChange={e => setBuscar(e.target.value)} />
        <select style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #d0d8e4', fontSize: '0.93rem', background: '#f8fafc', outline: 'none' }}
          value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="">Todos</option>
          <option value="producto">Productos</option>
          <option value="servicio">Servicios</option>
        </select>
      </div>

      <div className="tabla-wrap">
        <table className="tabla-crud">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Tipo</th>
              <th>Precios registrados</th>
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={5} style={{ textAlign:'center', padding:'40px', color:'#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight:8 }}></i>Cargando...
              </td></tr>
            ) : articulos.length === 0 ? (
              <tr className="tabla-vacia-row"><td colSpan={5}>
                <i className="fas fa-box-open"></i>
                {buscar ? 'No se encontraron resultados' : 'No hay artículos registrados'}
              </td></tr>
            ) : articulos.map(a => (
              <tr key={a.id}>
                <td data-label="Nombre">
                  <strong>{a.nombre}</strong>
                  {a.tiene_dimensiones === 1 && <span className="badge badge-naranja" style={{ marginLeft:6, fontSize:'0.75rem' }}>Dimensiones</span>}
                  {a.codigo && <div style={{ fontSize:'0.8rem', color:'#99a' }}>#{a.codigo}</div>}
                  {a.descripcion && <div style={{ fontSize:'0.8rem', color:'#778' }}>{a.descripcion}</div>}
                </td>
                <td data-label="Categoría">{a.categoria_nombre}</td>
                <td data-label="Tipo"><span className={`badge ${a.tipo === 'servicio' ? 'badge-verde' : 'badge-azul'}`}>
                  {a.tipo === 'servicio' ? 'Servicio' : 'Producto'}
                </span></td>
                <td data-label="Precios">
                  {(a.precios || []).length === 0 ? <span style={{ color:'#c0392b', fontSize:'0.85rem' }}>Sin precios</span>
                  : (a.precios || []).map((p, i) => (
                    <div key={i} style={{ fontSize:'0.83rem', lineHeight:1.6 }}>
                      <span style={{ color:'#17406d', fontWeight:700 }}>RD$ {fmt(p.precio_unitario)}</span>
                      <span style={{ color:'#99a' }}> / {p.unidad_abreviatura}</span>
                      {p.es_precio_default ? <span className="badge badge-verde" style={{ marginLeft:4, fontSize:'0.7rem' }}>default</span> : null}
                    </div>
                  ))}
                </td>
                <td className="col-acciones">
                  <button className="btn-icono editar" onClick={() => abrirEditar(a)} title="Editar"><i className="fas fa-pen"></i></button>
                  <button className="btn-icono eliminar" onClick={() => setModalElim(a)} title="Eliminar"><i className="fas fa-trash"></i></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box modal-lg">
            <div className="modal-header">
              <h3><i className="fas fa-box"></i> {editId ? 'Editar artículo' : 'Nuevo artículo'}</h3>
              <button className="modal-cerrar" onClick={() => setModal(false)}><i className="fas fa-xmark"></i></button>
            </div>
            <form onSubmit={guardar}>
              <div className="form-grid">
                <div className="form-grupo col-span-2">
                  <label>Nombre <span className="requerido">*</span></label>
                  <input name="nombre" value={form.nombre} onChange={onChange} placeholder="Nombre del producto o servicio" autoFocus />
                </div>
                <div className="form-grupo">
                  <label>Código interno</label>
                  <input name="codigo" value={form.codigo} onChange={onChange} placeholder="SKU-001 (opcional)" />
                </div>
                <div className="form-grupo">
                  <label>Tipo <span className="requerido">*</span></label>
                  <select name="tipo" value={form.tipo} onChange={onChange}>
                    <option value="producto">Producto</option>
                    <option value="servicio">Servicio</option>
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Categoría <span className="requerido">*</span></label>
                  <select name="categoria_id" value={form.categoria_id} onChange={onChange}>
                    <option value="">Seleccionar...</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>
                <div className="form-grupo">
                  <label>Unidad de medida por defecto <span className="requerido">*</span></label>
                  <select name="unidad_medida_id" value={form.unidad_medida_id} onChange={onChange}>
                    <option value="">Seleccionar...</option>
                    {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
                  </select>
                </div>
                <div className="form-grupo col-span-2">
                  <label>Descripción</label>
                  <textarea name="descripcion" value={form.descripcion} onChange={onChange} placeholder="Descripción opcional..." />
                </div>
                <div className="form-grupo col-span-2">
                  <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontWeight:500 }}>
                    <input type="checkbox" name="tiene_dimensiones" checked={form.tiene_dimensiones} onChange={onChange} style={{ width:16, height:16 }} />
                    Artículo con dimensiones (ancho × alto) — ej: banners, lonas, vinilos
                  </label>
                </div>
              </div>

              <div style={{ marginTop:20, borderTop:'1px solid #edf1f7', paddingTop:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <strong style={{ color:'#17406d', fontSize:'0.95rem' }}>
                    <i className="fas fa-tag" style={{ marginRight:6 }}></i>Precios por unidad de medida
                  </strong>
                  <button type="button" className="btn-primary" style={{ padding:'6px 12px', fontSize:'0.85rem' }} onClick={agregarPrecio}>
                    <i className="fas fa-plus"></i> Agregar precio
                  </button>
                </div>

                {precios.length === 0 && (
                  <div className="alerta-box alerta-info">
                    <i className="fas fa-circle-info"></i>
                    Agrega al menos un precio. Puedes tener precios distintos por unidad (metro, m², rollo, día...).
                  </div>
                )}

                {precios.map((p, i) => (
                  <div key={i} style={{ background:'#f8fafc', border:'1px solid #e0eaf5', borderRadius:10, padding:'12px 14px', marginBottom:10 }}>
                    <div className="precio-grid">
                      <div className="form-grupo precio-col-unidad" style={{ marginBottom:0 }}>
                        <label style={{ fontSize:'0.8rem' }}>Unidad <span className="requerido">*</span></label>
                        <select value={p.unidad_medida_id} onChange={e => cambiarPrecio(i, 'unidad_medida_id', e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {unidades.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</option>)}
                        </select>
                      </div>
                      <div className="form-grupo" style={{ marginBottom:0 }}>
                        <label style={{ fontSize:'0.8rem' }}>Precio unit. <span className="requerido">*</span></label>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={p.precio_unitario} onChange={e => cambiarPrecio(i, 'precio_unitario', e.target.value)} />
                      </div>
                      <div className="form-grupo" style={{ marginBottom:0 }}>
                        <label style={{ fontSize:'0.8rem' }}>P. detalle</label>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={p.precio_detalle} onChange={e => cambiarPrecio(i, 'precio_detalle', e.target.value)} />
                      </div>
                      <div className="form-grupo" style={{ marginBottom:0 }}>
                        <label style={{ fontSize:'0.8rem' }}>P. mayoreo</label>
                        <input type="number" step="0.01" min="0" placeholder="0.00"
                          value={p.precio_mayoreo} onChange={e => cambiarPrecio(i, 'precio_mayoreo', e.target.value)} />
                      </div>
                      <div className="precio-col-trash">
                        <button type="button" className="btn-icono eliminar" onClick={() => quitarPrecio(i)}>
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer', fontSize:'0.83rem', marginTop:8, color: p.es_precio_default ? '#17406d' : '#778' }}>
                      <input type="radio" name="precio_default" checked={!!p.es_precio_default} onChange={() => marcarDefault(i)} />
                      Precio por defecto al seleccionar en factura
                    </label>
                  </div>
                ))}
              </div>

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
              <h3><i className="fas fa-triangle-exclamation"></i> Eliminar artículo</h3>
              <button className="modal-cerrar" onClick={() => setModalElim(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p style={{ color:'#444', marginBottom:0 }}>¿Eliminar <strong>{modalElim.nombre}</strong>? Esta acción no se puede deshacer.</p>
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
