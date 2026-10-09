// Layout de la consola master: barra lateral + contenido. Reutiliza las mismas clases de App.css que ya usa
// la app de cada empresa (.contenedor-app, .menu-lateral, .contenido-principal...), para que la consola se vea
// como una parte más del sistema y no como una pantalla aparte pegada con otro estilo.
import { useState } from 'react'
// App.jsx nunca se monta en /master (ver main.jsx), así que su CSS (barra lateral, layout general) no llega
// sola: se importa aquí para que la consola master se vea con el mismo look que la app de cada empresa.
import '../App.css'
import '../vistas/vistas.css'

const SECCIONES = [
  { id: 'dashboard',    icono: 'fa-solid fa-gauge-high',         label: 'Dashboard' },
  { id: 'empresas',     icono: 'fa-solid fa-building',           label: 'Empresas' },
  { id: 'planes',       icono: 'fa-solid fa-layer-group',        label: 'Planes' },
  { id: 'pagos',        icono: 'fa-solid fa-sack-dollar',        label: 'Pagos' },
  { id: 'cambios-plan', icono: 'fa-solid fa-right-left',         label: 'Cambios de plan' },
]

export default function MasterLayout({ seccionActiva, onCambiarSeccion, master, onSalir, children }) {
  const [menuAbierto, setMenuAbierto] = useState(false)

  const irA = (id) => {
    onCambiarSeccion(id)
    setMenuAbierto(false)
  }

  return (
    // "master-shell" le da a toda la consola una paleta distinta (morado/dorado en vez del azul marino de la
    // app de cada empresa) para que nunca se confunda estar administrando la plataforma con estar dentro del
    // perfil de un tenant — sobre todo al volver de "Entrar a ver/editar" una empresa. Ver master.css.
    <div className="contenedor-app master-shell">
      <nav className={`menu-lateral${menuAbierto ? ' activo' : ''}`}>
        <div className="logo-menu">
          <img src="/logo.svg" alt="Logo" />
          <span>Consola Master</span>
        </div>

        <ul>
          {SECCIONES.map((s) => (
            <li
              key={s.id}
              className={`item-menu${seccionActiva === s.id ? ' activo' : ''}`}
              onClick={() => irA(s.id)}
            >
              <i className={s.icono}></i>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>

        <div className="menu-usuario">
          <div className="menu-usuario-info">
            <i className="fas fa-user-shield"></i>
            <div>
              <span className="menu-usuario-nombre">{master?.nombre}</span>
              <span className="menu-usuario-rol">master</span>
            </div>
          </div>
          <button className="menu-logout" onClick={onSalir} title="Cerrar sesión">
            <i className="fas fa-right-from-bracket"></i>
          </button>
        </div>
      </nav>

      <div className="contenido-principal">
        <header className="topbar-movil">
          <button className="boton-menu" onClick={() => setMenuAbierto((v) => !v)}>
            <i className="fas fa-bars"></i>
          </button>
          <span className="topbar-nombre">
            <i className="fas fa-user-shield" style={{ color: '#55b6ff', marginRight: 8 }}></i>
            Consola Master
          </span>
        </header>

        <main id="contenedor-vista">{children}</main>
      </div>
    </div>
  )
}
