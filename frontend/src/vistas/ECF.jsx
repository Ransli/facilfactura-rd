import { useState, useEffect, useMemo, useCallback } from 'react'
import { api } from '../api/config'
import Toast, { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import './vistas.css'

const API_ORIGIN = 'http://localhost:3002'

const AMBIENTES = [
  { valor: 'TesteCF', label: 'TesteCF — pruebas' },
  { valor: 'CerteCF', label: 'CerteCF — certificación' },
  { valor: 'eCF',     label: 'eCF — producción' },
]

const TIPOS = { 31: 'Crédito Fiscal', 32: 'Consumo', 34: 'Nota de Crédito' }

const ESTADOS = {
  generado:             { label: 'Pendiente de envío',  clase: 'badge-gris' },
  enviado:              { label: 'Enviado, en espera',  clase: 'badge-azul' },
  en_proceso:           { label: 'En proceso en la DGII', clase: 'badge-azul' },
  aceptado:             { label: 'Aceptado',            clase: 'badge-verde' },
  aceptado_condicional: { label: 'Aceptado condicional', clase: 'badge-naranja' },
  rechazado:            { label: 'Rechazado',           clase: 'badge-rojo' },
  error:                { label: 'Error de envío',      clase: 'badge-rojo' },
}

const fechaCorta = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('es-DO') : '—')
const dinero = (n) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function leerComoBase64(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',').pop())
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(file)
  })
}

/** Pide un recurso protegido y lo abre en una pestaña nueva (representación) o lo descarga (XML). */
async function abrirProtegido(ruta, { descargar, nombreArchivo } = {}) {
  const res = await fetch(`${API_ORIGIN}/api${ruta}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.mensaje || 'No se pudo obtener el archivo')
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  if (descargar) {
    const a = document.createElement('a')
    a.href = url; a.download = nombreArchivo || 'archivo'
    document.body.appendChild(a); a.click(); a.remove()
  } else {
    window.open(url, '_blank')
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function ECF() {
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const { toast, mostrar, cerrar } = useToast()

  const [certificado, setCertificado] = useState(null)
  const [ambiente, setAmbiente]       = useState('TesteCF')
  const [lista, setLista]             = useState([])
  const [cargando, setCargando]       = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')

  const [modalCert, setModalCert]     = useState(false)
  const [archivo, setArchivo]         = useState(null)
  const [password, setPassword]       = useState('')
  const [subiendo, setSubiendo]       = useState(false)
  const [errorCert, setErrorCert]     = useState('')

  const [procesando, setProcesando]   = useState(false)
  const [accionId, setAccionId]       = useState(null)
  const [modalNota, setModalNota]     = useState(null)   // { id, encf }
  const [razon, setRazon]             = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [cert, cfg, ecf] = await Promise.all([
        api.get('/ecf/certificado'),
        api.get('/ecf/configuracion'),
        api.get('/ecf'),
      ])
      setCertificado(cert.data)
      setAmbiente(cfg.data.ambiente)
      setLista(ecf.data)
    } catch (err) { mostrar(err.message) }
    finally { setCargando(false) }
  }, [mostrar])

  useEffect(() => { cargar() }, [cargar])

  const anulados = useMemo(
    () => new Set(lista.filter((e) => e.tipo_ecf === 34).map((e) => e.ecf_referencia_id)),
    [lista]
  )
  const listaFiltrada = useMemo(() => lista.filter((e) =>
    (!filtroEstado || e.estado === filtroEstado) && (!filtroTipo || String(e.tipo_ecf) === filtroTipo)
  ), [lista, filtroEstado, filtroTipo])

  async function subirCertificado(e) {
    e.preventDefault()
    if (!archivo)  { setErrorCert('Selecciona el archivo .p12 o .pfx del certificado'); return }
    if (!password) { setErrorCert('Escribe la contraseña del certificado'); return }
    setSubiendo(true); setErrorCert('')
    try {
      const p12_base64 = await leerComoBase64(archivo)
      const r = await api.put('/ecf/certificado', { p12_base64, password })
      setCertificado(r.data)
      setModalCert(false); setArchivo(null); setPassword('')
      mostrar('Certificado guardado correctamente', 'success')
    } catch (err) { setErrorCert(err.message) }
    finally { setSubiendo(false) }
  }

  async function eliminarCertificado() {
    if (!window.confirm('¿Eliminar el certificado digital? No podrás emitir comprobantes electrónicos hasta subir uno nuevo.')) return
    try {
      await api.delete('/ecf/certificado')
      setCertificado({ configurado: false })
      mostrar('Certificado eliminado', 'info')
    } catch (err) { mostrar(err.message) }
  }

  async function cambiarAmbiente(nuevo) {
    const anterior = ambiente
    setAmbiente(nuevo)
    try {
      await api.put('/ecf/configuracion', { ambiente: nuevo })
      mostrar(`Ambiente cambiado a ${nuevo}`, 'success')
    } catch (err) { setAmbiente(anterior); mostrar(err.message) }
  }

  async function procesarCola() {
    setProcesando(true)
    try {
      const r = await api.post('/ecf/procesar', {})
      const { aceptados = 0, rechazados = 0, reintentos = 0, errores = 0, procesados = 0 } = r.data
      mostrar(
        procesados === 0
          ? 'No había comprobantes pendientes de enviar'
          : `Procesados ${procesados}: ${aceptados} aceptados, ${rechazados} rechazados, ${reintentos} reintentarán, ${errores} con error`,
        rechazados || errores ? 'warning' : 'success'
      )
      await cargar()
    } catch (err) { mostrar(err.message) }
    finally { setProcesando(false) }
  }

  async function reintentar(id) {
    setAccionId(id)
    try {
      await api.post(`/ecf/${id}/reintentar`, {})
      mostrar('Comprobante reenviado', 'success')
      await cargar()
    } catch (err) { mostrar(err.message) }
    finally { setAccionId(null) }
  }

  async function emitirNota() {
    setAccionId(modalNota.id)
    try {
      const r = await api.post(`/ecf/${modalNota.id}/nota-credito`, { razon: razon || undefined })
      mostrar(`Nota de crédito ${r.data.encf} emitida: la factura quedó anulada`, 'success')
      setModalNota(null); setRazon('')
      await cargar()
    } catch (err) { mostrar(err.message) }
    finally { setAccionId(null) }
  }

  const verRepresentacion = (id) => abrirProtegido(`/ecf/${id}/representacion`).catch((err) => mostrar(err.message))
  const descargarXml = (id, encf) => abrirProtegido(`/ecf/${id}/xml`, { descargar: true, nombreArchivo: `${encf}.xml` }).catch((err) => mostrar(err.message))

  return (
    <div className="vista-card">
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-file-shield"></i> Facturación electrónica (e-CF)</h2>
        {esAdmin && (
          <button className="btn-primary" onClick={procesarCola} disabled={procesando}>
            {procesando ? <><i className="fas fa-spinner fa-spin"></i> Enviando...</> : <><i className="fas fa-paper-plane"></i> Enviar pendientes a la DGII</>}
          </button>
        )}
      </div>

      {/* ── Certificado digital ── */}
      <div style={{ background:'#f8fafc', border:'1px solid #e0e6ee', borderRadius:12, padding:'18px 20px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontWeight:700, color:'#17406d', marginBottom:6 }}><i className="fas fa-certificate"></i> Certificado digital</div>
            {cargando ? (
              <span style={{ color:'#aab' }}>Cargando...</span>
            ) : certificado?.configurado ? (
              <>
                <div style={{ fontSize:'0.92rem' }}><strong>{certificado.titular}</strong> — emitido por {certificado.emisor}</div>
                <div style={{ fontSize:'0.85rem', color:'#667', marginTop:2 }}>
                  Vigente del {fechaCorta(certificado.valido_desde?.slice?.(0, 10) || certificado.valido_desde)} al {fechaCorta(certificado.valido_hasta?.slice?.(0, 10) || certificado.valido_hasta)}
                </div>
                <span className={`badge ${certificado.estado === 'vigente' ? 'badge-verde' : certificado.estado === 'por_vencer' ? 'badge-naranja' : 'badge-rojo'}`} style={{ marginTop:8, display:'inline-block' }}>
                  {certificado.estado === 'vigente' ? 'Vigente' : certificado.estado === 'por_vencer' ? `Vence en ${certificado.dias_para_vencer} días` : 'Vencido'}
                </span>
              </>
            ) : (
              <div className="alerta-box alerta-danger" style={{ margin:0 }}>
                <i className="fas fa-circle-exclamation"></i>
                Sin certificado digital. No se pueden emitir comprobantes electrónicos hasta subir uno.
              </div>
            )}
          </div>
          {esAdmin && (
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn-secondary" onClick={() => { setErrorCert(''); setModalCert(true) }}>
                <i className="fas fa-upload"></i> {certificado?.configurado ? 'Reemplazar' : 'Subir certificado'}
              </button>
              {certificado?.configurado && (
                <button className="btn-secondary" style={{ color:'#9b2323' }} onClick={eliminarCertificado}>
                  <i className="fas fa-trash"></i>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Ambiente ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <span style={{ fontWeight:600, color:'#556' }}>Ambiente de la DGII:</span>
        <select value={ambiente} disabled={!esAdmin} onChange={(e) => cambiarAmbiente(e.target.value)}
          style={{ border:'1px solid #d0d8e4', borderRadius:6, padding:'6px 10px', fontSize:'0.9rem', background: esAdmin ? '#fff' : '#f3f3f3' }}>
          {AMBIENTES.map((a) => <option key={a.valor} value={a.valor}>{a.label}</option>)}
        </select>
        {ambiente !== 'eCF' && <span style={{ fontSize:'0.82rem', color:'#a05e00' }}>Ambiente de pruebas: los comprobantes no tienen validez fiscal.</span>}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display:'flex', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ border:'1px solid #d0d8e4', borderRadius:6, padding:'6px 10px', fontSize:'0.88rem' }}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ border:'1px solid #d0d8e4', borderRadius:6, padding:'6px 10px', fontSize:'0.88rem' }}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS).map(([v, label]) => <option key={v} value={v}>{v} — {label}</option>)}
        </select>
      </div>

      {/* ── Listado ── */}
      <div className="tabla-wrap">
        <table className="tabla-crud">
          <thead>
            <tr>
              <th>e-NCF</th>
              <th>Factura</th>
              <th>Cliente</th>
              <th>Monto</th>
              <th>Emisión</th>
              <th>Estado</th>
              <th className="col-acciones">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td colSpan={7} style={{ textAlign:'center', padding:'40px', color:'#aab' }}>
                <i className="fas fa-spinner fa-spin" style={{ marginRight:8 }}></i>Cargando...
              </td></tr>
            ) : listaFiltrada.length === 0 ? (
              <tr className="tabla-vacia-row"><td colSpan={7}>
                <i className="fas fa-file-shield"></i>Sin comprobantes electrónicos{lista.length ? ' con este filtro' : ''}
              </td></tr>
            ) : listaFiltrada.map((e) => {
              const est = ESTADOS[e.estado] || { label: e.estado, clase: 'badge-gris' }
              const puedeAnular = e.tipo_ecf !== 34 && ['aceptado', 'aceptado_condicional'].includes(e.estado) && !anulados.has(e.id)
              return (
                <tr key={e.id}>
                  <td data-label="e-NCF">
                    <span style={{ fontFamily:'monospace', fontWeight:700, color:'#17406d' }}>{e.encf}</span>
                    <div style={{ fontSize:'0.78rem', color:'#99a' }}>{TIPOS[e.tipo_ecf] || e.tipo_ecf}</div>
                  </td>
                  <td data-label="Factura">{e.factura_numero}</td>
                  <td data-label="Cliente">{e.cliente_nombre}</td>
                  <td data-label="Monto">{dinero(e.monto_total)}</td>
                  <td data-label="Emisión">{fechaCorta(e.fecha_emision)}</td>
                  <td data-label="Estado">
                    <span className={`badge ${est.clase}`}>{est.label}</span>
                    {e.mensaje_dgii && <div style={{ fontSize:'0.78rem', color:'#a05e00', marginTop:2 }}>{e.mensaje_dgii}</div>}
                  </td>
                  <td data-label="Acciones" className="col-acciones">
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <button className="btn-mini" title="Ver representación impresa" onClick={() => verRepresentacion(e.id)}>
                        <i className="fas fa-eye"></i>
                      </button>
                      <button className="btn-mini" title="Descargar XML firmado" onClick={() => descargarXml(e.id, e.encf)}>
                        <i className="fas fa-file-code"></i>
                      </button>
                      {esAdmin && e.estado === 'error' && (
                        <button className="btn-mini" title="Reintentar envío" disabled={accionId === e.id} onClick={() => reintentar(e.id)}>
                          {accionId === e.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-rotate-right"></i>}
                        </button>
                      )}
                      {esAdmin && puedeAnular && (
                        <button className="btn-mini" style={{ color:'#9b2323' }} title="Anular con nota de crédito"
                          onClick={() => { setModalNota({ id: e.id, encf: e.encf }); setRazon('') }}>
                          <i className="fas fa-ban"></i>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal: subir certificado ── */}
      {modalCert && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalCert(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <h3><i className="fas fa-certificate"></i> Certificado digital</h3>
              <button className="modal-cerrar" onClick={() => setModalCert(false)}><i className="fas fa-xmark"></i></button>
            </div>
            <div className="alerta-box alerta-info" style={{ marginBottom:16 }}>
              <i className="fas fa-circle-info"></i>
              El certificado (.p12 o .pfx) y su contraseña se guardan cifrados. Solo se usan para firmar tus comprobantes.
            </div>
            <form onSubmit={subirCertificado}>
              <div className="form-grid cols-1">
                <div className="form-grupo">
                  <label>Archivo del certificado <span className="requerido">*</span></label>
                  <input type="file" accept=".p12,.pfx" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
                </div>
                <div className="form-grupo">
                  <label>Contraseña del certificado <span className="requerido">*</span></label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" />
                </div>
              </div>
              {errorCert && <div className="alerta-box alerta-danger" style={{ marginTop:14 }}><i className="fas fa-circle-exclamation"></i>{errorCert}</div>}
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setModalCert(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={subiendo}>
                  {subiendo ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</> : <><i className="fas fa-floppy-disk"></i> Guardar</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: nota de crédito ── */}
      {modalNota && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setModalNota(null)}>
          <div className="modal-box modal-sm">
            <div className="modal-header">
              <h3><i className="fas fa-ban"></i> Anular comprobante</h3>
              <button className="modal-cerrar" onClick={() => setModalNota(null)}><i className="fas fa-xmark"></i></button>
            </div>
            <div className="alerta-box alerta-danger" style={{ marginBottom:16 }}>
              <i className="fas fa-triangle-exclamation"></i>
              Se emitirá una nota de crédito electrónica que anula <strong>{modalNota.encf}</strong> y deja su factura anulada. No se puede deshacer.
            </div>
            <div className="form-grupo">
              <label>Razón (opcional)</label>
              <textarea value={razon} onChange={(e) => setRazon(e.target.value)} placeholder="Ej.: Devolución total de la mercancía" />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setModalNota(null)}>Cancelar</button>
              <button type="button" className="btn-primary" style={{ background:'#9b2323' }} disabled={accionId === modalNota.id} onClick={emitirNota}>
                {accionId === modalNota.id ? <><i className="fas fa-spinner fa-spin"></i> Emitiendo...</> : <><i className="fas fa-ban"></i> Emitir nota de crédito</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={cerrar} />
    </div>
  )
}
