// Debe importarse ANTES que la app o cualquier módulo que abra la base de datos.
// Fija la base de pruebas sin importar lo que diga el .env, para que ninguna prueba
// pueda tocar facilfactura_saas ni la v1 (facilfactura_db).
export const BD_PRUEBAS = 'facilfactura_test'

process.env.DB_NAME = BD_PRUEBAS
process.env.JWT_SECRET = 'secreto-solo-para-pruebas'
process.env.JWT_EXPIRES_IN = '1h'
process.env.NODE_ENV = 'test'
// Clave de cifrado de certificados solo para pruebas (32 bytes en hexadecimal)
process.env.CLAVE_CIFRADO_CERTIFICADOS = 'a1'.repeat(32)
// Las pruebas registran muchas empresas desde la misma IP: el tope real se prueba subiéndolo o bajándolo en esa prueba
process.env.LIMITE_REGISTROS_POR_IP = '1000'
