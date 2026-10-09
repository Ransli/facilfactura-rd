import { useState, useEffect, useCallback } from 'react'
import { masterApi } from '../masterApi'

const dinero = (n) => `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
const limite = (n) => (Number(n) === -1 ? 'Ilimitado' : Number(n).toLocaleString('es-DO'))

const VACIO = {
  nombre: '', slug: '', descripcion: '', precio_mensual: '', moneda: 'DOP',
  max_usuarios: '', max_clientes: '', max_ecf_mes: '', es_plan_prueba: false, dias_prueba: '', orden: '',
}

function FormularioPlan({ inicial, onGuardar, onCerrar, enviando, error }) {
  const [form, setForm] = useState(inicial)
  const cambiar = (campo) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [campo]: v }))
  }
  const esNuevo = !inicial.id

  function enviar(e) {
    e.preventDefault()
    onGuardar({
      ...form,
      precio_mensual: Number(form.precio_mensual), max_usuarios: Number(form.max_usuarios),
      max_clientes: Number(form.max_clientes), max_ecf_mes: Number(form.max_ecf_mes),
      dias_prueba: form.dias_prueba ? Number(form.dias_prueba) : null,
      orden: form.orden ? Number(form.orden) : undefined,
    })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3><i className="fas fa-layer-group"></i> {esNuevo ? 'Nuevo plan' : `Editar «${inicial.nombre}»`}</h3>
          <button className="modal-cerrar" onClick={onCerrar}><i className="fas fa-xmark"></i></button>
        </div>
        <form onSubmit={enviar}>
          {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}
          <div className="form-grid">
            <div className="form-grupo">
              <label>Nombre <span className="requerido">*</span></label>
              <input required value={form.nombre} onChange={cambiar('nombre')} />
            </div>
            <div className="form-grupo">
              <label>Slug <span className="requerido">*</span></label>
              <input required pattern="[a-z0-9-]+" title="minúsculas, números y guiones" value={form.slug} onChange={cambiar('slug')} />
            </div>
            <div className="form-grupo col-span-2">
              <label>Descripción</label>
              <input value={form.descripcion || ''} onChange={cambiar('descripcion')} />
            </div>
            <div className="form-grupo">
              <label>Precio mensual (RD$) <span className="requerido">*</span></label>
              <input type="number" min="0" step="0.01" required value={form.precio_mensual} onChange={cambiar('precio_mensual')} />
            </div>
            <div className="form-grupo">
              <label>Orden en la lista de precios</label>
              <input type="number" min="1" value={form.orden} onChange={cambiar('orden')} />
            </div>
            <div className="form-grupo">
              <label>Máx. usuarios <span className="requerido">*</span></label>
              <input type="number" required value={form.max_usuarios} onChange={cambiar('max_usuarios')} placeholder="-1 = ilimitado" />
            </div>
            <div className="form-grupo">
              <label>Máx. clientes <span className="requerido">*</span></label>
              <input type="number" required value={form.max_clientes} onChange={cambiar('max_clientes')} placeholder="-1 = ilimitado" />
            </div>
            <div className="form-grupo">
              <label>Máx. e-CF al mes <span className="requerido">*</span></label>
              <input type="number" required value={form.max_ecf_mes} onChange={cambiar('max_ecf_mes')} placeholder="-1 = ilimitado" />
            </div>
            <div className="form-grupo">
              <label>Días de prueba (si aplica)</label>
              <input type="number" min="0" value={form.dias_prueba || ''} onChange={cambiar('dias_prueba')} />
            </div>
            <div className="form-grupo col-span-2">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={!!form.es_plan_prueba} onChange={cambiar('es_plan_prueba')} style={{ width: 'auto' }} />
                Es un plan de prueba gratuita
              </label>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</> : <><i className="fas fa-floppy-disk"></i> Guardar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Planes() {
  const [planes, setPlanes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)   // null = cerrado, {} = nuevo, {...plan} = editar
  const [enviando, setEnviando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try { setPlanes((await masterApi.get('/planes')).data) } catch (err) { setError(err.message) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardar(datos) {
    setEnviando(true); setErrorForm('')
    try {
      if (editando?.id) await masterApi.put(`/planes/${editando.id}`, datos)
      else await masterApi.post('/planes', datos)
      setEditando(null)
      await cargar()
    } catch (err) { setErrorForm(err.message) } finally { setEnviando(false) }
  }

  async function cambiarActivo(plan) {
    try {
      await masterApi.post(`/planes/${plan.id}/activo`, { activo: !plan.activo })
      await cargar()
    } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-layer-group"></i> Planes</h2>
        <button className="btn-primary" onClick={() => setEditando({ ...VACIO })}><i className="fas fa-plus"></i> Nuevo plan</button>
      </div>

      {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {cargando ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#aab' }}><i className="fas fa-spinner fa-spin"></i></div>
        ) : planes.map((p) => (
          <div key={p.id} className="vista-card" style={{ opacity: p.activo ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
              <h3 style={{ margin: 0, color: '#17406d' }}>{p.nombre}</h3>
              <span className={`badge ${p.activo ? 'badge-verde' : 'badge-gris'}`}>{p.activo ? 'Activo' : 'Inactivo'}</span>
            </div>
            <p style={{ fontSize: '1.3rem', fontWeight: 700, margin: '4px 0' }}>
              {p.es_plan_prueba ? 'Gratis' : dinero(p.precio_mensual)}{!p.es_plan_prueba && <small style={{ fontSize: '0.8rem', fontWeight: 400 }}>/mes</small>}
            </p>
            {p.descripcion && <p style={{ color: '#667', fontSize: '0.85rem', margin: '0 0 10px' }}>{p.descripcion}</p>}
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: '0.85rem', color: '#445' }}>
              <li>{limite(p.max_usuarios)} usuarios</li>
              <li>{limite(p.max_clientes)} clientes</li>
              <li>{limite(p.max_ecf_mes)} e-CF al mes</li>
              {!!p.es_plan_prueba && <li>{p.dias_prueba} días de prueba</li>}
            </ul>
            <p style={{ fontSize: '0.78rem', color: '#99a', margin: '0 0 12px' }}>{p.empresas_asignadas} empresa(s) con este plan</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setEditando(p)}><i className="fas fa-pen"></i> Editar</button>
              <button className="btn-secondary" style={{ flex: 1, color: p.activo ? '#a05e00' : '#1a7a45' }} onClick={() => cambiarActivo(p)}>
                <i className={`fas ${p.activo ? 'fa-eye-slash' : 'fa-eye'}`}></i> {p.activo ? 'Desactivar' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editando && (
        <FormularioPlan
          inicial={editando.id ? editando : VACIO}
          onGuardar={guardar}
          onCerrar={() => { setEditando(null); setErrorForm('') }}
          enviando={enviando}
          error={errorForm}
        />
      )}
    </div>
  )
}
