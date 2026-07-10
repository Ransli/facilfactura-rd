import { useState, useEffect } from 'react'
import './App.css'
import MenuLateral from './components/MenuLateral'
import Dashboard from './vistas/Dashboard'
import Factura from './vistas/Factura'
import Productos from './vistas/Productos'
import Clientes from './vistas/Clientes'
import NFC from './vistas/NFC'
import Historial from './vistas/Historial'
import Configuracion from './vistas/Configuracion'
import Usuarios from './vistas/Usuarios'
import Login from './vistas/Login'
import { useAuth } from './context/AuthContext'

const VISTAS = {
  dashboard:     Dashboard,
  factura:       Factura,
  productos:     Productos,
  clientes:      Clientes,
  nfc:           NFC,
  historial:     Historial,
  configuracion: Configuracion,
  usuarios:      Usuarios,
}

const VISTA_GUARDADA = 'vista_activa'

// Al recargar se vuelve a la última vista, no al panel. Si el nombre guardado
// ya no existe (menú renombrado, usuario sin permiso), se cae al panel.
function vistaInicial() {
  const guardada = localStorage.getItem(VISTA_GUARDADA)
  return guardada && VISTAS[guardada] ? guardada : 'dashboard'
}

export default function App() {
  const { usuario, cargando } = useAuth()
  const [vistaActiva, setVistaActiva] = useState(vistaInicial)
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (
        window.innerWidth <= 1024 &&
        !e.target.closest('.menu-lateral') &&
        !e.target.closest('.boton-menu')
      ) {
        setMenuAbierto(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  if (cargando) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#f5f7fa' }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize:'2rem', color:'#17406d' }}></i>
      </div>
    )
  }

  if (!usuario) return <Login />

  // Un no-admin que recarga sobre Usuarios no debe quedarse en una vista
  // que su menú ni siquiera le ofrece.
  const vista = vistaActiva === 'usuarios' && usuario.rol !== 'admin' ? 'dashboard' : vistaActiva
  const VistaActual = VISTAS[vista]

  const cambiarVista = (nueva) => {
    setVistaActiva(nueva)
    localStorage.setItem(VISTA_GUARDADA, nueva)
    setMenuAbierto(false)
  }

  return (
    <div className="contenedor-app">
      <MenuLateral
        vistaActiva={vista}
        setVistaActiva={cambiarVista}
        abierto={menuAbierto}
      />

      <div className="contenido-principal">
        <header className="topbar-movil">
          <button className="boton-menu" onClick={() => setMenuAbierto((v) => !v)}>
            <i className="fas fa-bars"></i>
          </button>
          <span className="topbar-nombre">
            <i className="fas fa-file-invoice" style={{ color:'#55b6ff', marginRight:8 }}></i>
            FácilFactura RD
          </span>
        </header>

        <main id="contenedor-vista">
          <VistaActual />
        </main>
      </div>
    </div>
  )
}
