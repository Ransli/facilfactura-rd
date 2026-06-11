import { useAuth } from '../context/AuthContext'

const items = [
  { id: 'factura',       icono: 'fa-solid fa-file-invoice',       label: 'Factura' },
  { id: 'productos',     icono: 'fa-solid fa-box',                 label: 'Productos' },
  { id: 'clientes',      icono: 'fa-solid fa-users',               label: 'Clientes' },
  { id: 'nfc',           icono: 'fa-solid fa-barcode',             label: 'NCF' },
  { id: 'historial',     icono: 'fa-solid fa-clock-rotate-left',   label: 'Historial' },
  { id: 'configuracion', icono: 'fa-solid fa-cog',                 label: 'Configuración' },
]

export default function MenuLateral({ vistaActiva, setVistaActiva, abierto }) {
  const { usuario, logout } = useAuth()

  return (
    <nav className={`menu-lateral${abierto ? ' activo' : ''}`}>
      <div className="logo-menu">
        <img src="/logo.svg" alt="Logo" />
        <span>FácilFactura RD</span>
      </div>

      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            className={`item-menu${vistaActiva === item.id ? ' activo' : ''}`}
            onClick={() => setVistaActiva(item.id)}
          >
            <i className={item.icono}></i>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <div className="menu-usuario">
        <div className="menu-usuario-info">
          <i className="fas fa-circle-user"></i>
          <div>
            <span className="menu-usuario-nombre">{usuario?.nombre}</span>
            <span className="menu-usuario-rol">{usuario?.rol}</span>
          </div>
        </div>
        <button className="menu-logout" onClick={logout} title="Cerrar sesión">
          <i className="fas fa-right-from-bracket"></i>
        </button>
      </div>
    </nav>
  )
}
