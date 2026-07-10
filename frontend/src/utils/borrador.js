// Guarda la factura en edición en el navegador, para que recargar la página
// o cerrar el navegador por accidente no pierda el trabajo.
//
// El borrador NO toca la base de datos: no consume número de factura ni NCF.
// Solo existe hasta que la factura se emite o el usuario la descarta.

const CLAVE = 'factura_borrador'

// Si algún día cambia la forma del borrador, subir este número descarta los
// guardados viejos en vez de restaurar un objeto que ya no encaja.
const VERSION = 1

export function guardarBorrador({ items, cliente, tipoServicioId, vencimiento }) {
  // Un borrador sin artículos ni cliente no vale la pena: sería restaurar la nada.
  if (!items?.length && !cliente) {
    limpiarBorrador()
    return null
  }

  const borrador = {
    version: VERSION,
    guardadoEn: new Date().toISOString(),
    items,
    cliente,
    tipoServicioId,
    vencimiento,
  }

  try {
    localStorage.setItem(CLAVE, JSON.stringify(borrador))
    return borrador.guardadoEn
  } catch {
    // Cuota llena o modo privado: perder el borrador no debe romper la factura.
    return null
  }
}

export function leerBorrador() {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null

    const borrador = JSON.parse(crudo)
    if (borrador?.version !== VERSION) {
      limpiarBorrador()
      return null
    }
    if (!borrador.items?.length && !borrador.cliente) return null

    return borrador
  } catch {
    limpiarBorrador()
    return null
  }
}

export function limpiarBorrador() {
  localStorage.removeItem(CLAVE)
}
