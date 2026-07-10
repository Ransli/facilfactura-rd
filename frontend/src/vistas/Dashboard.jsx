import { useState, useEffect } from 'react'
import { api } from '../api/config'
import './Dashboard.css'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const money = (n) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 })
    .format(Number(n) || 0)

const fecha = (f) =>
  new Date(f).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })

// '2026-07' → 'jul 26'
const etiquetaMes = (mes) => {
  const [anio, m] = mes.split('-')
  return `${MESES[Number(m) - 1]} ${anio.slice(2)}`
}

const ESTADOS = {
  emitida:  { label: 'Emitidas',  icono: 'fa-circle-check',        clase: 'verde'   },
  borrador: { label: 'Borradores', icono: 'fa-file-pen',           clase: 'naranja' },
  anulada:  { label: 'Anuladas',  icono: 'fa-circle-xmark',        clase: 'rojo'    },
}

// Mismos umbrales que la vista NCF, para que el color signifique lo mismo
// en las dos pantallas.
const colorBarra = (p) => (p >= 90 ? '#c0392b' : p >= 70 ? '#e67e22' : '#27ae60')

function SecuenciasNcf({ secuencias }) {
  if (!secuencias.length) {
    return <p className="dash-vacio">No hay secuencias NCF activas. Regístralas en la sección NCF.</p>
  }

  return (
    <ul className="dash-ncf">
      {secuencias.map((s) => {
        const usado = Math.round((s.ultimo_usado / s.hasta) * 100)
        const color = s.vencida ? '#c0392b' : colorBarra(usado)

        return (
          <li key={s.id}>
            <div className="dash-ncf-cabecera">
              <span className="dash-ncf-tipo">{s.tipo_ncf}</span>
              <span className="dash-ncf-desc">{s.descripcion || 'Sin descripción'}</span>
              {s.vencida
                ? <span className="badge badge-rojo">Vencida</span>
                : s.por_agotarse
                  ? <span className="badge badge-naranja">Por agotarse</span>
                  : null}
              <span className="dash-ncf-restantes" style={{ color }}>
                <strong>{s.disponibles}</strong> de {s.hasta - s.desde + 1}
              </span>
            </div>

            <div className="dash-ncf-pista" title={`${usado}% consumido · usados ${s.ultimo_usado} de ${s.hasta}`}>
              <div className="dash-ncf-barra" style={{ width: `${usado}%`, background: color }}></div>
            </div>

            <div className="dash-ncf-pie">
              <span>Rango {s.desde}–{s.hasta}</span>
              <span>{usado}% consumido</span>
              <span>{s.fecha_vencimiento ? `Vence ${fecha(s.fecha_vencimiento)}` : 'Sin vencimiento'}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Saludo({ nombre }) {
  const h = new Date().getHours()
  const momento = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
  return (
    <div className="dash-saludo">
      <h1>{momento}, {nombre || 'usuario'}</h1>
      <p>Este es el resumen de tu facturación al {fecha(new Date())}.</p>
    </div>
  )
}

function Variacion({ actual, anterior }) {
  const a = Number(actual) || 0
  const b = Number(anterior) || 0
  if (b === 0) return a > 0 ? <span className="dash-var subida">nuevo este mes</span> : null

  const pct = ((a - b) / b) * 100
  const sube = pct >= 0
  return (
    <span className={`dash-var ${sube ? 'subida' : 'bajada'}`}>
      <i className={`fas fa-arrow-${sube ? 'up' : 'down'}`}></i>
      {Math.abs(pct).toFixed(1)}% vs. mes anterior
    </span>
  )
}

function Tarjeta({ icono, clase, label, valor, sub, children }) {
  return (
    <article className={`dash-tarjeta ${clase || ''}`}>
      <div className="dash-tarjeta-icono"><i className={`fas ${icono}`}></i></div>
      <div className="dash-tarjeta-cuerpo">
        <span className="dash-tarjeta-label">{label}</span>
        <strong className="dash-tarjeta-valor">{valor}</strong>
        {sub && <span className="dash-tarjeta-sub">{sub}</span>}
        {children}
      </div>
    </article>
  )
}

// Gráfico de barras en CSS puro: la barra más alta define el 100%.
function GraficoMeses({ serie }) {
  if (!serie.length) {
    return <p className="dash-vacio">Aún no hay facturas emitidas para graficar.</p>
  }
  const maximo = Math.max(...serie.map((s) => Number(s.total)))

  return (
    <div className="dash-barras">
      {serie.map((s) => {
        const alto = maximo > 0 ? (Number(s.total) / maximo) * 100 : 0
        return (
          <div className="dash-barra-col" key={s.mes}>
            <div className="dash-barra-pista" title={`${s.cantidad} factura(s) — ${money(s.total)}`}>
              <div className="dash-barra" style={{ height: `${alto}%` }}>
                <span className="dash-barra-tip">{money(s.total)}</span>
              </div>
            </div>
            <span className="dash-barra-mes">{etiquetaMes(s.mes)}</span>
            <span className="dash-barra-cant">{s.cantidad}</span>
          </div>
        )
      })}
    </div>
  )
}

// Dona SVG con stroke-dasharray: cada segmento arranca donde terminó el anterior.
function Dona({ datos, total }) {
  const R = 54
  const C = 2 * Math.PI * R
  let acumulado = 0

  if (!total) {
    return (
      <div className="dash-dona-wrap">
        <svg viewBox="0 0 140 140" className="dash-dona">
          <circle cx="70" cy="70" r={R} className="dash-dona-pista" />
        </svg>
        <div className="dash-dona-centro"><strong>0</strong><span>facturas</span></div>
      </div>
    )
  }

  return (
    <div className="dash-dona-wrap">
      <svg viewBox="0 0 140 140" className="dash-dona">
        <circle cx="70" cy="70" r={R} className="dash-dona-pista" />
        {datos.map((d) => {
          const porcion = (d.cantidad / total) * C
          const offset = acumulado
          acumulado += porcion
          return (
            <circle
              key={d.estado}
              cx="70" cy="70" r={R}
              className={`dash-dona-seg seg-${ESTADOS[d.estado]?.clase || 'gris'}`}
              strokeDasharray={`${porcion} ${C - porcion}`}
              strokeDashoffset={-offset}
            >
              <title>{`${ESTADOS[d.estado]?.label || d.estado}: ${d.cantidad}`}</title>
            </circle>
          )
        })}
      </svg>
      <div className="dash-dona-centro">
        <strong>{total}</strong>
        <span>facturas</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [datos, setDatos]     = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError]     = useState('')

  const usuario = JSON.parse(localStorage.getItem('usuario') || 'null')

  useEffect(() => {
    api.get('/dashboard')
      .then(setDatos)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [])

  if (cargando) {
    return (
      <div className="dash-cargando">
        <i className="fas fa-spinner fa-spin"></i>
        <span>Cargando resumen…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="vista-card dash-error">
        <i className="fas fa-triangle-exclamation"></i>
        <div>
          <strong>No se pudo cargar el panel</strong>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  const { porEstado, mesActual, mesAnterior, serie, ncf, topClientes, recientes, catalogo } = datos

  const conteo = (estado) => porEstado.find((p) => p.estado === estado)?.cantidad || 0
  const totalFacturas = porEstado.reduce((s, p) => s + p.cantidad, 0)
  const alertasNcf = ncf.filter((s) => s.por_agotarse || s.vencida)

  return (
    <div className="dash">
      <Saludo nombre={usuario?.nombre} />

      {alertasNcf.length > 0 && (
        <div className="dash-alerta">
          <i className="fas fa-triangle-exclamation"></i>
          <div>
            <strong>
              {alertasNcf.length} secuencia{alertasNcf.length > 1 ? 's' : ''} de NCF requiere{alertasNcf.length > 1 ? 'n' : ''} atención
            </strong>
            <ul>
              {alertasNcf.map((s) => (
                <li key={s.id}>
                  <span className="badge badge-azul">{s.tipo_ncf}</span>
                  {s.vencida
                    ? <>venció el {fecha(s.fecha_vencimiento)}</>
                    : <>quedan <strong>{s.disponibles}</strong> comprobantes disponibles</>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="dash-tarjetas">
        <Tarjeta
          icono="fa-sack-dollar" clase="acento"
          label="Facturado este mes"
          valor={money(mesActual.total)}
          sub={`${mesActual.cantidad} factura${mesActual.cantidad === 1 ? '' : 's'} emitida${mesActual.cantidad === 1 ? '' : 's'}`}
        >
          <Variacion actual={mesActual.total} anterior={mesAnterior.total} />
        </Tarjeta>

        <Tarjeta
          icono="fa-percent"
          label="ITBIS del mes"
          valor={money(mesActual.itbis)}
          sub={`Retenciones: ${money(mesActual.retenciones)}`}
        />

        <Tarjeta
          icono="fa-users"
          label="Clientes activos"
          valor={catalogo.clientes}
          sub={`${catalogo.articulos} artículo${catalogo.articulos === 1 ? '' : 's'} en catálogo`}
        />

        <Tarjeta
          icono="fa-barcode"
          clase={alertasNcf.length ? 'peligro' : ''}
          label="Secuencias NCF activas"
          valor={ncf.length}
          sub={alertasNcf.length ? `${alertasNcf.length} con alerta` : 'Todas en orden'}
        />
      </section>

      <section className="vista-card dash-panel">
        <header className="dash-panel-head">
          <h2><i className="fas fa-barcode"></i> Comprobantes disponibles por tipo</h2>
        </header>
        <SecuenciasNcf secuencias={ncf} />
      </section>

      <section className="dash-grid">
        <div className="vista-card dash-panel">
          <header className="dash-panel-head">
            <h2><i className="fas fa-chart-column"></i> Facturado en los últimos 6 meses</h2>
          </header>
          <GraficoMeses serie={serie} />
        </div>

        <div className="vista-card dash-panel">
          <header className="dash-panel-head">
            <h2><i className="fas fa-chart-pie"></i> Facturas por estado</h2>
          </header>
          <div className="dash-estados">
            <Dona datos={porEstado} total={totalFacturas} />
            <ul className="dash-leyenda">
              {Object.entries(ESTADOS).map(([clave, meta]) => {
                const item = porEstado.find((p) => p.estado === clave)
                return (
                  <li key={clave}>
                    <span className={`dash-punto punto-${meta.clase}`}></span>
                    <span className="dash-leyenda-label">
                      <i className={`fas ${meta.icono}`}></i> {meta.label}
                    </span>
                    <strong>{conteo(clave)}</strong>
                    <span className="dash-leyenda-monto">{money(item?.monto || 0)}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </section>

      <section className="dash-grid">
        <div className="vista-card dash-panel">
          <header className="dash-panel-head">
            <h2><i className="fas fa-trophy"></i> Clientes que más facturan</h2>
          </header>
          {topClientes.length === 0 ? (
            <p className="dash-vacio">Todavía no hay facturas emitidas a ningún cliente.</p>
          ) : (
            <ul className="dash-lista">
              {topClientes.map((c, i) => (
                <li key={c.id}>
                  <span className="dash-puesto">{i + 1}</span>
                  <div className="dash-lista-info">
                    <strong>{c.nombre}</strong>
                    <span>{c.rnc || 'Sin RNC'} · {c.facturas} factura{c.facturas === 1 ? '' : 's'}</span>
                  </div>
                  <span className="dash-lista-monto">{money(c.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="vista-card dash-panel">
          <header className="dash-panel-head">
            <h2><i className="fas fa-clock-rotate-left"></i> Últimas facturas</h2>
          </header>
          {recientes.length === 0 ? (
            <p className="dash-vacio">Aún no se ha registrado ninguna factura.</p>
          ) : (
            <div className="tabla-wrap">
              <table className="tabla-crud">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th className="dash-td-num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <strong>{f.numero}</strong>
                        {f.nfc_numero && <span className="dash-ncf-numero">{f.nfc_numero}</span>}
                      </td>
                      <td>{f.cliente_nombre}</td>
                      <td>{fecha(f.fecha)}</td>
                      <td>
                        <span className={`badge badge-${ESTADOS[f.estado]?.clase || 'gris'}`}>
                          {ESTADOS[f.estado]?.label.replace(/s$/, '') || f.estado}
                        </span>
                      </td>
                      <td className="dash-td-num">{money(f.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
