/**
 * Ejecuta `fn(conn)` dentro de una transacción: si termina, confirma; si lanza un error, revierte todo y lo relanza.
 * La conexión se devuelve siempre al pool.
 */
export async function enTransaccion(pool, fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const resultado = await fn(conn)
    await conn.commit()
    return resultado
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}
