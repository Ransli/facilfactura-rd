import { useState, useMemo, useEffect, useCallback } from 'react'
import { Fragment } from 'react'
import './Factura.css'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import { guardarBorrador, leerBorrador, limpiarBorrador } from '../utils/borrador'

const fmt = (n) =>
  Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fechaHoy = () => new Date().toISOString().split('T')[0]

const whatsappUrl = (tel, cel) => {
  const num = (cel || tel || '').replace(/\D/g, '')
  if (!num) return null
  const intl = num.length === 10 ? `1${num}` : num
  return `https://web.whatsapp.com/send?phone=${intl}`
}

const horaCorta = (iso) =>
  new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })

const fechaLegible = (iso) =>
  iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-DO', { year: 'numeric', month: 'short', day: '2-digit' }) : '—'

export default function Factura() {
  const [config, setConfig]               = useState(null)
  const [articulosCatalogo, setCatalogo]  = useState([])
  const [tiposServicio, setTiposServicio] = useState([])
  const [unidades, setUnidades]           = useState([])
  const [alertaNcf, setAlertaNcf]         = useState(null)

  // La factura en curso arranca desde el borrador local, si quedó uno.
  const borradorInicial = useMemo(() => leerBorrador(), [])

  const [items, setItems]                 = useState(() => borradorInicial?.items ?? [])
  const [cliente, setCliente]             = useState(() => borradorInicial?.cliente ?? null)
  const [tipoServicioId, setTipoSvcId]    = useState(() => borradorInicial?.tipoServicioId ?? '')
  const [vencimiento, setVencimiento]     = useState(() => borradorInicial?.vencimiento ?? '')
  const [facturaGuardada, setFacturaG]    = useState(null)
  const [guardando, setGuardando]         = useState(false)
  const [guardadoEn, setGuardadoEn]       = useState(borradorInicial?.guardadoEn ?? null)
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false)

  const [modalArts, setModalArts]         = useState(false)
  const [seleccionados, setSeleccionados] = useState({})

  const { toast, mostrar, cerrar }        = useToast()

  const [modalCli, setModalCli]           = useState(false)
  const [buscarCli, setBuscarCli]         = useState('')
  const [clientes, setClientes]           = useState([])
  const [cargandoCli, setCargandoCli]     = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const [cfg, arts, tipos, unis] = await Promise.all([
          api.get('/configuracion'),
          api.get('/articulos'),
          api.get('/tipos-servicio'),
          api.get('/unidades-medida'),
        ])
        setConfig(cfg.data)
        setCatalogo(arts.data)
        setTiposServicio(tipos.data)
        setUnidades(unis.data)
      } catch (err) {
        console.error('Error cargando datos de factura:', err)
      }
    }
    init()
  }, [])

  const buscarClientes = useCallback(async (q) => {
    setCargandoCli(true)
    try {
      const res = await api.get(`/clientes${q ? `?buscar=${encodeURIComponent(q)}` : ''}`)
      setClientes(res.data)
    } catch { /* silencioso */ }
    finally { setCargandoCli(false) }
  }, [])

  useEffect(() => {
    if (!modalCli) return
    const t = setTimeout(() => buscarClientes(buscarCli), 300)
    return () => clearTimeout(t)
  }, [modalCli, buscarCli, buscarClientes])

  const subtotal    = useMemo(() => items.reduce((s, i) => s + Number(i.subtotal), 0), [items])
  const pctItbis    = config?.itbis_porcentaje    ?? 18
  const pctRetItbis = config?.ret_itbis_porcentaje ?? 100
  const pctRetIsr   = config?.ret_isr_porcentaje  ?? 10
  const itbis       = subtotal * (pctItbis / 100)
  const retItbis    = itbis * (pctRetItbis / 100)
  const retIsr      = subtotal * (pctRetIsr / 100)
  const total       = subtotal - retIsr
  const moneda      = config?.moneda || 'DOP'

  const artsPorCategoria = useMemo(() => {
    const grupos = {}
    for (const a of articulosCatalogo) {
      const key = a.categoria_nombre
      if (!grupos[key]) grupos[key] = { nombre: key, orden: a.categoria_orden || 0, articulos: [] }
      grupos[key].articulos.push(a)
    }
    return Object.values(grupos).sort((a, b) => a.orden - b.orden)
  }, [articulosCatalogo])

  function toggleArticulo(art) {
    setSeleccionados(prev => {
      if (prev[art.id]) {
        const next = { ...prev }; delete next[art.id]; return next
      }
      const def = (art.precios || []).find(p => p.es_precio_default) || art.precios?.[0]
      return {
        ...prev,
        [art.id]: {
          articulo: art,
          cantidad: 1,
          unidad_medida_id: def?.unidad_medida_id || art.unidad_medida_id,
          precio_unitario: def?.precio_unitario || 0,
          ancho: '', alto: '',
        },
      }
    })
  }

  function cambiarUnidad(artId, unidadId, precios) {
    const p = precios.find(x => String(x.unidad_medida_id) === String(unidadId))
    setSeleccionados(prev => ({
      ...prev,
      [artId]: { ...prev[artId], unidad_medida_id: unidadId, precio_unitario: p?.precio_unitario ?? prev[artId].precio_unitario },
    }))
  }

  function cambiarSel(artId, campo, valor) {
    setSeleccionados(prev => ({ ...prev, [artId]: { ...prev[artId], [campo]: valor } }))
  }

  function agregarSeleccionados() {
    const nuevos = Object.values(seleccionados).map(({ articulo: art, cantidad, unidad_medida_id, precio_unitario, ancho, alto }) => {
      const unidad = unidades.find(u => String(u.id) === String(unidad_medida_id))
      const subtotalItem = art.tiene_dimensiones && ancho && alto
        ? Number(ancho) * Number(alto) * Number(precio_unitario) * Number(cantidad)
        : Number(cantidad) * Number(precio_unitario)
      return {
        articulo_id: art.id, articulo_nombre: art.nombre,
        descripcion_custom: art.descripcion || '',
        categoria_nombre: art.categoria_nombre, categoria_orden: art.categoria_orden || 0,
        tiene_dimensiones: art.tiene_dimensiones,
        cantidad: Number(cantidad), ancho: ancho || null, alto: alto || null,
        unidad_medida_id, unidad_nombre: unidad?.nombre || '', unidad_abreviatura: unidad?.abreviatura || '',
        precio_unitario: Number(precio_unitario), tipo_precio: 'unitario',
        subtotal: subtotalItem,
      }
    })
    setItems(prev => [...prev, ...nuevos])
    setSeleccionados({}); setModalArts(false)
  }

  const itemsPorCategoria = useMemo(() => {
    const grupos = {}
    for (const item of items) {
      const key = item.categoria_nombre
      if (!grupos[key]) grupos[key] = { nombre: key, orden: item.categoria_orden, items: [] }
      grupos[key].items.push(item)
    }
    return Object.values(grupos).sort((a, b) => a.orden - b.orden)
  }, [items])

  // Cada cambio en la factura se persiste. Una vez emitida ya no hay borrador
  // que mantener: lo que vale es lo que quedó en la base.
  useEffect(() => {
    if (facturaGuardada) return
    setGuardadoEn(guardarBorrador({ items, cliente, tipoServicioId, vencimiento }))
  }, [items, cliente, tipoServicioId, vencimiento, facturaGuardada])

  useEffect(() => {
    if (borradorInicial) mostrar('Se recuperó la factura que estabas editando', 'success')
  }, [borradorInicial, mostrar])

  async function guardar() {
    if (!cliente)              { mostrar('Selecciona un cliente', 'warning'); return }
    if (items.length === 0)    { mostrar('Agrega al menos un artículo', 'warning'); return }
    if (!config?.empresa_id)   { mostrar('Configura los datos de la empresa primero en Configuración', 'warning'); return }
    setGuardando(true)
    try {
      const res = await api.post('/facturas', {
        cliente_id: cliente.id, empresa_id: config.empresa_id,
        tipo_servicio_id: tipoServicioId || null,
        fecha: fechaHoy(), vencimiento: vencimiento || null,
        items: items.map(i => ({
          articulo_id: i.articulo_id, descripcion_custom: i.descripcion_custom,
          cantidad: i.cantidad, ancho: i.ancho, alto: i.alto,
          unidad_medida_id: i.unidad_medida_id, precio_unitario: i.precio_unitario,
          tipo_precio: i.tipo_precio, subtotal: i.subtotal,
        })),
      })
      setFacturaG(res.data)
      limpiarBorrador()
      setGuardadoEn(null)
      if (res.alerta_ncf) setAlertaNcf(res.alerta_ncf_mensaje)
    } catch (err) { mostrar(err.message) }
    finally { setGuardando(false) }
  }

  async function imprimir() {
    try {
      const res = await api.get('/nfc/activa')
      if (res.alerta) setAlertaNcf(res.alerta_mensaje)
    } catch { /* silencioso */ }
    window.print()
  }

  function nuevaFactura() {
    limpiarBorrador()
    setGuardadoEn(null)
    setItems([]); setCliente(null); setTipoSvcId('');
    setVencimiento(''); setFacturaG(null); setAlertaNcf(null)
  }

  // Dos clics en vez de un window.confirm: no bloquea el navegador y se
  // rearma solo si el usuario se arrepiente.
  function descartarBorrador() {
    if (!confirmandoDescarte) {
      setConfirmandoDescarte(true)
      setTimeout(() => setConfirmandoDescarte(false), 4000)
      return
    }
    setConfirmandoDescarte(false)
    nuevaFactura()
    mostrar('Borrador descartado', 'info')
  }

  const empresa = config ? { nombre: config.empresa_nombre, rnc: config.empresa_rnc, logo_path: config.logo_path } : null

  return (
    <>
    <section className="factura-main">

      {!facturaGuardada && guardadoEn && (
        <div className="factura-borrador no-print">
          <i className="fas fa-cloud-arrow-down"></i>
          <div className="factura-borrador-texto">
            <strong>En edición</strong> — esta factura aún no se ha emitido.
            <span> Guardada en este navegador a las {horaCorta(guardadoEn)}.</span>
          </div>
          <button
            type="button"
            className={`factura-borrador-btn${confirmandoDescarte ? ' confirmando' : ''}`}
            onClick={descartarBorrador}
          >
            <i className={`fas ${confirmandoDescarte ? 'fa-triangle-exclamation' : 'fa-trash'}`}></i>
            {confirmandoDescarte ? '¿Seguro? Clic de nuevo' : 'Descartar'}
          </button>
        </div>
      )}

      {alertaNcf && (
        <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:10, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'flex-start', gap:10, color:'#7a5500', fontSize:'0.92rem' }}>
          <i className="fas fa-triangle-exclamation" style={{ marginTop:2, flexShrink:0 }}></i>
          <div style={{ flex:1 }}>{alertaNcf}</div>
          <button style={{ background:'none', border:'none', cursor:'pointer', color:'#7a5500', fontSize:'1rem' }} onClick={() => setAlertaNcf(null)}>
            <i className="fas fa-xmark"></i>
          </button>
        </div>
      )}

      {facturaGuardada && (
        <div style={{ background:'#e8f8ee', border:'1px solid #b2dfc5', borderRadius:10, padding:'12px 18px', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
          <div style={{ color:'#1a5e35', fontSize:'0.93rem' }}>
            <i className="fas fa-circle-check" style={{ marginRight:8 }}></i>
            Factura <strong>{facturaGuardada.numero}</strong> guardada — NCF: <strong style={{ fontFamily:'monospace' }}>{facturaGuardada.nfc_numero}</strong>
          </div>
          <button className="btn-factura" style={{ padding:'6px 14px', fontSize:'0.85rem' }} onClick={nuevaFactura}>
            <i className="fas fa-plus"></i> Nueva factura
          </button>
        </div>
      )}

      {/* ── ENCABEZADO ── */}
      <div className="factura-header">
        {empresa?.logo_path
          ? <img src={`http://localhost:3002${empresa.logo_path}`} alt="Logo empresa" className="factura-logo" />
          : <img src="/logo.svg" alt="Logo empresa" className="factura-logo" />
        }
        <div className="factura-titulo">
          <h1>FACTURA</h1>
          <div className="factura-no">
            # No. Factura <span>{facturaGuardada?.numero || '(pendiente)'}</span>
          </div>
        </div>
      </div>

      {/* ── INFORMACIÓN ── */}
      <div className="factura-infos-row">

        <div className="factura-info-col">
          <div className="info-block">
            <div className="info-value"><strong>{empresa?.nombre || '—'}</strong></div>
            <div className="info-label">RNC:</div>
            <div className="info-value">{empresa?.rnc || '—'}</div>
          </div>

          <div className="info-block">
            <div className="info-label">Cobrar a:</div>
            <div className="info-value">
              <strong>{cliente?.nombre || '—'}</strong>
              {!facturaGuardada && (
                <button className="btn-mini" onClick={() => { setBuscarCli(''); setModalCli(true) }}>
                  <i className="fa fa-user"></i> Elegir
                </button>
              )}
            </div>
            <div className="info-label">RNC / Cédula:</div>
            <div className="info-value">{cliente?.rnc || '—'}</div>
          </div>
        </div>

        <div className="factura-info-col">
          <div className="info-block">
            <div className="info-label">Tipo de servicio:</div>
            <div className="info-value" style={{ flexDirection:'column', alignItems:'flex-start', gap:6 }}>
              {facturaGuardada
                ? <strong>{tiposServicio.find(t => String(t.id) === String(tipoServicioId))?.nombre || '—'}</strong>
                : (
                  <select value={tipoServicioId} onChange={e => setTipoSvcId(e.target.value)}
                    style={{ border:'1px solid #d0d8e4', borderRadius:6, padding:'5px 8px', fontSize:'0.92rem', background:'#f8fafc', width:'100%' }}>
                    <option value="">Seleccionar...</option>
                    {tiposServicio.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                )
              }
            </div>
          </div>
        </div>

        <div className="factura-info-col factura-info-fecha">
          <div className="info-block">
            <div className="info-label">Fecha:</div>
            <div className="info-value">{fechaLegible(fechaHoy())}</div>
          </div>
          <div className="info-block">
            <div className="info-label">Condiciones de pago:</div>
            <div className="info-value">100%</div>
          </div>
          <div className="info-block">
            <div className="info-label">Fecha de vencimiento:</div>
            <div className="info-value">
              {facturaGuardada
                ? fechaLegible(vencimiento)
                : <input type="date" value={vencimiento} onChange={e => setVencimiento(e.target.value)}
                    style={{ border:'1px solid #d0d8e4', borderRadius:6, padding:'4px 8px', fontSize:'0.92rem', background:'#f8fafc' }} />
              }
            </div>
          </div>
          <div className="info-block">
            <div className="info-label">NCF:</div>
            <div className="info-value" style={{ fontFamily:'monospace', fontSize:'0.95rem' }}>
              {facturaGuardada?.nfc_numero || '(se asigna al guardar)'}
            </div>
          </div>
        </div>
      </div>

      {/* ── SALDO TOTAL ── */}
      <div className="factura-saldo-total-row">
        <div className="factura-saldo-total">
          <span className="saldo-label"><strong>Saldo Total:</strong></span>
          <span className="saldo-valor">{moneda} {fmt(total)}</span>
        </div>
      </div>

      {/* ── BOTONES ── */}
      <div className="factura-botones">
        {!facturaGuardada && (
          <button className="btn-factura" onClick={guardar} disabled={guardando}>
            {guardando
              ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</>
              : <><i className="fa-solid fa-save"></i> Guardar</>}
          </button>
        )}
        {!facturaGuardada && (
          <button className="btn-factura" onClick={() => setModalArts(true)}>
            <i className="fa-solid fa-plus"></i> Agregar artículo
          </button>
        )}
        <button className="btn-factura" onClick={imprimir}>
          <i className="fa-solid fa-print"></i> Imprimir
        </button>
        {whatsappUrl(cliente?.telefono, cliente?.celular) && (
          <a className="btn-factura btn-wsp"
            href={whatsappUrl(cliente?.telefono, cliente?.celular)}
            target="_blank" rel="noreferrer">
            <i className="fab fa-whatsapp"></i> WhatsApp
          </a>
        )}
        {!facturaGuardada && (
          <button className="btn-factura btn-danger" onClick={() => {
            if (window.confirm('¿Eliminar todos los artículos?')) setItems([])
          }}>
            <i className="fa-solid fa-trash"></i> Limpiar
          </button>
        )}
        {facturaGuardada && (
          <button className="btn-factura" onClick={nuevaFactura}>
            <i className="fa-solid fa-plus"></i> Nueva factura
          </button>
        )}
      </div>

      {/* ── TABLA DE ARTÍCULOS ── */}
      <div className="factura-tabla">
        <table>
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Descripción</th>
              <th className="col-cant">Cant.</th>
              <th className="col-tasa">Tasa</th>
              <th className="col-total">Total</th>
              {!facturaGuardada && <th className="col-accion">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {itemsPorCategoria.length === 0 ? (
              <tr>
                <td colSpan={6} className="tabla-vacia">
                  <i className="fa-solid fa-inbox"></i>
                  <span>Sin artículos. Haz clic en "Agregar artículo".</span>
                </td>
              </tr>
            ) : itemsPorCategoria.map((grupo, gi) => {
              const totalGrupo = grupo.items.reduce((s, i) => s + Number(i.subtotal), 0)
              const cantGrupo  = grupo.items.reduce((s, i) => s + Number(i.cantidad), 0)
              return (
                <Fragment key={gi}>
                  <tr className="categoria-row">
                    <td data-label="Categoría"><strong>{grupo.nombre}</strong></td>
                    <td className="col-cat-total" data-label="Total"><strong>{moneda} {fmt(totalGrupo)}</strong></td>
                    <td className="col-cat-cant" data-label="Cant.">{cantGrupo}</td>
                    <td></td>
                    <td className="col-total col-cat-hide"><strong>{moneda} {fmt(totalGrupo)}</strong></td>
                    {!facturaGuardada && <td></td>}
                  </tr>
                  {grupo.items.map((item, ii) => {
                    const idxGlobal = items.indexOf(item)
                    const dim = item.tiene_dimensiones && item.ancho && item.alto
                      ? ` (${item.ancho} × ${item.alto} ${item.unidad_abreviatura})`
                      : ` (${item.cantidad} ${item.unidad_abreviatura})`
                    return (
                      <tr key={ii} className="producto-row">
                        <td className="col-prod-hide"></td>
                        <td className="descripcion-detalle" data-label="Artículo">
                          {item.articulo_nombre}
                          {item.descripcion_custom ? ` — ${item.descripcion_custom}` : ''}
                          <span style={{ color:'#99a', fontSize:'0.85em' }}>{dim}</span>
                        </td>
                        <td className="col-cant" data-label="Cant.">{item.cantidad}</td>
                        <td className="col-tasa" data-label="Precio">{moneda} {fmt(item.precio_unitario)}</td>
                        <td className="col-total" data-label="Total">{moneda} {fmt(item.subtotal)}</td>
                        {!facturaGuardada && (
                          <td className="col-accion">
                            <button className="btn-eliminar-prod" onClick={() => setItems(p => p.filter((_, i) => i !== idxGlobal))}>
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── TOTALES Y MÉTODO DE PAGO ── */}
      <div className="factura-totales">
        <div className="factura-totales-numeros">
          {[
            [`Subtotal:`,                     fmt(subtotal)],
            [`ITBIS (${pctItbis}%):`,         fmt(itbis)],
            [`RET. ITBIS (${pctRetItbis}%):`, `(${fmt(retItbis)})`],
            [`RET. ISR ${pctRetIsr}%:`,        `(${fmt(retIsr)})`],
          ].map(([label, val]) => (
            <div key={label} className="total-fila">
              <span>{label}</span><span>{moneda} {val}</span>
            </div>
          ))}
          <div className="total-fila total-pagar">
            <span>Total a pagar:</span><span>{moneda} {fmt(total)}</span>
          </div>
        </div>
        <div className="factura-metodo-pago">
          <strong>Método de pago:</strong><br />
          {(config?.metodos_pago || []).length === 0
            ? <span style={{ color:'#99a', fontSize:'0.88rem' }}>Sin métodos configurados.</span>
            : (config.metodos_pago).map((m, i) => (
              <span key={i}>
                {m.banco && <><strong>{m.banco}:</strong> </>}{m.numero_cuenta}
                {m.titular && ` — ${m.titular}`}<br />
              </span>
            ))
          }
        </div>
      </div>

      {/* ── MODAL: ARTÍCULOS ── */}
      {modalArts && (
        <div className="modal abierto" onClick={e => e.target.classList.contains('modal') && setModalArts(false)}>
          <div className="modal-contenido modal-productos-wide" style={{ maxHeight:'85vh', overflowY:'auto', width:580 }}>
            <h3><i className="fa-solid fa-box"></i> Seleccionar artículos</h3>

            {artsPorCategoria.length === 0 && (
              <p style={{ color:'#99a', textAlign:'center', padding:'20px 0' }}>
                No hay artículos en el catálogo. Agrégalos en la vista <strong>Productos</strong>.
              </p>
            )}

            {artsPorCategoria.map(grupo => (
              <div key={grupo.nombre} style={{ marginBottom:14 }}>
                <div style={{ fontWeight:700, color:'#17406d', fontSize:'0.88rem', marginBottom:6, padding:'5px 0', borderBottom:'1px solid #e8eef5' }}>
                  {grupo.nombre}
                </div>
                {grupo.articulos.map(art => {
                  const sel = seleccionados[art.id]
                  return (
                    <div key={art.id} style={{ marginBottom:8 }}>
                      <div className={`producto-opcion${sel ? ' seleccionado' : ''}`} onClick={() => toggleArticulo(art)}>
                        <span className={`checkbox-custom${sel ? ' marcado' : ''}`}>
                          {sel && <i className="fa-solid fa-check"></i>}
                        </span>
                        <div className="producto-opcion-info">
                          <strong>{art.nombre}</strong>
                          {art.descripcion && <span className="producto-categoria">{art.descripcion}</span>}
                          <span className="producto-precio">
                            {(art.precios || []).map((p, i) => (
                              <span key={i} style={{ marginRight:6 }}>
                                {moneda} {fmt(p.precio_unitario)}/{p.unidad_abreviatura}
                                {p.es_precio_default ? ' ★' : ''}
                              </span>
                            ))}
                          </span>
                        </div>
                      </div>

                      {sel && (
                        <div style={{ background:'#eef4ff', border:'1.5px solid #55b6ff', borderTop:'none', borderRadius:'0 0 8px 8px', padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8 }}
                          onClick={e => e.stopPropagation()}>
                          <div>
                            <label style={{ fontSize:'0.78rem', color:'#556', display:'block', marginBottom:2 }}>Unidad</label>
                            <select value={sel.unidad_medida_id} onChange={e => cambiarUnidad(art.id, e.target.value, art.precios || [])}
                              style={{ width:'100%', padding:'5px', borderRadius:6, border:'1px solid #c0d4ee', fontSize:'0.88rem' }}>
                              {(art.precios || []).map(p => (
                                <option key={p.unidad_medida_id} value={p.unidad_medida_id}>{p.unidad_nombre}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:'0.78rem', color:'#556', display:'block', marginBottom:2 }}>Precio unit.</label>
                            <input type="number" step="0.01" value={sel.precio_unitario}
                              onChange={e => cambiarSel(art.id, 'precio_unitario', e.target.value)}
                              style={{ width:'100%', padding:'5px', borderRadius:6, border:'1px solid #c0d4ee', fontSize:'0.88rem' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:'0.78rem', color:'#556', display:'block', marginBottom:2 }}>Cantidad</label>
                            <input type="number" min="0.01" step="0.01" value={sel.cantidad}
                              onChange={e => cambiarSel(art.id, 'cantidad', e.target.value)}
                              style={{ width:'100%', padding:'5px', borderRadius:6, border:'1px solid #c0d4ee', fontSize:'0.88rem' }} />
                          </div>
                          {art.tiene_dimensiones && (
                            <>
                              <div>
                                <label style={{ fontSize:'0.78rem', color:'#556', display:'block', marginBottom:2 }}>Ancho</label>
                                <input type="number" step="0.01" placeholder="0.00" value={sel.ancho}
                                  onChange={e => cambiarSel(art.id, 'ancho', e.target.value)}
                                  style={{ width:'100%', padding:'5px', borderRadius:6, border:'1px solid #c0d4ee', fontSize:'0.88rem' }} />
                              </div>
                              <div>
                                <label style={{ fontSize:'0.78rem', color:'#556', display:'block', marginBottom:2 }}>Alto</label>
                                <input type="number" step="0.01" placeholder="0.00" value={sel.alto}
                                  onChange={e => cambiarSel(art.id, 'alto', e.target.value)}
                                  style={{ width:'100%', padding:'5px', borderRadius:6, border:'1px solid #c0d4ee', fontSize:'0.88rem' }} />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            <div className="modal-botones modal-botones-multi">
              <button className="btn-factura" onClick={agregarSeleccionados} disabled={Object.keys(seleccionados).length === 0}>
                <i className="fa-solid fa-plus"></i>
                {Object.keys(seleccionados).length === 0
                  ? 'Selecciona artículos'
                  : `Agregar ${Object.keys(seleccionados).length} artículo(s)`}
              </button>
              <button className="btn-factura btn-secundario" onClick={() => { setSeleccionados({}); setModalArts(false) }}>
                <i className="fa-solid fa-xmark"></i> Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: CLIENTES ── */}
      {modalCli && (
        <div className="modal abierto" onClick={e => e.target.classList.contains('modal') && setModalCli(false)}>
          <div className="modal-contenido">
            <h3><i className="fa-solid fa-users"></i> Seleccionar cliente</h3>
            <input autoFocus
              style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #d0d8e4', fontSize:'0.93rem', marginBottom:10, boxSizing:'border-box' }}
              placeholder="Buscar por nombre o RNC..."
              value={buscarCli} onChange={e => setBuscarCli(e.target.value)} />
            <div className="lista-clientes-modal">
              {cargandoCli
                ? <div style={{ textAlign:'center', padding:'20px', color:'#aab' }}><i className="fas fa-spinner fa-spin"></i></div>
                : clientes.length === 0
                  ? <div style={{ textAlign:'center', padding:'20px', color:'#aab' }}>No hay clientes registrados</div>
                  : clientes.map(cli => (
                    <div key={cli.id} className="cliente-opcion" onClick={() => { setCliente(cli); setModalCli(false) }}>
                      <strong>{cli.nombre}</strong>
                      <span>{cli.rnc || '—'}</span>
                    </div>
                  ))
              }
            </div>
            <div className="modal-botones">
              <button className="btn-factura" onClick={() => setModalCli(false)}>
                <i className="fa-solid fa-xmark"></i> Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
    <Toast toast={toast} onClose={cerrar} />
    </>
  )
}
