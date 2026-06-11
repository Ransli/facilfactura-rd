export default function EnDesarrollo({ titulo, icono }) {
  return (
    <div className="vista-placeholder">
      <i className={icono || 'fas fa-tools'}></i>
      <h2>{titulo || 'Módulo en desarrollo'}</h2>
      <p>Esta vista está en desarrollo</p>
    </div>
  )
}
