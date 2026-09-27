import bcrypt from 'bcryptjs'
import pool from '../../config/database.js'
import { aprovisionarEmpresa } from '../../services/tenants/aprovisionar.js'

// Usuarios de la empresa 1 (la empresa migrada de la v1)
export const USUARIOS = {
  admin:      { nombre: 'Administrador', email: 'admin@facilfactura.com',      password: 'Admin2025!',   rol_id: 1 },
  facturador: { nombre: 'Facturador',    email: 'facturador@facilfactura.com', password: 'Factura2025!', rol_id: 2 },
  visor:      { nombre: 'Visor',         email: 'visor@facilfactura.com',      password: 'Visor2025!',   rol_id: 3 },
}

const ROLES = { admin: 1, facturador: 2, visor: 3 }

const TIPOS_NCF = [
  ['B01', 'Crédito Fiscal'], ['B02', 'Consumidor Final'], ['B11', 'Proveedores Informales'],
  ['B14', 'Regímenes Especiales'], ['B15', 'Gubernamental'], ['B16', 'Exportaciones'],
]

async function sembrarSecuencias(conn, tenantId) {
  for (const [tipo, descripcion] of TIPOS_NCF) {
    await conn.query(
      `INSERT INTO nfc_secuencias (tenant_id, tipo_ncf, descripcion, desde, hasta, ultimo_usado, alerta_desde, fecha_vencimiento, activo)
       VALUES (?, ?, ?, 1, 500, 0, 400, '2030-12-31', 1)`, [tenantId, tipo, descripcion])
  }
}

/**
 * Deja la base de pruebas en un estado conocido: solo la empresa 1, sin datos de negocio, con sus tres usuarios,
 * las seis secuencias NCF (1-500) y la configuración fiscal por defecto. Conserva los datos de referencia de las
 * migraciones (planes, roles y los catálogos de la empresa 1).
 */
export async function reiniciarDatos() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const t of ['factura_items', 'facturas', 'articulo_precios', 'articulos', 'categorias', 'clientes',
                   'metodos_pago', 'nfc_secuencias', 'usuarios', 'empresas', 'certificados_digitales', 'ecf_emitidos']) {
    await pool.query(`TRUNCATE TABLE \`${t}\``)
  }
  // Empresas creadas por otras pruebas: fuera, con sus catálogos y su configuración
  for (const t of ['subscription_history', 'subscription_payments', 'tenant_subscriptions']) {
    await pool.query(`DELETE FROM \`${t}\` WHERE tenant_id <> 1`)
  }
  await pool.query('DELETE FROM ecf_configuracion WHERE tenant_id <> 1')
  await pool.query('DELETE FROM unidades_medida WHERE tenant_id <> 1')
  await pool.query('DELETE FROM tipos_servicio WHERE tenant_id <> 1')
  await pool.query('DELETE FROM configuracion WHERE tenant_id <> 1')
  await pool.query('DELETE FROM tenants WHERE id <> 1')
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')

  await pool.query('INSERT IGNORE INTO configuracion (tenant_id) VALUES (1)')
  await pool.query(
    `UPDATE configuracion SET empresa_id = NULL, factura_ultimo_numero = 0, factura_prefijo = 'F', moneda = 'DOP',
       itbis_porcentaje = 18, ret_itbis_porcentaje = 100, ret_isr_porcentaje = 10, nfc_alerta_porcentaje = 80
     WHERE tenant_id = 1`
  )

  for (const u of Object.values(USUARIOS)) {
    const hash = await bcrypt.hash(u.password, 4)   // coste bajo: solo para pruebas
    await pool.query('INSERT INTO usuarios (tenant_id, nombre, email, password_hash, rol_id) VALUES (1, ?, ?, ?, ?)',
      [u.nombre, u.email, hash, u.rol_id])
  }
  await sembrarSecuencias(pool, 1)
}

/**
 * Crea una empresa completa (tenant, empresa emisora, configuración, catálogos, tres usuarios y secuencias NCF)
 * para las pruebas de aislamiento. Devuelve los datos para iniciar sesión como cada rol.
 */
export async function crearEmpresa(nombre, { plan = 'negocio', estado = 'activo' } = {}) {
  const slug = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const rnc = String(100000000 + Math.floor(Math.random() * 800000000))
  const password = 'Clave2026!'
  const hash = await bcrypt.hash(password, 4)

  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [[p]] = await conn.query('SELECT id FROM planes WHERE slug = ?', [plan])
    const [t] = await conn.query(
      'INSERT INTO tenants (nombre, slug, rnc, plan_id, estado) VALUES (?, ?, ?, ?, ?)', [nombre, slug, rnc, p.id, estado])
    const tenantId = t.insertId
    const { empresaId } = await aprovisionarEmpresa(conn, { id: tenantId, nombre, rnc })

    const usuarios = {}
    for (const [rol, rolId] of Object.entries(ROLES)) {
      const email = `${rol}@${slug}.test`
      await conn.query('INSERT INTO usuarios (tenant_id, nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?, ?)',
        [tenantId, `${rol} ${nombre}`, email, hash, rolId])
      usuarios[rol] = { email, password }
    }
    await sembrarSecuencias(conn, tenantId)
    await conn.commit()
    return { tenantId, empresaId, nombre, slug, rnc, usuarios }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
