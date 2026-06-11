import { useState, useEffect } from 'react'
import './App.css'
import MenuLateral from './components/MenuLateral'
import Factura from './vistas/Factura'
import Productos from './vistas/Productos'
import Clientes from './vistas/Clientes'
import NFC from './vistas/NFC'
import Historial from './vistas/Historial'
import Configuracion from './vistas/Configuracion'
import Login from './vistas/Login'
import { useAuth } from './context/AuthContext'

const VISTAS = {
  factura:       Factura,
  productos:     Productos,
  clientes:      Clientes,
  nfc:           NFC,
  historial:     Historial,
  configuracion: Configuracion,
}

export default function App() {
  const { usuario, cargando } = useAuth()
  const [vistaActiva, setVistaActiva] = useState('factura')
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

  const VistaActual = VISTAS[vistaActiva]

  const cambiarVista = (vista) => {
    setVistaActiva(vista)
    setMenuAbierto(false)
  }

  return (
    <div className="contenedor-app">
      <MenuLateral
        vistaActiva={vistaActiva}
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
