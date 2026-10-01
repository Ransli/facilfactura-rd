import { useState, useEffect } from 'react'
import { api } from '../api/config'
import './Landing.css'

const CARACTERISTICAS = [
  {
    icono: 'fa-file-invoice-dollar',
    titulo: 'Facturación con NCF',
    texto: 'Numera tus comprobantes fiscales (B01, B02, B14, B15, B16...) con control automático de rangos, vencimiento y alertas de agotamiento.',
  },
  {
    icono: 'fa-file-shield',
    titulo: 'Facturación electrónica (e-CF)',
    texto: 'Emite comprobantes fiscales electrónicos 31, 32 y 34, firmados digitalmente, con código QR y envío directo a la DGII.',
  },
  {
    icono: 'fa-building',
    titulo: 'Multiempresa desde el inicio',
    texto: 'Cada empresa tiene sus propios datos, usuarios y numeración, completamente aislados del resto — una sola plataforma, cero cruces.',
  },
  {
    icono: 'fa-box-open',
    titulo: 'Catálogo e inventario',
    texto: 'Productos y servicios con precios por unidad de medida, categorías y artículos con dimensiones (área, volumen).',
  },
  {
    icono: 'fa-users',
    titulo: 'Clientes validados',
    texto: 'Registro de clientes con validación automática de RNC (9 dígitos) y cédula (11 dígitos), listos para facturar.',
  },
  {
    icono: 'fa-chart-line',
    titulo: 'Panel y reportes',
    texto: 'Facturación del mes, ITBIS, consumo de NCF y evolución de los últimos 6 meses, de un vistazo.',
  },
]

const PASOS = [
  { numero: '1', titulo: 'Crea tu empresa', texto: 'Regístrate con los datos de tu negocio en menos de dos minutos.' },
  { numero: '2', titulo: 'Elige tu plan', texto: 'Empieza con la prueba gratuita y cambia de plan cuando lo necesites.' },
  { numero: '3', titulo: 'Configura tu numeración', texto: 'Registra tus secuencias NCF o tu certificado digital para e-CF.' },
  { numero: '4', titulo: 'Empieza a facturar', texto: 'Emite, imprime y comparte tus facturas desde el primer día.' },
]

const CAPTURAS = [
  { src: '/capturas/02-panel.png', alt: 'Panel de control de FácilFactura RD', titulo: 'Panel de control', texto: 'Facturación del mes, ITBIS y evolución de los últimos 6 meses.' },
  { src: '/capturas/03-factura.png', alt: 'Emisión de facturas', titulo: 'Emisión de facturas', texto: 'Cálculo automático de ITBIS, retenciones y asignación del NCF.' },
  { src: '/capturas/06-ncf.png', alt: 'Secuencias NCF', titulo: 'Secuencias NCF', texto: 'Rangos autorizados por la DGII, con alertas de agotamiento.' },
  { src: '/capturas/05-clientes.png', alt: 'Gestión de clientes', titulo: 'Gestión de clientes', texto: 'Clientes con RNC o cédula validados, listos para facturar.' },
]

const dinero = (n) => Number(n).toLocaleString('es-DO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default function Landing({ onIniciarSesion, onCrearCuenta }) {
  const [planes, setPlanes] = useState([])
  const [capturaActiva, setCapturaActiva] = useState(0)
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    api.get('/suscripcion/planes').then((r) => setPlanes(r.data || [])).catch(() => {})
  }, [])

  const planPrueba = planes.find((p) => p.es_plan_prueba)

  const irA = (id) => {
    setMenuAbierto(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="landing">
      {/* ── Navegación ── */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-marca">
            <img src="/logo.svg" alt="Logo" />
            <span>FácilFactura RD</span>
          </div>

          <nav className={`landing-nav-links${menuAbierto ? ' abierto' : ''}`}>
            <button onClick={() => irA('caracteristicas')}>Características</button>
            <button onClick={() => irA('como-funciona')}>Cómo funciona</button>
            <button onClick={() => irA('planes')}>Planes</button>
            <button className="landing-nav-login" onClick={onIniciarSesion}>Iniciar sesión</button>
            <button className="landing-nav-cta" onClick={onCrearCuenta}>Crear cuenta gratis</button>
          </nav>

          <button className="landing-nav-burger" onClick={() => setMenuAbierto((v) => !v)}>
            <i className={`fas ${menuAbierto ? 'fa-xmark' : 'fa-bars'}`}></i>
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-texto">
          <span className="landing-eyebrow"><i className="fas fa-bolt"></i> Hecho para la DGII dominicana</span>
          <h1>Factura con NCF y e-CF sin complicarte</h1>
          <p>
            FácilFactura RD es la plataforma para que tu negocio emita facturas, controle sus comprobantes
            fiscales y cumpla con la DGII — sin instalar nada y desde cualquier dispositivo.
          </p>
          <div className="landing-hero-botones">
            <button className="landing-btn landing-btn-primario" onClick={onCrearCuenta}>
              <i className="fas fa-rocket"></i> Crear cuenta gratis
            </button>
            <button className="landing-btn landing-btn-secundario" onClick={onIniciarSesion}>
              <i className="fas fa-right-to-bracket"></i> Ya tengo cuenta
            </button>
          </div>
          {planPrueba && (
            <p className="landing-hero-nota">
              <i className="fas fa-circle-check"></i> {planPrueba.dias_prueba} días de prueba gratis, sin tarjeta de crédito
            </p>
          )}
        </div>

        <div className="landing-hero-imagen">
          <div className="landing-browser-frame">
            <div className="landing-browser-barra">
              <span></span><span></span><span></span>
            </div>
            <img src="/capturas/02-panel.png" alt="Panel de control de FácilFactura RD" />
          </div>
        </div>
      </section>

      {/* ── Características ── */}
      <section id="caracteristicas" className="landing-seccion">
        <h2>Todo lo que tu negocio necesita para facturar</h2>
        <p className="landing-seccion-sub">De la numeración NCF a la factura electrónica, en una sola plataforma.</p>

        <div className="landing-grid-caracteristicas">
          {CARACTERISTICAS.map((c) => (
            <div key={c.titulo} className="landing-card-caracteristica">
              <div className="landing-icono"><i className={`fas ${c.icono}`}></i></div>
              <h3>{c.titulo}</h3>
              <p>{c.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capturas ── */}
      <section className="landing-seccion landing-seccion-gris">
        <h2>Así se ve por dentro</h2>
        <p className="landing-seccion-sub">Capturas reales del sistema en funcionamiento.</p>

        <div className="landing-capturas">
          <div className="landing-browser-frame landing-captura-grande">
            <div className="landing-browser-barra">
              <span></span><span></span><span></span>
            </div>
            <img src={CAPTURAS[capturaActiva].src} alt={CAPTURAS[capturaActiva].alt} />
          </div>
          <div className="landing-captura-info">
            <h3>{CAPTURAS[capturaActiva].titulo}</h3>
            <p>{CAPTURAS[capturaActiva].texto}</p>
          </div>
          <div className="landing-captura-miniaturas">
            {CAPTURAS.map((c, i) => (
              <button
                key={c.titulo}
                className={`landing-miniatura${i === capturaActiva ? ' activa' : ''}`}
                onClick={() => setCapturaActiva(i)}
                title={c.titulo}
              >
                <img src={c.src} alt={c.alt} />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ── */}
      <section id="como-funciona" className="landing-seccion">
        <h2>Cómo funciona</h2>
        <p className="landing-seccion-sub">De cero a tu primera factura en minutos.</p>

        <div className="landing-pasos">
          {PASOS.map((p) => (
            <div key={p.numero} className="landing-paso">
              <div className="landing-paso-numero">{p.numero}</div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Planes ── */}
      <section id="planes" className="landing-seccion landing-seccion-gris">
        <h2>Un plan para cada tamaño de negocio</h2>
        <p className="landing-seccion-sub">Cambia de plan cuando quieras, sin perder tu historial.</p>

        <div className="landing-grid-planes">
          {planes.length === 0 ? (
            <p className="landing-planes-cargando"><i className="fas fa-spinner fa-spin"></i> Cargando planes...</p>
          ) : planes.map((p) => (
            <div key={p.id} className={`landing-card-plan${p.es_plan_prueba ? ' destacado' : ''}`}>
              {p.es_plan_prueba && <span className="landing-plan-badge">Para empezar</span>}
              <h3>{p.nombre}</h3>
              <p className="landing-plan-descripcion">{p.descripcion}</p>
              <div className="landing-plan-precio">
                {Number(p.precio_mensual) === 0 ? 'Gratis' : <>RD$ {dinero(p.precio_mensual)}<span>/mes</span></>}
              </div>
              <ul className="landing-plan-lista">
                <li><i className="fas fa-check"></i> {p.max_usuarios === -1 ? 'Usuarios ilimitados' : `Hasta ${p.max_usuarios} usuarios`}</li>
                <li><i className="fas fa-check"></i> {p.max_clientes === -1 ? 'Clientes ilimitados' : `Hasta ${p.max_clientes} clientes`}</li>
                <li><i className="fas fa-check"></i> {p.max_ecf_mes === -1 ? 'e-CF ilimitados al mes' : `${p.max_ecf_mes} e-CF al mes`}</li>
              </ul>
              <button className="landing-btn landing-btn-primario landing-plan-btn" onClick={onCrearCuenta}>
                {p.es_plan_prueba ? 'Empezar gratis' : 'Elegir plan'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="landing-cta-final">
        <h2>¿Listo para dejar de facturar a mano?</h2>
        <p>Crea tu empresa hoy y emite tu primera factura en minutos.</p>
        <button className="landing-btn landing-btn-primario" onClick={onCrearCuenta}>
          <i className="fas fa-rocket"></i> Crear cuenta gratis
        </button>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-marca">
            <img src="/logo.svg" alt="Logo" />
            <span>FácilFactura RD</span>
            <p>Facturación con NCF y comprobantes fiscales electrónicos para República Dominicana.</p>
          </div>

          <div className="landing-footer-enlaces">
            <button onClick={() => irA('caracteristicas')}>Características</button>
            <button onClick={() => irA('planes')}>Planes</button>
            <button onClick={onIniciarSesion}>Iniciar sesión</button>
            <a href="https://github.com/Ransli/facilfactura-rd" target="_blank" rel="noreferrer">
              <i className="fab fa-github"></i> Repositorio
            </a>
          </div>
        </div>

        <div className="landing-footer-academico">
          Proyecto académico desarrollado por el <strong>Grupo I</strong> para la asignatura Seminario de
          Proyecto II (ISW410), Escuela de Ingeniería y Tecnología, Universidad Abierta para Adultos (UAPA).
          Facilitador: Ing. Henry Candelario.
        </div>
      </footer>
    </div>
  )
}
