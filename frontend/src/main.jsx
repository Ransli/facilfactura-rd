import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import App from './App.jsx'
import MasterApp from './master/MasterApp.jsx'

// La consola master es un realm aparte, con su propia sesión (ver src/master/masterApi.js): entra por /master
// y nunca comparte el AuthProvider de la app de empresa.
const esConsolaMaster = window.location.pathname.startsWith('/master')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {esConsolaMaster ? <MasterApp /> : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </StrictMode>,
)
