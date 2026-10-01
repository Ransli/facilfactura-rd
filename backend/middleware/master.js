// Autenticación de las rutas de la consola master. Va SIEMPRE primero en esas rutas:
//
//   router.use(verificarTokenMaster)
//
// El token se firma con `claveMaster()` (JWT_SECRET + ':master'), así que un token de empresa (tenant) —firmado
// solo con JWT_SECRET— nunca pasa aquí, y un token de master nunca pasa `verificarToken` (rutas de negocio).

import jwt from 'jsonwebtoken'
import { claveMaster } from '../services/master/autenticacion.js'

export function verificarTokenMaster(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ ok: false, mensaje: 'Token requerido' })

  try {
    const payload = jwt.verify(token, claveMaster())
    if (payload.ambito !== 'master') throw new Error('token de otro ámbito')
    req.master = payload
    next()
  } catch {
    return res.status(401).json({ ok: false, mensaje: 'Token inválido o expirado' })
  }
}
