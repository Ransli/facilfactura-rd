// Alta de empresas autoservicio (propuesta de la Unidad II, V.5): 1) datos de la empresa, 2) plan, 3) administrador.
//
// SEGURIDAD: el paso 1 entrega un TOKEN DE REGISTRO ligado a esa empresa. Los pasos 2 y 3 lo exigen y nunca aceptan un
// `tenant_id` del cuerpo. El token se firma con una clave derivada de JWT_SECRET, así que las rutas de negocio (que
// verifican con JWT_SECRET) no lo aceptan. El paso 3 solo funciona una vez: mientras la empresa no tenga usuarios.

import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import pool from '../../config/database.js'
import { enTransaccion } from '../../utils/transaccion.js'
import { soloDigitos, esDocumentoValido, formatearDocumento, esCorreoValido } from '../../utils/documentos.js'
import { aprovisionarEmpresa } from './aprovisionar.js'
import { iniciarSuscripcion, ErrorDeSuscripcion } from '../suscripcion/gestion.js'

const VIGENCIA_TOKEN_REGISTRO = '2h'
const LIMITE_POR_OMISION = 3
const CLAVE_MINIMA_ADMIN = 8

/** Error de negocio del alta: `estado` es el código HTTP que corresponde. */
export class ErrorDeRegistro extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje)
    this.name = 'ErrorDeRegistro'
    this.estado = estado
  }
}

const secretoRegistro = () => `${process.env.JWT_SECRET}:registro`

export function firmarTokenRegistro(tenantId) {
  return jwt.sign({ tenant_id: tenantId, fase: 'registro' }, secretoRegistro(), { expiresIn: VIGENCIA_TOKEN_REGISTRO })
}

/** Devuelve el tenant_id del token de registro o lanza un 401 si falta, es falso o venció. */
export function tenantDelTokenRegistro(encabezadoAuthorization) {
  const token = encabezadoAuthorization?.split(' ')[1]
  if (!token) throw new ErrorDeRegistro('Falta la sesión de registro. Empieza de nuevo el alta.', 401)
  try {
    const p = jwt.verify(token, secretoRegistro())
    if (p.fase !== 'registro' || !Number.isInteger(p.tenant_id)) throw new Error('token de otro tipo')
    return p.tenant_id
  } catch {
    throw new ErrorDeRegistro('La sesión de registro no es válida o venció. Empieza de nuevo el alta.', 401)
  }
}

export function slugificar(nombre) {
  return String(nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Mensaje del primer dato inválido, o null si todo está bien. */
export function motivoEmpresaInvalida({ nombre, rnc, correo, telefono, direccion }) {
  if (!String(nombre ?? '').trim()) return 'El nombre de la empresa es requerido'
  if (String(nombre).trim().length < 2) return 'El nombre de la empresa es demasiado corto'
  if (!String(rnc ?? '').trim()) return 'El RNC es requerido'
  if (!esDocumentoValido(rnc)) return 'El RNC debe tener 9 dígitos (o 11 si es una cédula)'
  if (!String(correo ?? '').trim()) return 'El correo es requerido'
  if (!esCorreoValido(correo)) return 'El correo no tiene un formato válido'
  if (!String(telefono ?? '').trim()) return 'El teléfono es requerido'
  if (!String(direccion ?? '').trim()) return 'La dirección es requerida'
  return null
}

// Plan con el que entra la empresa: el de prueba gratuita o, si no hubiera, el más barato
async function planInicial(conn) {
  const [[prueba]] = await conn.query('SELECT id FROM planes WHERE es_plan_prueba = 1 AND activo = 1 ORDER BY orden LIMIT 1')
  if (prueba) return prueba.id
  const [[barato]] = await conn.query('SELECT id FROM planes WHERE activo = 1 ORDER BY precio_mensual, orden LIMIT 1')
  if (!barato) throw new ErrorDeRegistro('No hay planes disponibles. Intenta más tarde.', 503)
  return barato.id
}

/** Paso 1: crea la empresa, la aprovisiona y le inicia la suscripción de prueba. Devuelve el token de registro. */
export async function crearEmpresa(datos, { ip = null } = {}) {
  const motivo = motivoEmpresaInvalida(datos)
  if (motivo) throw new ErrorDeRegistro(motivo)

  const nombre = String(datos.nombre).trim()
  const rnc = soloDigitos(datos.rnc)
  const correo = String(datos.correo).trim().toLowerCase()

  try {
    return await enTransaccion(pool, async (conn) => {
      if (ip) {
        const limite = Number(process.env.LIMITE_REGISTROS_POR_IP) || LIMITE_POR_OMISION
        const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM tenants WHERE ip_registro = ?', [ip])
        if (n >= limite) {
          throw new ErrorDeRegistro('Se alcanzó el límite de empresas registradas desde esta dirección. Contáctanos para continuar.', 429)
        }
      }

      const [porRnc] = await conn.query('SELECT id FROM tenants WHERE rnc = ?', [rnc])
      if (porRnc[0]) throw new ErrorDeRegistro('Este RNC ya está registrado')
      // La colación utf8mb4_unicode_ci ignora mayúsculas y acentos
      const [porNombre] = await conn.query('SELECT id FROM tenants WHERE nombre = ?', [nombre])
      if (porNombre[0]) throw new ErrorDeRegistro('Ya existe una empresa con ese nombre. Usa un nombre distinto.')

      let slug = slugificar(nombre) || 'empresa'
      const [porSlug] = await conn.query('SELECT id FROM tenants WHERE slug = ?', [slug])
      if (porSlug[0]) slug = `${slug}-${Date.now().toString(36)}`

      const planId = await planInicial(conn)
      const [t] = await conn.query(
        `INSERT INTO tenants (nombre, slug, rnc, email, telefono, direccion, plan_id, estado, ip_registro)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)`,
        [nombre, slug, rnc, correo, String(datos.telefono).trim(), String(datos.direccion).trim(), planId, ip])
      const tenantId = t.insertId

      await aprovisionarEmpresa(conn, {
        id: tenantId, nombre, rnc: formatearDocumento(rnc), email: correo,
        telefono: String(datos.telefono).trim(), direccion: String(datos.direccion).trim(),
      })
      await iniciarSuscripcion(conn, tenantId, planId, { actor: 'sistema' })

      return { token_registro: firmarTokenRegistro(tenantId), empresa: { nombre, slug } }
    })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new ErrorDeRegistro('Ya existe una empresa con esos datos (RNC o nombre)')
    if (err instanceof ErrorDeSuscripcion) throw new ErrorDeRegistro(err.message, err.estado)
    throw err
  }
}
