import { useState, useEffect, useCallback } from 'react'
import { masterApi } from '../masterApi'

const dinero = (n) => `RD$ ${Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO') : '—')

const ETIQUETA_ESTADO = {
  activo: 'Activas', prueba: 'En prueba', suspendido: 'Suspendidas', cancelado: 'Canceladas',
  pendiente_pago: 'Pendientes de pago', pendiente: 'Pendientes', exento: 'Exentas',
}

function Tarjeta({ icono, color, etiqueta, valor, nota }) {
  return (
    <div className="vista-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: color, color: '#fff', fontSize: '1.2rem', flexShrink: 0,
      }}>
        <i className={icono}></i>
      </div>
      <div>
        <div style={{ fontSize: '0.78rem', color: '#778', textTransform: 'uppercase', letterSpacing: '.03em' }}>{etiqueta}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#17406d' }}>{valor}</div>
        {nota && <div style={{ fontSize: '0.78rem', color: '#99a' }}>{nota}</div>}
      </div>
    </div>
  )
}

export default function Dashboard({ onAbrirEmpresa }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    try { setD((await masterApi.get('/dashboard')).data) } catch (err) { setError(err.message) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  if (error) return <div className="alerta-box alerta-danger"><i className="fas fa-circle-exclamation"></i>{error}</div>
  if (!d) return <div style={{ textAlign: 'center', padding: 60, color: '#aab' }}><i className="fas fa-spinner fa-spin" style={{ fontSize: '1.6rem' }}></i></div>

  return (
    <div>
      <div className="vista-header">
        <h2 className="vista-titulo"><i className="fas fa-gauge-high"></i> Dashboard</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <Tarjeta icono="fa-solid fa-building" color="#17406d" etiqueta="Empresas" valor={d.empresas.total}
          nota={`+${d.nuevas_este_mes} este mes`} />
        <Tarjeta icono="fa-solid fa-sack-dollar" color="#1a7a45" etiqueta="MRR (ingreso mensual)" valor={dinero(d.ingresos.mrr)}
          nota={`${d.ingresos.empresas_de_pago} empresa(s) de pago`} />
        <Tarjeta icono="fa-solid fa-coins" color="#a05e00" etiqueta="Pagos de este mes" valor={dinero(d.pagos.total)}
          nota={`${d.pagos.cantidad} pago(s)`} />
        <Tarjeta icono="fa-solid fa-file-invoice" color="#5b6b7f" etiqueta="Facturado por los tenants" valor={dinero(d.facturacion.total)}
          nota={`${d.facturacion.cantidad} factura(s) este mes`} />
        <Tarjeta icono="fa-solid fa-file-shield" color="#1555a5" etiqueta="e-CF aceptados" valor={d.ecf.cantidad}
          nota="este mes, en toda la plataforma" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }} className="form-grid">
        <div className="vista-card">
          <h3 style={{ margin: '0 0 12px', color: '#17406d', fontSize: '1rem' }}>
            <i className="fas fa-triangle-exclamation" style={{ color: '#a05e00', marginRight: 6 }}></i>
            Por vencer en los próximos 7 días
          </h3>
          {d.por_vencer.length === 0 ? (
            <p style={{ color: '#99a', fontSize: '0.9rem' }}>Ninguna suscripción vence pronto.</p>
          ) : (
            <table className="tabla-crud">
              <thead><tr><th>Empresa</th><th>Plan</th><th>Vence</th></tr></thead>
              <tbody>
                {d.por_vencer.map((e) => (
                  <tr key={e.tenant_id} style={{ cursor: 'pointer' }} onClick={() => onAbrirEmpresa(e.tenant_id)}>
                    <td data-label="Empresa">{e.nombre}</td>
                    <td data-label="Plan">{e.plan_nombre}</td>
                    <td data-label="Vence">{fechaCorta(e.fecha_fin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="vista-card">
          <h3 style={{ margin: '0 0 12px', color: '#17406d', fontSize: '1rem' }}>
            <i className="fas fa-clock-rotate-left" style={{ color: '#17406d', marginRight: 6 }}></i>
            Últimas empresas registradas
          </h3>
          <table className="tabla-crud">
            <thead><tr><th>Empresa</th><th>Plan</th><th>Estado</th><th>Creada</th></tr></thead>
            <tbody>
              {d.ultimas_empresas.map((e) => (
                <tr key={e.tenant_id} style={{ cursor: 'pointer' }} onClick={() => onAbrirEmpresa(e.tenant_id)}>
                  <td data-label="Empresa">{e.nombre}</td>
                  <td data-label="Plan">{e.plan_nombre}</td>
                  <td data-label="Estado">{ETIQUETA_ESTADO[e.estado] || e.estado}</td>
                  <td data-label="Creada">{fechaCorta(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h3 style={{ margin: '0 0 12px', color: '#17406d', fontSize: '1rem' }}>Empresas por estado</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(d.empresas.porEstado).map(([estado, cantidad]) => (
            <span key={estado} className="badge badge-azul" style={{ fontSize: '0.85rem' }}>
              {ETIQUETA_ESTADO[estado] || estado}: <strong>{cantidad}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
