// Vista de contabilidad: gastos y reportes DGII.
//
// DÓNDE VA: frontend/src/vistas/
// CONECTAR (2 cambios pequeños):
//   frontend/src/App.jsx                       → importar esta vista y agregarla a VISTAS con el id `contabilidad`
//   frontend/src/components/MenuLateral.jsx    → item { id: 'contabilidad', icono: 'fa-solid fa-calculator', label: 'Contabilidad' }
// Estilos: reutiliza las clases de vistas.css (vista-card, vista-header, tabla-crud, btn-primary...), como Clientes.jsx.
import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/config'
import { useAuth } from '../context/AuthContext'
import Toast, { useToast } from '../components/Toast'
import './vistas.css'

const PESTANAS = [
  { id: 'gastos', etiqueta: 'Gastos' },
  { id: 'reportes', etiqueta: 'Reportes DGII' },
]

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
        {pestana === 'reportes' && <Reportes mostrar={mostrar} />}
      </div>
      <Toast toast={toast} onClose={cerrar} />
    </>
  )
}

function Gastos({ puedeEditar, mostrar }) {
  const [gastos, setGastos] = useState([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/contabilidad/gastos')
      setGastos(res.data)
    } catch (err) { mostrar(err.message) }
    finally { setCargando(false) }
  }, [mostrar])
  useEffect(() => { cargar() }, [cargar])

  // TODO (7 oct): formulario «Nuevo gasto» (proveedor, RNC, NCF, categoría 606, fechas, montos, ITBIS), visible
  // solo si puedeEditar, con validación de RNC/NCF como en Clientes.jsx, y edición/anulación por fila.
  return (
    <>
      {puedeEditar && <button className="btn-primary" disabled title="Pendiente">+ Nuevo gasto</button>}
      {cargando ? <p>Cargando…</p> : (
        <table className="tabla-crud">
          <thead><tr><th>Fecha</th><th>Proveedor</th><th>NCF</th><th>Categoría 606</th><th>Total</th></tr></thead>
          <tbody>
            {gastos.map((g) => (
              <tr key={g.id}>
                <td>{String(g.fecha_comprobante).slice(0, 10)}</td>
                <td>{g.proveedor_nombre}</td>
                <td>{g.ncf}</td>
                <td>{g.categoria_606_codigo} {g.categoria_606_nombre}</td>
                <td>{(Number(g.monto_servicios) + Number(g.monto_bienes)).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function Reportes({ mostrar }) {
  const [periodo, setPeriodo] = useState('')
  // TODO (7 oct): botones 606, 607, 608, 609 que llamen a /contabilidad/reportes/{formato}?periodo=AAAAMM y
  // descarguen el TXT (fetch con el token → blob → enlace de descarga). Validar el período AAAAMM antes de pedir.
  return (
    <div>
      <label>Período (AAAAMM): <input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="202609" maxLength={6} /></label>
      <p style={{ color: '#667' }}>Descarga de los formatos 606, 607, 608 y 609: pendiente.</p>
    </div>
  )
}
