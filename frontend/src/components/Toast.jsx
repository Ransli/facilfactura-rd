import { useState, useCallback } from 'react'
import './Toast.css'

const ICONOS = {
  error:   'fas fa-circle-exclamation',
  success: 'fas fa-circle-check',
  warning: 'fas fa-triangle-exclamation',
  info:    'fas fa-circle-info',
}

export function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = { current: null }

  const mostrar = useCallback((mensaje, tipo = 'error') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ mensaje, tipo })
    timerRef.current = setTimeout(() => setToast(null), 4500)
  }, [])

  const cerrar = useCallback(() => setToast(null), [])

  return { toast, mostrar, cerrar }
}

export default function Toast({ toast, onClose }) {
  if (!toast) return null
  return (
    <div className={`toast toast-${toast.tipo}`} role="alert">
      <i className={ICONOS[toast.tipo] || ICONOS.info}></i>
      <span className="toast-mensaje">{toast.mensaje}</span>
      <button className="toast-cerrar" onClick={onClose} aria-label="Cerrar">
        <i className="fas fa-xmark"></i>
      </button>
    </div>
  )
}
