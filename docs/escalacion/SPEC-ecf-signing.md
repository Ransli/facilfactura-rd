# Spec: `ecf-signing` (certificado digital y firma XMLDSig)

> Módulo 6 del [mapa de capacidades](CAPABILITY-MAP.md). Fase 4 de la propuesta de la Unidad II (secciones III.2 y VI.2).
> Depende de `tenancy`. Fuente normativa: *Formato Comprobante Fiscal Electrónico (e-CF) v1.0* (DGII, octubre 2025) y
> el resumen de la Unidad II. Estado: **implementado y probado** (E1-E2, 2026-09-27; trabajo local, se sube junto con Ransli). Suite completa en verde.

## Objective

Que cada empresa guarde de forma **segura** su certificado digital tributario y que el sistema pueda **firmar** con él el XML
de un e-CF (firma XMLDSig *enveloped*, RSA-SHA256, SHA-256), **verificar** la firma y extraer el **código de seguridad**
(los 6 primeros caracteres del `SignatureValue`).

Éxito = el certificado nunca sale del servidor en claro; un XML firmado se verifica y cualquier alteración lo invalida;
una empresa jamás usa el certificado de otra.

## Assumptions (decisiones tomadas)

- El certificado llega como **archivo `.p12/.pfx` en base64 + su contraseña** (formato de INDOTEL). Se guarda **cifrado**
  con AES-256-GCM; la clave sale de la variable de entorno `CLAVE_CIFRADO_CERTIFICADOS` (32 bytes en hexadecimal).
  Sin esa variable el módulo se niega a guardar o usar certificados.
- **Un certificado activo por empresa.** Subir uno nuevo reemplaza al anterior.
- Se acepta solo un certificado **vigente**, con **llave privada** y **RSA de 2048 bits o más**.
- Firma según el formato de la DGII: enveloped, canonicalización C14N 1.0, `rsa-sha256`, digest `sha256`, `Reference URI=""`,
  con el certificado en `KeyInfo`.
- **Dependencias nuevas:** `xml-crypto` (firma; la nombra la propuesta), `node-forge` (lectura de PKCS#12).
- La validación contra los **XSD oficiales** no se hace aquí (no hay librería XSD sin binarios nativos); queda para la
  certificación en TesteCF.

## Tech Stack

Node 22, `xml-crypto` 6, `node-forge` 1, `crypto` de Node (AES-GCM).

## Commands

```
Pruebas:  npm test --prefix backend
Esquema:  npm run db:dump-schema --prefix backend
```

## Project Structure

```
database/migrations/…_create_certificados_digitales.js
backend/services/ecf/cifrado.js          → cifrar / descifrar (AES-256-GCM)
backend/services/ecf/certificados.js     → leer y validar un .p12, guardar, obtener el vigente
backend/services/ecf/firma.js            → firmarXml, verificarFirma, codigoSeguridad
backend/routes/ecf-certificado.js        → PUT/GET/DELETE /api/ecf/certificado
backend/tests/ecf/*.test.js
backend/tests/helpers/certificados.js    → genera certificados de prueba (autofirmados, con PKCS#12)
```

## Contract

1. `PUT /api/ecf/certificado` (admin) `{ p12_base64, password }` → 200 con metadatos. Errores 400 con motivo: contraseña
   incorrecta, sin llave privada, vencido, llave menor a 2048 bits, archivo inválido.
2. `GET /api/ecf/certificado` (cualquier rol) → `{ configurado, titular, emisor, serie, valido_desde, valido_hasta,
   dias_para_vencer, estado: 'vigente'|'por_vencer'|'vencido' }`; **nunca** el archivo ni la contraseña.
3. `DELETE /api/ecf/certificado` (admin) elimina el certificado.
4. `firmarXml(xml, { clavePem, certificadoPem })` devuelve el XML con `<ds:Signature>`; `verificarFirma(xml)` devuelve
   `{ valida, motivo }`; `codigoSeguridad(xmlFirmado)` devuelve los 6 primeros caracteres del `SignatureValue`.
5. `obtenerCredenciales(db, tenantId)` devuelve la llave y el certificado en PEM (uso interno de los servicios; no hay ruta que los exponga).
6. Todo se aísla por empresa (`tenancy`) y respeta la suscripción (bloqueada = sin escrituras).

## Code Style

Igual que el repo. Los servicios reciben la conexión o el pool y devuelven objetos simples; los errores de negocio son
`ErrorDeCertificado` con un mensaje claro.

## Testing Strategy

- **Unitarias:** cifrado (ida y vuelta, alteración detectada, clave equivocada); lectura de `.p12` (válido, contraseña mala,
  vencido, sin llave, llave débil); firma (verifica, alterar cualquier byte la invalida, C14N estable, código de seguridad
  de 6 caracteres determinista).
- **Integración:** subir, consultar y borrar; solo el administrador escribe; la respuesta no filtra secretos; en la base no
  aparece la contraseña ni el archivo en claro; aislamiento entre dos empresas; empresa bloqueada no escribe.

## Boundaries

- **Always:** cifrar antes de guardar; nunca registrar la contraseña ni la llave en logs; verificar vigencia.
- **Ask first:** cambiar el algoritmo de firma o de cifrado; guardar certificados fuera de la base de datos.
- **Never:** devolver el archivo, la contraseña o la llave por la API; commitear certificados o claves reales; aceptar certificados vencidos.

## Success Criteria

1. Un `.p12` válido se guarda cifrado y se puede volver a leer para firmar; los inválidos se rechazan con un motivo claro.
2. Un XML firmado se verifica; cambiar un solo carácter del contenido lo invalida.
3. El código de seguridad tiene 6 caracteres y sale del `SignatureValue`.
4. La API nunca devuelve secretos y la base de datos no contiene datos en claro.
5. Aislamiento entre empresas y permisos por rol comprobados. Suite en verde.

## Open Questions

- Ninguna.
