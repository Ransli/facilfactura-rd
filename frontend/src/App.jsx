import { useState, useEffect } from 'react'
import './App.css'
import MenuLateral from './components/MenuLateral'
import Dashboard from './vistas/Dashboard'
import Factura from './vistas/Factura'
import Productos from './vistas/Productos'
import Clientes from './vistas/Clientes'
import NFC from './vistas/NFC'
import ECF from './vistas/ECF'
import Historial from './vistas/Historial'
import Configuracion from './vistas/Configuracion'
import Usuarios from './vistas/Usuarios'
import Login from './vistas/Login'
import Registro from './vistas/Registro'
import Landing from './vistas/Landing'
import AvisoSuscripcion from './components/AvisoSuscripcion'
import { useAuth } from './context/AuthContext'

const VISTAS = {
  dashboard:     Dashboard,
  factura:       Factura,
  productos:     Productos,
  clientes:      Clientes,
  nfc:           NFC,
  ecf:           ECF,
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

// Las vistas públicas (sin sesión) tienen una URL propia para que se puedan
// compartir/recargar y para que el botón "atrás" del navegador funcione.
const RUTA_POR_VISTA_PUBLICA = { landing: '/', login: '/login', registro: '/registro' }
const VISTA_PUBLICA_POR_RUTA = { '/login': 'login', '/registro': 'registro' }
function vistaPublicaDesdeURL() {
  return VISTA_PUBLICA_POR_RUTA[window.location.pathname] || 'landing'
}

export default function App() {
  const { usuario, cargando } = useAuth()
  const [vistaActiva, setVistaActiva] = useState(vistaInicial)
  const [menuAbierto, setMenuAbierto] = useState(false)
  // 'landing' (bienvenida pública) → 'login' / 'registro'. Solo aplica cuando no hay sesión.
  const [vistaPublica, setVistaPublica] = useState(vistaPublicaDesdeURL)

  // Cambia de vista pública y refleja la ruta en la URL (en vez de quedarse
  // siempre en "/"), para que se pueda recargar, compartir o volver con el
  // botón "atrás" del navegador.
  const irAVistaPublica = (nueva) => {
    setVistaPublica(nueva)
    const ruta = RUTA_POR_VISTA_PUBLICA[nueva]
    if (window.location.pathname !== ruta) window.history.pushState(null, '', ruta)
  }

  useEffect(() => {
    const handler = () => setVistaPublica(vistaPublicaDesdeURL())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  // Si el usuario inicia sesión estando en /login o /registro, esas rutas ya
  // no aplican (la app autenticada no usa rutas propias): se limpia la URL.
  useEffect(() => {
    if (usuario && window.location.pathname !== '/') window.history.replaceState(null, '', '/')
  }, [usuario])

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

  if (!usuario) {
    if (vistaPublica === 'registro') {
      return <Registro onVolver={() => irAVistaPublica('login')} onVolverInicio={() => irAVistaPublica('landing')} />
    }
    if (vistaPublica === 'login') {
      return <Login onRegistro={() => irAVistaPublica('registro')} onVolver={() => irAVistaPublica('landing')} />
    }
    return <Landing onIniciarSesion={() => irAVistaPublica('login')} onCrearCuenta={() => irAVistaPublica('registro')} />
  }

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

        <AvisoSuscripcion />

        <main id="contenedor-vista">
          <VistaActual />
        </main>
      </div>
    </div>
  )
}
