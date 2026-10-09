import { useState, useEffect, useCallback } from 'react'
import { masterApi } from '../masterApi'

const dinero = (n) => `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO') : '—')
const ESTADO_CLASE = { pagado: 'badge-verde', pendiente: 'badge-naranja', fallido: 'badge-rojo', reembolsado: 'badge-gris' }

// Registrar un pago sin tener que entrar primero al detalle de la empresa: elegirla aquí mismo. Reutiliza el
// mismo endpoint que usa el detalle (POST /empresas/:id/pagos), solo cambia de dónde se dispara.
function FormularioPago({ empresas, onGuardar, onCerrar, enviando, error }) {
  const [tenantId, setTenantId] = useState('')
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('transferencia')
  const [referencia, setReferencia] = useState('')

  function enviar(e) {
    e.preventDefault()
    onGuardar(Number(tenantId), { monto: Number(monto), metodo, referencia })
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal-box">
        <div className="modal-header">
          <h3><i className="fas fa-sack-dollar"></i> Registrar pago</h3>
          <button className="modal-cerrar" onClick={onCerrar}><i className="fas fa-xmark"></i></button>
        </div>
        <form onSubmit={enviar}>
          {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}
          <div className="form-grid">
            <div className="form-grupo col-span-2">
              <label>Empresa <span className="requerido">*</span></label>
              <select required value={tenantId} onChange={(e) => setTenantId(e.target.value)} autoFocus>
                <option value="" disabled>Selecciona una empresa...</option>
                {empresas.map((e) => <option key={e.tenant_id} value={e.tenant_id}>{e.nombre} ({e.plan.nombre})</option>)}
              </select>
            </div>
            <div className="form-grupo">
              <label>Monto (RD$) <span className="requerido">*</span></label>
              <input type="number" min="0.01" step="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)} />
            </div>
            <div className="form-grupo">
              <label>Método</label>
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)}>
                <option value="transferencia">Transferencia</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="efectivo">Efectivo</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div className="form-grupo col-span-2">
              <label>Referencia (opcional)</label>
              <input value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? <><i className="fas fa-spinner fa-spin"></i> Guardando...</> : <><i className="fas fa-floppy-disk"></i> Registrar pago</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Pagos({ onAbrirEmpresa }) {
  const [pagos, setPagos] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [errorForm, setErrorForm] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [listaPagos, listaEmpresas] = await Promise.all([masterApi.get('/pagos'), masterApi.get('/empresas')])
      setPagos(listaPagos.data)
      setEmpresas(listaEmpresas.data)
    } catch (err) { setError(err.message) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function guardarPago(tenantId, datos) {
    setEnviando(true); setErrorForm('')
    try {
      await masterApi.post(`/empresas/${tenantId}/pagos`, datos)
      setMostrarForm(false)
      await cargar()
    } catch (err) { setErrorForm(err.message) } finally { setEnviando(false) }
  }

  const lista = pagos.filter((p) => !buscar || p.empresa.toLowerCase().includes(buscar.toLowerCase()))
  const totalPagado = lista.filter((p) => p.estado === 'pagado').reduce((s, p) => s + Number(p.monto), 0)

  return (
    <div>
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-sack-dollar"></i> Pagos</h2>
        <button className="btn-primary" onClick={() => setMostrarForm(true)}><i className="fas fa-plus"></i> Registrar pago</button>
      </div>

      {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por empresa..." value={buscar} onChange={(e) => setBuscar(e.target.value)}
          className="buscar-input" style={{ maxWidth: 320 }} />
        <span style={{ color: '#556', fontSize: '0.9rem' }}>
          Total pagado (filtro actual): <strong style={{ color: '#1a7a45' }}>{dinero(totalPagado)}</strong>
        </span>
      </div>

      <div className="vista-card" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table className="tabla-crud">
            <thead>
              <tr><th>Empresa</th><th>Monto</th><th>Método</th><th>Referencia</th><th>Estado</th><th>Fecha</th><th>Registrado por</th></tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#aab' }}><i className="fas fa-spinner fa-spin"></i></td></tr>
              ) : lista.length === 0 ? (
                <tr className="tabla-vacia-row"><td colSpan={7}><i className="fas fa-sack-dollar"></i>Sin pagos registrados</td></tr>
              ) : lista.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => onAbrirEmpresa(p.tenant_id)}>
                  <td data-label="Empresa"><strong>{p.empresa}</strong></td>
                  <td data-label="Monto">{dinero(p.monto)}</td>
                  <td data-label="Método" style={{ textTransform: 'capitalize' }}>{p.metodo}</td>
                  <td data-label="Referencia">{p.referencia || '—'}</td>
                  <td data-label="Estado"><span className={`badge ${ESTADO_CLASE[p.estado] || 'badge-gris'}`}>{p.estado}</span></td>
                  <td data-label="Fecha">{fechaCorta(p.fecha_pago)}</td>
                  <td data-label="Registrado por">{p.registrado_por}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {mostrarForm && (
        <FormularioPago
          empresas={empresas}
          onGuardar={guardarPago}
          onCerrar={() => { setMostrarForm(false); setErrorForm('') }}
          enviando={enviando}
          error={errorForm}
        />
      )}
    </div>
  )
}
