// Autenticación de la consola master. Realm separado de `usuarios` (que son del personal de cada empresa):
// nadie de `usuarios_plataforma` tiene tenant_id.
//
// El token del master se firma con una clave DISTINTA a la de los tenants (`JWT_SECRET + ':master'`, mismo
// truco que usa el registro de empresas en `services/tenants/registro.js`): así un token de tenant nunca sirve
// como token de master, ni al revés, aunque compartan el mismo JWT_SECRET base.

import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const DURACION_TOKEN = '8h'
const MENSAJE_GENERICO = 'Email o contraseña incorrectos'

export class ErrorDeAutenticacion extends Error {
  constructor(mensaje = MENSAJE_GENERICO) {
    super(mensaje)
    this.name = 'ErrorDeAutenticacion'
    this.estado = 401
  }
}

export const claveMaster = () => `${process.env.JWT_SECRET}:master`

/**
 * Verifica email y contraseña contra `usuarios_plataforma` y entrega un token de la consola master.
 * @returns { token, master: { id, nombre, email } }
 * @throws  ErrorDeAutenticacion — mismo mensaje tanto si el email no existe como si la contraseña es incorrecta,
 *          para no revelar qué correos están registrados como master.
 */
export async function autenticarMaster(db, { email, password }) {
  const [[fila]] = await db.query(
    'SELECT id, nombre, email, password_hash, activo FROM usuarios_plataforma WHERE email = ?', [String(email ?? '').trim()])
  if (!fila || !fila.activo || !(await bcrypt.compare(String(password ?? ''), fila.password_hash))) {
    throw new ErrorDeAutenticacion()
  }

  await db.query('UPDATE usuarios_plataforma SET ultimo_acceso = NOW() WHERE id = ?', [fila.id])
  const token = jwt.sign({ id: fila.id, email: fila.email, ambito: 'master' }, claveMaster(), { expiresIn: DURACION_TOKEN })
  return { token, master: { id: fila.id, nombre: fila.nombre, email: fila.email } }
}
