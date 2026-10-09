import { useState, useEffect, useCallback } from 'react'
import { masterApi } from '../masterApi'

const ESTADOS = {
  activo:          { label: 'Activo',           clase: 'badge-verde' },
  prueba:          { label: 'Prueba',           clase: 'badge-azul' },
  pendiente_pago:  { label: 'Pendiente de pago', clase: 'badge-naranja' },
  suspendido:      { label: 'Suspendido',        clase: 'badge-rojo' },
  cancelado:       { label: 'Cancelado',         clase: 'badge-gris' },
  exento:          { label: 'Exento',            clase: 'badge-azul' },
  pendiente:       { label: 'Pendiente',         clase: 'badge-gris' },
}
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO') : '—')

export default function Empresas({ onAbrirEmpresa }) {
  const [empresas, setEmpresas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try { setEmpresas((await masterApi.get('/empresas')).data) } catch (err) { setError(err.message) } finally { setCargando(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const lista = empresas.filter((e) => !buscar || e.nombre.toLowerCase().includes(buscar.toLowerCase()) || e.rnc?.includes(buscar))

  return (
    <div>
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-building"></i> Empresas</h2>
      </div>

      {error && <div className="alerta-box alerta-danger" style={{ marginBottom: 14 }}><i className="fas fa-circle-exclamation"></i>{error}</div>}

      <input placeholder="Buscar por nombre o RNC..." value={buscar} onChange={(e) => setBuscar(e.target.value)}
        className="buscar-input" style={{ marginBottom: 16, maxWidth: 420 }} />

      <div className="vista-card" style={{ padding: 0 }}>
        <div className="tabla-wrap">
          <table className="tabla-crud">
            <thead>
              <tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Uso</th><th>Creada</th><th className="col-acciones">Acciones</th></tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#aab' }}><i className="fas fa-spinner fa-spin"></i></td></tr>
              ) : lista.length === 0 ? (
                <tr className="tabla-vacia-row"><td colSpan={6}><i className="fas fa-building"></i>Sin empresas</td></tr>
              ) : lista.map((e) => {
                const est = ESTADOS[e.estado] || { label: e.estado, clase: 'badge-gris' }
                return (
                  <tr key={e.tenant_id} style={{ cursor: 'pointer' }} onClick={() => onAbrirEmpresa(e.tenant_id)}>
                    <td data-label="Empresa"><strong>{e.nombre}</strong><div style={{ fontSize: '0.78rem', color: '#99a' }}>{e.rnc || '—'}</div></td>
                    <td data-label="Plan">{e.plan.nombre}</td>
                    <td data-label="Estado"><span className={`badge ${est.clase}`}>{est.label}</span></td>
                    <td data-label="Uso" style={{ fontSize: '0.82rem' }}>
                      {e.uso.usuarios.actual}u · {e.uso.clientes.actual}c · {e.uso.ecf_mes.actual} e-CF/mes
                    </td>
                    <td data-label="Creada">{fechaCorta(e.creada)}</td>
                    <td data-label="Acciones" className="col-acciones">
                      <button className="btn-mini" onClick={(ev) => { ev.stopPropagation(); onAbrirEmpresa(e.tenant_id) }}>
                        <i className="fas fa-arrow-up-right-from-square"></i>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
