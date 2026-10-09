// Consola master: administración de toda la plataforma (empresas, planes, pagos, cambios de plan), no solo un
// listado para mirar. Cada sección vive en su propio archivo bajo secciones/; esta raíz solo decide cuál se ve.
import { useState } from 'react'
import MasterLayout from './MasterLayout'
import MasterLogin from './secciones/Login'
import Dashboard from './secciones/Dashboard'
import Empresas from './secciones/Empresas'
import EmpresaDetalle from './secciones/EmpresaDetalle'
import Planes from './secciones/Planes'
import Pagos from './secciones/Pagos'
import CambiosPlan from './secciones/CambiosPlan'
import './master.css'

export default function MasterApp() {
  const [master, setMaster] = useState(() => {
    const guardado = localStorage.getItem('master')
    return guardado ? JSON.parse(guardado) : null
  })
  const [seccion, setSeccion] = useState('dashboard')
  // Al abrir una empresa desde cualquier sección (Dashboard, Pagos, Cambios de plan...), "Volver" debe
  // regresar a esa misma sección, no siempre a Empresas.
  const [tenantAbierto, setTenantAbierto] = useState(null)
  const [volverA, setVolverA] = useState('empresas')

  function salir() {
    localStorage.removeItem('master_token')
    localStorage.removeItem('master')
    setMaster(null)
  }

  function abrirEmpresa(tenantId) {
    setVolverA(seccion)
    setTenantAbierto(tenantId)
  }

  function cambiarSeccion(id) {
    setTenantAbierto(null)
    setSeccion(id)
  }

  if (!master) return <MasterLogin onEntrar={setMaster} />

  const secciones = {
    dashboard:     <Dashboard onAbrirEmpresa={abrirEmpresa} />,
    empresas:      <Empresas onAbrirEmpresa={abrirEmpresa} />,
    planes:        <Planes />,
    pagos:         <Pagos onAbrirEmpresa={abrirEmpresa} />,
    'cambios-plan': <CambiosPlan onAbrirEmpresa={abrirEmpresa} />,
  }

  return (
    <MasterLayout seccionActiva={seccion} onCambiarSeccion={cambiarSeccion} master={master} onSalir={salir}>
      {tenantAbierto ? (
        <EmpresaDetalle
          tenantId={tenantAbierto}
          onVolver={() => { setTenantAbierto(null); setSeccion(volverA) }}
        />
      ) : secciones[seccion]}
    </MasterLayout>
  )
}
