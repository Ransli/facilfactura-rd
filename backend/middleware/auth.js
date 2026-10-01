import jwt from 'jsonwebtoken'

export function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ ok: false, mensaje: 'Token requerido' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.usuario = payload

    // Sesión de "ver como empresa" del master (consola master, modo ver): el token lleva
    // solo_lectura:true y aquí se bloquea cualquier escritura, sea cual sea la ruta.
    if (payload.solo_lectura === true && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return res.status(403).json({ ok: false, mensaje: 'Sesión de solo lectura: no se pueden hacer cambios', solo_lectura: true })
    }
    next()
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado' })
  }
}

export function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ ok: false, mensaje: 'Acceso restringido a administradores' })
  }
  next()
}

export function soloFacturador(req, res, next) {
  const roles = ['admin', 'facturador']
  if (!roles.includes(req.usuario?.rol)) {
    return res.status(403).json({ ok: false, mensaje: 'No tienes permiso para esta acción' })
  }
  next()
}
