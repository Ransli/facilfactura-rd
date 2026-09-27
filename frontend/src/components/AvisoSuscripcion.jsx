import { useState, useEffect } from 'react'
import { api } from '../api/config'
import './AvisoSuscripcion.css'

const CADA_5_MINUTOS = 5 * 60 * 1000

// Franja fija bajo el menú que informa el estado de la suscripción de la empresa:
//  - bloqueada  → solo lectura (roja): se puede consultar todo, pero no crear ni modificar
//  - en gracia / por vencer / pago pendiente → aviso (ámbar)
// Si todo está en orden no muestra nada.
export default function AvisoSuscripcion() {
  const [suscripcion, setSuscripcion] = useState(null)

  useEffect(() => {
    let vivo = true
    async function cargar() {
      try {
        const res = await api.get('/suscripcion/mi-suscripcion')
        if (vivo) setSuscripcion(res?.data ?? null)
      } catch {
        if (vivo) setSuscripcion(null)   // sin aviso si no se pudo consultar: no estorba el trabajo
      }
    }
    cargar()
    const intervalo = setInterval(cargar, CADA_5_MINUTOS)
    return () => { vivo = false; clearInterval(intervalo) }
  }, [])

  if (!suscripcion?.aviso) return null

  const bloqueada = suscripcion.bloqueado
  return (
    <div className={`aviso-suscripcion ${bloqueada ? 'bloqueada' : 'advertencia'} no-print`} role="status">
      <i className={`fas ${bloqueada ? 'fa-lock' : 'fa-triangle-exclamation'}`}></i>
      <span>{suscripcion.aviso}</span>
      {suscripcion.plan?.nombre && <span className="aviso-plan">Plan {suscripcion.plan.nombre}</span>}
    </div>
  )
}
