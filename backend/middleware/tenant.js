// Aislamiento por empresa (tenant). Va SIEMPRE después de verificarToken en las rutas de negocio.
//
//   router.use(verificarToken, agregarTenantId)
//
// Contrato:
//  - Fija `req.tenant_id` (entero) tomándolo ÚNICAMENTE del token. Nunca de la URL, el cuerpo ni los parámetros.
//  - Si la petición trae un tenant_id distinto del suyo (query o body), responde 403: es un intento de acceder a otra empresa.
//  - Un token sin tenant_id (p. ej. el de la consola master) no puede usar rutas de empresa: 403.
//
// Nota: como este middleware corre a nivel del router, `req.params` aún no tiene los parámetros de la ruta; los ids de
// recursos de otra empresa se resuelven filtrando cada consulta por `tenant_id` (responden 404).

export function agregarTenantId(req, res, next) {
  const tenantId = Number(req.usuario?.tenant_id)
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(403).json({ ok: false, mensaje: 'Esta acción es solo para usuarios de una empresa' })
  }

  const pedido = req.query?.tenant_id ?? req.body?.tenant_id
  if (pedido !== undefined && pedido !== '' && Number(pedido) !== tenantId) {
    console.warn(`[seguridad] El usuario ${req.usuario.id} (empresa ${tenantId}) pidió datos de la empresa ${pedido}`)
    return res.status(403).json({ ok: false, mensaje: 'No tienes permiso para acceder a datos de otra empresa' })
  }

  req.tenant_id = tenantId
  next()
}
