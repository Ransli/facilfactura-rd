import bcrypt from 'bcryptjs'
import pool from '../../config/database.js'

export const USUARIOS = {
  admin:      { nombre: 'Administrador', email: 'admin@facilfactura.com',      password: 'Admin2025!',   rol_id: 1 },
  facturador: { nombre: 'Facturador',    email: 'facturador@facilfactura.com', password: 'Factura2025!', rol_id: 2 },
  visor:      { nombre: 'Visor',         email: 'visor@facilfactura.com',      password: 'Visor2025!',   rol_id: 3 },
}

const TIPOS_NCF = [
  ['B01', 'Crédito Fiscal'], ['B02', 'Consumidor Final'], ['B11', 'Proveedores Informales'],
  ['B14', 'Regímenes Especiales'], ['B15', 'Gubernamental'], ['B16', 'Exportaciones'],
]

/**
 * Deja la base de pruebas en un estado conocido: sin datos de negocio, con los tres usuarios,
 * las seis secuencias NCF (1-500) y la configuración fiscal por defecto. Conserva los datos de
 * referencia de las migraciones (roles, tipos de servicio y unidades de medida).
 */
export async function reiniciarDatos() {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const t of ['factura_items', 'facturas', 'articulo_precios', 'articulos', 'categorias', 'clientes',
                   'metodos_pago', 'nfc_secuencias', 'usuarios', 'empresas']) {
    await pool.query(`TRUNCATE TABLE \`${t}\``)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')

  await pool.query(
    `UPDATE configuracion SET empresa_id = NULL, factura_ultimo_numero = 0, factura_prefijo = 'F', moneda = 'DOP',
       itbis_porcentaje = 18, ret_itbis_porcentaje = 100, ret_isr_porcentaje = 10, nfc_alerta_porcentaje = 80`
  )

  for (const u of Object.values(USUARIOS)) {
    const hash = await bcrypt.hash(u.password, 4)   // coste bajo: solo para pruebas
    await pool.query('INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES (?, ?, ?, ?)',
      [u.nombre, u.email, hash, u.rol_id])
  }

  for (const [tipo, descripcion] of TIPOS_NCF) {
    await pool.query(
      `INSERT INTO nfc_secuencias (tipo_ncf, descripcion, desde, hasta, ultimo_usado, alerta_desde, fecha_vencimiento, activo)
       VALUES (?, ?, 1, 500, 0, 400, '2030-12-31', 1)`, [tipo, descripcion])
  }
}
