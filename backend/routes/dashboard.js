import { Router } from 'express'
import pool from '../config/database.js'
import { verificarToken } from '../middleware/auth.js'

const router = Router()
router.use(verificarToken)

// Las facturas anuladas no suman al facturado: solo las emitidas cuentan como ingreso.
const EMITIDA = `estado = 'emitida'`

// GET /api/dashboard
router.get('/', async (req, res) => {
  try {
    const [porEstado] = await pool.query(`
      SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS monto
      FROM facturas
      GROUP BY estado`)

    const [[mesActual]] = await pool.query(`
      SELECT
        COUNT(*)                                     AS cantidad,
        COALESCE(SUM(total), 0)                      AS total,
        COALESCE(SUM(itbis), 0)                      AS itbis,
        COALESCE(SUM(ret_itbis + ret_isr), 0)        AS retenciones
      FROM facturas
      WHERE ${EMITIDA}
        AND YEAR(fecha)  = YEAR(CURDATE())
        AND MONTH(fecha) = MONTH(CURDATE())`)

    const [[mesAnterior]] = await pool.query(`
      SELECT
        COUNT(*)                AS cantidad,
        COALESCE(SUM(total), 0) AS total
      FROM facturas
      WHERE ${EMITIDA}
        AND fecha >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
        AND fecha <  DATE_FORMAT(CURDATE(), '%Y-%m-01')`)

    // Serie de los últimos 6 meses para el gráfico de barras.
    const [serie] = await pool.query(`
      SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes,
             COUNT(*)                    AS cantidad,
             COALESCE(SUM(total), 0)     AS total
      FROM facturas
      WHERE ${EMITIDA}
        AND fecha >= DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01')
      GROUP BY mes
      ORDER BY mes`)

    // Una secuencia alerta cuando ya se consumió hasta el número configurado,
    // o cuando su comprobante venció según la DGII.
    const [ncf] = await pool.query(`
      SELECT id, tipo_ncf, descripcion, desde, hasta, ultimo_usado,
             alerta_desde, fecha_vencimiento,
             GREATEST(hasta - GREATEST(ultimo_usado, desde - 1), 0) AS disponibles,
             (ultimo_usado >= alerta_desde)                         AS por_agotarse,
             (fecha_vencimiento IS NOT NULL
               AND fecha_vencimiento < CURDATE())                   AS vencida
      FROM nfc_secuencias
      WHERE activo = 1
      ORDER BY por_agotarse DESC, vencida DESC, disponibles ASC`)

    const [topClientes] = await pool.query(`
      SELECT c.id, c.nombre, c.rnc,
             COUNT(f.id)                AS facturas,
             COALESCE(SUM(f.total), 0)  AS total
      FROM clientes c
      JOIN facturas f ON f.cliente_id = c.id AND f.${EMITIDA}
      GROUP BY c.id, c.nombre, c.rnc
      ORDER BY total DESC
      LIMIT 5`)

    const [recientes] = await pool.query(`
      SELECT f.id, f.numero, f.nfc_numero, f.fecha, f.total, f.estado,
             c.nombre AS cliente_nombre
      FROM facturas f
      JOIN clientes c ON c.id = f.cliente_id
      ORDER BY f.created_at DESC
      LIMIT 6`)

    const [[catalogo]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM clientes  WHERE activo = 1) AS clientes,
        (SELECT COUNT(*) FROM articulos WHERE activo = 1) AS articulos`)

    res.json({
      ok: true,
      porEstado,
      mesActual,
      mesAnterior,
      serie,
      ncf,
      topClientes,
      recientes,
      catalogo,
    })
  } catch (err) {
    console.error('Error en dashboard:', err.message)
    res.status(500).json({ ok: false, mensaje: 'No se pudo cargar el resumen' })
  }
})

export default router
