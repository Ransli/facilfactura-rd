// Vista de contabilidad: gastos, retenciones y reportes DGII (606, 607, 608, 609 e IT-1).
//
// DÓNDE VA: frontend/src/vistas/
// CONECTAR (2 cambios pequeños):
//   frontend/src/App.jsx                       → importar esta vista y agregarla a VISTAS con el id `contabilidad`
//   frontend/src/components/MenuLateral.jsx    → item { id: 'contabilidad', icono: 'fa-solid fa-calculator', label: 'Contabilidad' }
// Estilos: reutiliza las clases de vistas.css (vista-card, vista-header, tabla-crud, modal-*, form-grupo, btn-*),
// igual que Clientes.jsx y ECF.jsx (de aquí se toma el patrón de descarga de archivos protegidos).
import { useState, useEffect, useCallback } from 'react'
import { api, API_ORIGIN } from '../api/config'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'
import './vistas.css'

const PESTANAS = [
  { id: 'gastos', etiqueta: 'Gastos' },
  { id: 'recibidos', etiqueta: 'e-CF recibidos' },
  { id: 'reportes', etiqueta: 'Reportes DGII' },
]

/** Pide un archivo protegido (TXT del formato) y lo descarga, igual que ECF.jsx con las representaciones/XML. */
async function descargarProtegido(ruta, nombreArchivo) {
  const res = await fetch(`${API_ORIGIN}/api${ruta}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.mensaje || 'No se pudo obtener el archivo')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nombreArchivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function Contabilidad() {
  const { usuario } = useAuth()
  const puedeEditar = usuario?.rol === 'admin' || usuario?.rol === 'facturador'
  const [pestana, setPestana] = useState('gastos')
  const { toast, mostrar, cerrar } = useToast()

  return (
    <>
      <div className="vista-card">
        <div className="vista-header">
          <h2 className="vista-titulo"><i className="fas fa-calculator"></i> Contabilidad</h2>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {PESTANAS.map((p) => (
            <button key={p.id} className={pestana === p.id ? 'btn-primary' : 'btn-secondary'} onClick={() => setPestana(p.id)}>
              {p.etiqueta}
            </button>
          ))}
        </div>
        {pestana === 'gastos' && <Gastos puedeEditar={puedeEditar} mostrar={mostrar} />}
        {pestana === 'recibidos' && <EcfRecibidos puedeEditar={puedeEditar} mostrar={mostrar} />}
        {pestana === 'reportes' && <Reportes mostrar={mostrar} />}
      </div>
      <Toast toast={toast} onClose={cerrar} />
    </>
  )
}

const FORM_VACIO = {
  proveedor_rnc: '', proveedor_nombre: '', categoria_606_id: '', ncf: '', ncf_modificado: '',
  fecha_comprobante: '', fecha_pago: '', monto_servicios: '', monto_bienes: '', itbis_facturado: '',
  itbis_retenido: '0', itbis_llevado_al_costo: '0', itbis_por_adelantar: '0', monto_retencion_renta: '0',
  propina_legal: '0', forma_pago: '1', es_pago_exterior: false, pais_beneficiario: '', tipo_renta_exterior: '',
}

function Gastos({ puedeEditar, mostrar }) {
  const [gastos, setGastos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modal, setModal] = useState(false)
  const [modalAnular, setModalAnular] = useState(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [resGastos, resCategorias] = await Promise.all([
        api.get('/contabilidad/gastos'),
        api.get('/contabilidad/gastos/categorias-606'),
      ])
      setGastos(resGastos.data)
      setCategorias(resCategorias.data)
    } catch (err) { mostrar(err.message) }
    finally { setCargando(false) }
  }, [mostrar])
  useEffect(() => { cargar() }, [cargar])

  function abrirNuevo() {
    setForm(FORM_VACIO); setEditId(null); setError(''); setModal(true)
  }

  function abrirEditar(g) {
    setForm({
      proveedor_rnc: g.proveedor_rnc, proveedor_nombre: g.proveedor_nombre, categoria_606_id: g.categoria_606_id,
      ncf: g.ncf, ncf_modificado: g.ncf_modificado || '', fecha_comprobante: String(g.fecha_comprobante).slice(0, 10),
      fecha_pago: g.fecha_pago ? String(g.fecha_pago).slice(0, 10) : '', monto_servicios: g.monto_servicios,
      monto_bienes: g.monto_bienes, itbis_facturado: g.itbis_facturado, itbis_retenido: g.itbis_retenido,
      itbis_llevado_al_costo: g.itbis_llevado_al_costo, itbis_por_adelantar: g.itbis_por_adelantar,
      monto_retencion_renta: g.monto_retencion_renta, propina_legal: g.propina_legal, forma_pago: g.forma_pago,
      es_pago_exterior: !!g.es_pago_exterior, pais_beneficiario: g.pais_beneficiario || '', tipo_renta_exterior: g.tipo_renta_exterior || '',
    })
    setEditId(g.id); setError(''); setModal(true)
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true); setError('')
    try {
      if (editId) await api.put(`/contabilidad/gastos/${editId}`, form)
      else await api.post('/contabilidad/gastos', form)
      setModal(false)
      mostrar(editId ? 'Gasto actualizado' : 'Gasto registrado', 'exito')
      cargar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function anular() {
    try {
      await api.delete(`/contabilidad/gastos/${modalAnular.id}`)
      mostrar('Gasto anulado', 'exito')
      setModalAnular(null)
      cargar()
    } catch (err) { mostrar(err.message) }
  }

  return (
    <>
      {puedeEditar && <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo gasto</button>}
      {cargando ? <p>Cargando…</p> : (
        <table className="tabla-crud">
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>NCF</th><th>Categoría 606</th><th>Total</th><th>Origen</th>{puedeEditar && <th>Acciones</th>}</tr></thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id}>
                <td>{String(g.fecha_comprobante).slice(0, 10)}</td>
                <td>{g.proveedor_nombre}{!!g.es_pago_exterior && <span title="Pago al exterior"> 🌐</span>}</td>
                <td>{g.ncf}</td>
                <td>{g.categoria_606_codigo} {g.categoria_606_nombre}</td>
                <td>{(Number(g.monto_servicios) + Number(g.monto_bienes)).toFixed(2)}</td>
                <td>{g.origen}</td>
                {puedeEditar && (
                  <td>
                    <button className="btn-mini" onClick={() => abrirEditar(g)}><i className="fas fa-pen"></i></button>
                    <button className="btn-mini" onClick={() => setModalAnular(g)}><i className="fas fa-ban"></i></button>
                  </td>
                )}
              </tr>
            ))}
            {!gastos.length && <tr><td colSpan={7}>Sin gastos registrados.</td></tr>}
          </tbody>
        </table>
      )}

      {modal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <h3>{editId ? 'Editar gasto' : 'Nuevo gasto'}</h3>
              <button className="modal-cerrar" onClick={() => setModal(false)}><i className="fas fa-xmark"></i></button>
            </div>
            <form onSubmit={guardar}>
              {error && <p style={{ color: '#c0392b' }}>{error}</p>}
              <div className="form-grupo"><label>RNC/cédula del proveedor</label>
                <input name="proveedor_rnc" value={form.proveedor_rnc} onChange={onChange} required /></div>
              <div className="form-grupo"><label>Nombre del proveedor</label>
                <input name="proveedor_nombre" value={form.proveedor_nombre} onChange={onChange} required /></div>
              <div className="form-grupo"><label>Categoría 606</label>
                <select name="categoria_606_id" value={form.categoria_606_id} onChange={onChange} required>
                  <option value="">Seleccione…</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                </select></div>
              <div className="form-grupo"><label>NCF</label>
                <input name="ncf" value={form.ncf} onChange={onChange} required /></div>
              <div className="form-grupo"><label>Fecha del comprobante</label>
                <input type="date" name="fecha_comprobante" value={form.fecha_comprobante} onChange={onChange} required /></div>
              <div className="form-grupo"><label>Fecha de pago</label>
                <input type="date" name="fecha_pago" value={form.fecha_pago} onChange={onChange} /></div>
              <div className="form-grupo"><label>Monto en servicios</label>
                <input type="number" step="0.01" min="0" name="monto_servicios" value={form.monto_servicios} onChange={onChange} /></div>
              <div className="form-grupo"><label>Monto en bienes</label>
                <input type="number" step="0.01" min="0" name="monto_bienes" value={form.monto_bienes} onChange={onChange} /></div>
              <div className="form-grupo"><label>ITBIS facturado</label>
                <input type="number" step="0.01" min="0" name="itbis_facturado" value={form.itbis_facturado} onChange={onChange} /></div>
              <div className="form-grupo col-span-2">
                <label><input type="checkbox" name="es_pago_exterior" checked={form.es_pago_exterior} onChange={onChange} /> Es un pago al exterior (va en el formato 609, no en el 606)</label>
              </div>
              {form.es_pago_exterior && (
                <>
                  <div className="form-grupo"><label>País del beneficiario (ISO, ej. US)</label>
                    <input name="pais_beneficiario" value={form.pais_beneficiario} onChange={onChange} maxLength={2} required /></div>
                  <div className="form-grupo"><label>Tipo de renta (código DGII)</label>
                    <input name="tipo_renta_exterior" value={form.tipo_renta_exterior} onChange={onChange} maxLength={2} /></div>
                  <div className="form-grupo"><label>ISR retenido</label>
                    <input type="number" step="0.01" min="0" name="monto_retencion_renta" value={form.monto_retencion_renta} onChange={onChange} /></div>
                </>
              )}
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalAnular && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalAnular(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <h3>Anular gasto</h3>
              <button className="modal-cerrar" onClick={() => setModalAnular(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p>¿Anular el gasto de <strong>{modalAnular.proveedor_nombre}</strong> (NCF {modalAnular.ncf})? No se borra: queda fuera del próximo 606.</p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModalAnular(null)}>Cancelar</button>
              <button className="btn-primary" onClick={anular}>Anular</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const FORMATOS = [
  { id: '606', nombre: '606 — Compras' },
  { id: '607', nombre: '607 — Ventas' },
  { id: '608', nombre: '608 — Anulados' },
  { id: '609', nombre: '609 — Pagos al exterior' },
]

function Reportes({ mostrar }) {
  const [periodo, setPeriodo] = useState('')
  const [it1, setIt1] = useState(null)
  const [cargandoIt1, setCargandoIt1] = useState(false)
  const periodoValido = /^\d{4}(0[1-9]|1[0-2])$/.test(periodo)

  async function descargar(formato) {
    if (!periodoValido) return mostrar('El período debe tener el formato AAAAMM, por ejemplo 202609')
    try {
      await descargarProtegido(`/contabilidad/reportes/${formato}?periodo=${periodo}`, `DGII_F_${formato}_${periodo}.TXT`)
    } catch (err) { mostrar(err.message) }
  }

  async function verIt1() {
    if (!periodoValido) return mostrar('El período debe tener el formato AAAAMM, por ejemplo 202609')
    setCargandoIt1(true)
    try {
      const res = await api.get(`/contabilidad/reportes/it1?periodo=${periodo}`)
      setIt1(res.data)
    } catch (err) { mostrar(err.message) }
    finally { setCargandoIt1(false) }
  }

  return (
    <div>
      <div className="form-grupo">
        <label>Período (AAAAMM)</label>
        <input value={periodo} onChange={(e) => setPeriodo(e.target.value.replace(/\D/g, ''))} placeholder="202609" maxLength={6} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
        {FORMATOS.map((f) => (
          <button key={f.id} className="btn-secondary" disabled={!periodoValido} onClick={() => descargar(f.id)}>
            <i className="fas fa-download"></i> {f.nombre}
          </button>
        ))}
        <button className="btn-primary" disabled={!periodoValido || cargandoIt1} onClick={verIt1}>
          {cargandoIt1 ? 'Calculando…' : 'Ver borrador del IT-1'}
        </button>
      </div>

      {it1 && (
        <table className="tabla-crud">
          <tbody>
            <tr><td>ITBIS facturado en ventas</td><td>{it1.ventas.itbis_facturado.toFixed(2)}</td></tr>
            <tr><td>ITBIS que terceros le retuvieron</td><td>{it1.ventas.itbis_retenido_por_terceros.toFixed(2)}</td></tr>
            <tr><td>ITBIS adelantado en compras</td><td>{it1.compras.itbis_adelantado.toFixed(2)}</td></tr>
            <tr><td><strong>ITBIS a pagar (borrador)</strong></td><td><strong>{it1.itbis_a_pagar.toFixed(2)}</strong></td></tr>
          </tbody>
        </table>
      )}
      <p style={{ color: '#667', fontSize: 13 }}>El IT-1 es un borrador orientativo calculado desde las facturas y los gastos del sistema; no sustituye la presentación formal ante la DGII.</p>
    </div>
  )
}

function EcfRecibidos({ puedeEditar, mostrar }) {
  const [recibidos, setRecibidos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [xml, setXml] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [modalAprobar, setModalAprobar] = useState(null)
  const [categoriaElegida, setCategoriaElegida] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [resRecibidos, resCategorias] = await Promise.all([
        api.get('/contabilidad/ecf-recibidos'),
        api.get('/contabilidad/gastos/categorias-606'),
      ])
      setRecibidos(resRecibidos.data)
      setCategorias(resCategorias.data)
    } catch (err) { mostrar(err.message) }
    finally { setCargando(false) }
  }, [mostrar])
  useEffect(() => { cargar() }, [cargar])

  async function subirXml(e) {
    e.preventDefault()
    if (!xml.trim()) return
    setSubiendo(true)
    try {
      await api.post('/contabilidad/ecf-recibidos', { xml })
      setXml('')
      mostrar('e-CF recibido registrado', 'exito')
      cargar()
    } catch (err) {
      mostrar(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  function abrirAprobar(r) {
    setModalAprobar(r); setCategoriaElegida('')
  }

  async function aprobar() {
    try {
      await api.post(`/contabilidad/ecf-recibidos/${modalAprobar.id}/aprobar`, { categoria_606_id: categoriaElegida })
      mostrar('e-CF aprobado: se creó el gasto', 'exito')
      setModalAprobar(null)
      cargar()
    } catch (err) { mostrar(err.message) }
  }

  async function rechazar(r) {
    try {
      await api.post(`/contabilidad/ecf-recibidos/${r.id}/rechazar`, { motivo: 'Rechazado desde la bandeja' })
      mostrar('e-CF rechazado', 'exito')
      cargar()
    } catch (err) { mostrar(err.message) }
  }

  return (
    <>
      {puedeEditar && (
        <form onSubmit={subirXml} style={{ marginBottom: 16 }}>
          <div className="form-grupo">
            <label>Pegar el XML del e-CF recibido de un proveedor</label>
            <textarea rows={4} style={{ width: '100%' }} value={xml} onChange={(e) => setXml(e.target.value)} placeholder="<ECF>...</ECF>" />
          </div>
          <button className="btn-primary" type="submit" disabled={subiendo || !xml.trim()}>{subiendo ? 'Registrando…' : 'Registrar en la bandeja'}</button>
        </form>
      )}
      {cargando ? <p>Cargando…</p> : (
        <table className="tabla-crud">
          <thead><tr><th>eNCF</th><th>Emisor</th><th>Fecha</th><th>Monto total</th><th>Estado</th>{puedeEditar && <th>Acciones</th>}</tr></thead>
          <tbody>
            {recibidos.map((r) => (
              <tr key={r.id}>
                <td>{r.encf}</td>
                <td>{r.razon_social_emisor || r.rnc_emisor}</td>
                <td>{r.fecha_emision ? String(r.fecha_emision).slice(0, 10) : '—'}</td>
                <td>{Number(r.monto_total).toFixed(2)}</td>
                <td>{r.estado}</td>
                {puedeEditar && (
                  <td>
                    {r.estado === 'pendiente' && (
                      <>
                        <button className="btn-mini" onClick={() => abrirAprobar(r)}>Aprobar</button>
                        <button className="btn-mini" onClick={() => rechazar(r)}>Rechazar</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!recibidos.length && <tr><td colSpan={6}>Sin e-CF recibidos.</td></tr>}
          </tbody>
        </table>
      )}

      {modalAprobar && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalAprobar(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <h3>Aprobar e-CF recibido</h3>
              <button className="modal-cerrar" onClick={() => setModalAprobar(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p>Esto crea un gasto precargado con los datos del e-CF de <strong>{modalAprobar.razon_social_emisor || modalAprobar.rnc_emisor}</strong>. Elige su categoría 606:</p>
            <div className="form-grupo">
              <select value={categoriaElegida} onChange={(e) => setCategoriaElegida(e.target.value)}>
                <option value="">Seleccione…</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setModalAprobar(null)}>Cancelar</button>
              <button className="btn-primary" disabled={!categoriaElegida} onClick={aprobar}>Aprobar y crear el gasto</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
