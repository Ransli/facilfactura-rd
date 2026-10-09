import { useState, useEffect, useCallback } from 'react'
import { masterApi } from '../masterApi'

const fechaHora = (iso) => (iso ? new Date(iso).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export default function CambiosPlan({ onAbrirEmpresa }) {
  const [cambios, setCambios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try { setCambios((await masterApi.get('/pagos/cambios-plan')).data) } catch (err) { setError(err.message) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const lista = cambios.filter((c) => !buscar || c.empresa.toLowerCase().includes(buscar.toLowerCase()))

  return (
    <div>
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-right-left"></i> Cambios de plan</h2>
      </div>

      {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

      <input placeholder="Buscar por empresa..." value={buscar} onChange={(e) => setBuscar(e.target.value)}
        className="buscar-input" style={{ marginBottom: 16, maxWidth: 320 }} />

      <div className="vista-card" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table className="tabla-crud">
            <thead><tr><th>Empresa</th><th>Detalle</th><th>Responsable</th><th>Fecha</th></tr></thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#aab' }}><i className="fas fa-spinner fa-spin"></i></td></tr>
              ) : lista.length === 0 ? (
                <tr className="tabla-vacia-row"><td colSpan={4}><i className="fas fa-right-left"></i>Sin cambios de plan registrados</td></tr>
              ) : lista.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onAbrirEmpresa(c.tenant_id)}>
                  <td data-label="Empresa"><strong>{c.empresa}</strong></td>
                  <td data-label="Detalle">{c.detalle || '—'}</td>
                  <td data-label="Responsable">{c.actor}</td>
                  <td data-label="Fecha">{fechaHora(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
