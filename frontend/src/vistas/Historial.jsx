import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import './vistas.css'

const fmt = (n) => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fechaLegible = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit' }) : '—'

const BADGE_ESTADO = {
  emitida:  'badge-verde',
  borrador: 'badge-gris',
  anulada:  'badge-rojo',
}

export default function Historial() {
  const { usuario } = useAuth()
  const [facturas, setFacturas]   = useState([])
  const [cargando, setCargando]   = useState(true)
  const [buscar, setBuscar]       = useState('')
  const [estado, setEstado]       = useState('')
  const [desde, setDesde]         = useState('')
  const [hasta, setHasta]         = useState('')
  const [detalle, setDetalle]     = useState(null)
  const [cargandoDet, setCargDet] = useState(false)
  const [modalAnular, setAnular]  = useState(null)
  const { toast, mostrar, cerrar } = useToast()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      let url = '/facturas?'
      if (buscar) url += `buscar=${encodeURIComponent(buscar)}&`
      if (estado) url += `estado=${estado}&`
      if (desde)  url += `desde=${desde}&`
      if (hasta)  url += `hasta=${hasta}`
      const res = await api.get(url)
      setFacturas(res.data)
    } catch { /* silencioso */ }
    finally { setCargando(false) }
  }, [buscar, estado, desde, hasta])

  useEffect(() => {
    const t = setTimeout(cargar, 300)
    return () => clearTimeout(t)
  }, [cargar])

  async function verDetalle(id) {
    setCargDet(true); setDetalle({ id })
    try {
      const res = await api.get(`/facturas/${id}`)
      setDetalle(res.data)
    } catch (err) { mostrar(err.message); setDetalle(null) }
    finally { setCargDet(false) }
  }

  async function anular() {
    if (!modalAnular) return
    try {
      await api.put(`/facturas/${modalAnular.id}/anular`)
      setAnular(null); cargar()
      mostrar('Factura anulada', 'success')
    } catch (err) { mostrar(err.message) }
  }

  return (
    <>
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-clock-rotate-left"></i> Historial de facturas</h2>
      </div>

      <div className="vista-toolbar" style={{ flexWrap:'wrap' }}>
        <input className="buscar-input" placeholder="Buscar por número o NCF..."
          value={buscar} onChange={e => setBuscar(e.target.value)} />
        <select style={{ padding:'9px 12px', borderRadius:8, border:'1.5px solid #d0d8e4', fontSize:'0.93rem', background:'#f8fafc' }}
          value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="emitida">Emitidas</option>
          <option value="anulada">Anuladas</option>
          <option value="borrador">Borradores</option>
        </select>
        <input type="date" title="Desde" value={desde} onChange={e => setDesde(e.target.value)}
          style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid #d0d8e4', fontSize:'0.9rem', background:'#f8fafc' }} />
        <input type="date" title="Hasta" value={hasta} onChange={e => setHasta(e.target.value)}
          style={{ padding:'8px 10px', borderRadius:8, border:'1.5px solid #d0d8e4', fontSize:'0.9rem', background:'#f8fafc' }} />
      </div>

      <div className="tabla-wrap">
        <table className="tabla-crud">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>NCF</th>
              <th>Total</th>
              <th>Estado</th>
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px', color:'#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight:8 }}></i>Cargando...
              </td></tr>
            ) : facturas.length === 0 ? (
              <tr className="tabla-vacia-row"><td colSpan={7}>
                <i className="fas fa-file-invoice"></i>
                {buscar || estado || desde || hasta ? 'No se encontraron facturas' : 'Aún no hay facturas emitidas'}
              </td></tr>
            ) : facturas.map(f => (
              <tr key={f.id}>
                <td data-label="Número"><strong style={{ fontFamily:'monospace', color:'#17406d' }}>{f.numero}</strong></td>
                <td data-label="Fecha">{fechaLegible(f.fecha)}</td>
                <td data-label="Cliente">{f.cliente_nombre}</td>
                <td data-label="NCF" style={{ fontFamily:'monospace', fontSize:'0.85rem' }}>{f.nfc_numero || '—'}</td>
                <td data-label="Total"><strong>RD$ {fmt(f.total)}</strong></td>
                <td data-label="Estado"><span className={`badge ${BADGE_ESTADO[f.estado] || 'badge-gris'}`}>{f.estado}</span></td>
                <td className="col-acciones">
                  <button className="btn-icono editar" onClick={() => verDetalle(f.id)} title="Ver detalle"><i className="fas fa-eye"></i></button>
                  {usuario?.rol === 'admin' && f.estado !== 'anulada' && (
                    <button className="btn-icono eliminar" onClick={() => setAnular(f)} title="Anular"><i className="fas fa-ban"></i></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetalle(null)}>
          <div className="modal-box modal-lg">
            <div className="modal-header">
              <h3><i className="fas fa-file-invoice"></i> Factura {detalle.numero || ''}</h3>
              <button className="modal-cerrar" onClick={() => setDetalle(null)}><i className="fas fa-xmark"></i></button>
            </div>

            {cargandoDet ? (
              <div style={{ textAlign:'center', padding:'40px', color:'#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize:'1.6rem' }}></i>
              </div>
            ) : (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, fontSize:'0.9rem', marginBottom:16 }}>
                  <div><span style={{ color:'#99a' }}>Cliente:</span> <strong>{detalle.cliente_nombre}</strong></div>
                  <div><span style={{ color:'#99a' }}>RNC/Cédula:</span> {detalle.cliente_rnc || '—'}</div>
                  <div><span style={{ color:'#99a' }}>Fecha:</span> {fechaLegible(detalle.fecha)}</div>
                  <div><span style={{ color:'#99a' }}>NCF:</span> <span style={{ fontFamily:'monospace' }}>{detalle.nfc_numero || '—'}</span></div>
                  <div><span style={{ color:'#99a' }}>Tipo de servicio:</span> {detalle.tipo_servicio_nombre || '—'}</div>
                  <div><span style={{ color:'#99a' }}>Estado:</span> <span className={`badge ${BADGE_ESTADO[detalle.estado] || 'badge-gris'}`}>{detalle.estado}</span></div>
                </div>

                <div className="tabla-wrap">
                  <table className="tabla-crud">
                    <thead>
                      <tr><th>Artículo</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>
                    </thead>
                    <tbody>
                      {(detalle.items || []).map(it => (
                        <tr key={it.id}>
                          <td data-label="Artículo">
                            {it.articulo_nombre}
                            {it.descripcion_custom ? ` — ${it.descripcion_custom}` : ''}
                            {it.ancho && it.alto ? <span style={{ color:'#99a' }}> ({it.ancho}×{it.alto} {it.unidad_abreviatura})</span> : null}
                          </td>
                          <td data-label="Cant.">{it.cantidad}</td>
                          <td data-label="Precio">RD$ {fmt(it.precio_unitario)}</td>
                          <td data-label="Subtotal">RD$ {fmt(it.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop:16, marginLeft:'auto', width:'min(320px, 100%)', fontSize:'0.92rem' }}>
                  {[
                    ['Subtotal:', fmt(detalle.subtotal)],
                    ['ITBIS:', fmt(detalle.itbis)],
                    ['RET. ITBIS:', `(${fmt(detalle.ret_itbis)})`],
                    ['RET. ISR:', `(${fmt(detalle.ret_isr)})`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', color:'#556' }}>
                      <span>{l}</span><span>RD$ {v}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0 0', marginTop:6, borderTop:'2px solid #edf1f7', fontWeight:700, color:'#17406d', fontSize:'1.05rem' }}>
                    <span>Total:</span><span>RD$ {fmt(detalle.total)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modalAnular && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAnular(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <h3><i className="fas fa-triangle-exclamation"></i> Anular factura</h3>
              <button className="modal-cerrar" onClick={() => setAnular(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <p style={{ color:'#444' }}>¿Anular la factura <strong>{modalAnular.numero}</strong>? El NCF ya consumido no se recupera.</p>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setAnular(null)}>Cancelar</button>
              <button className="btn-danger" onClick={anular}><i className="fas fa-ban"></i> Anular</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <Toast toast={toast} onClose={cerrar} />
    </>
  )
}
