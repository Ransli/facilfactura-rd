# Spec: `ecf-connector` (emisión de e-CF 31, 32 y 34 y conexión con la DGII)

> Módulo 7 del [mapa de capacidades](CAPABILITY-MAP.md). Fase 5 de la propuesta de la Unidad II (secciones III y VI).
> Depende de `ecf-signing` y `subscription`. Fuente normativa: *Formato Comprobante Fiscal Electrónico (e-CF) v1.0*
> (DGII, octubre 2025), del que salen las etiquetas, los códigos y la obligatoriedad usados aquí.
> Estado: aprobado por Ransli el 2026-09-27 (trabajo local, se sube el día siguiente).

## Objective

Que una empresa pueda **emitir comprobantes fiscales electrónicos** desde FácilFactura: una factura con `tipo_ncf` `E31`
(crédito fiscal) o `E32` (consumo) genera un **e-NCF** de su secuencia, un **XML** conforme al formato de la DGII, firmado con
el certificado de la empresa, que se **transmite a la DGII**, se **consulta hasta conocer su estado** y se imprime con su
**código QR y su código de seguridad**. Una **nota de crédito electrónica (34)** anula total o parcialmente un e-CF emitido.

Éxito = la empresa factura como hoy, con un tipo de comprobante más; el sistema se ocupa de firmar, enviar y reintentar, y
muestra el estado y el motivo de cualquier rechazo.

## Assumptions (decisiones tomadas)

- **Los e-NCF reutilizan `nfc_secuencias`:** `E31` + 10 dígitos ya es el formato del e-NCF, y así se aprovechan la pantalla de NCF, el bloqueo
  y la alerta de agotamiento. No hay tabla `secuencias_ecf`. La fecha de vencimiento de la secuencia es obligatoria en E31.
- **Nota de crédito (34) de anulación total:** el código de modificación es 1 (anula el e-NCF referenciado) y repite los montos del
  original; la corrección parcial queda como mejora.
- **Sin descuentos ni recargos por ítem:** la v1 no los maneja, así que el XML no los emite.
- **E32 sin retenciones:** el formato no las admite en consumo, por lo que una factura E32 se emite sin retención de ITBIS ni de ISR.
- **Certificación y ambiente:** la certificación real ante la DGII es un trámite externo. El conector se construye contra el
  **ambiente configurable** (`TesteCF`, `CerteCF`, `eCF`) y contra un **simulador local de la DGII** con el que se prueba y
  se desarrolla. Las URL de los servicios siguen el patrón publicado por la DGII y se pueden cambiar por variable de entorno
  (`DGII_URL_BASE`); deben **verificarse contra la *Descripción Técnica de Servicios* vigente antes de certificar**.
- **Formato:** fechas `dd-MM-AAAA`, importes con 2 decimales y punto decimal, e-NCF `E` + tipo + 10 dígitos
  (`E310000000001`). El XML sigue el orden y las etiquetas del formato oficial (Encabezado → DetallesItems →
  InformacionReferencia → FechaHoraFirma → Signature).
- **Tasas de ITBIS admitidas:** 18 % (indicador 1), 16 % (2) y 0 % (3). Cualquier otra tasa no se puede emitir como e-CF.
- **Retenciones:** `TotalITBISRetenido` y `TotalISRRetencion` se informan solo en 31 y 34, y `MontoTotal` no las descuenta
  (así lo define el formato). El total a pagar del sistema sigue siendo el de la factura.
- **e-CF 32 (consumo):** el RNC del comprador es obligatorio si el total es ≥ RD$ 250,000; menor, opcional. (No se genera el
  Resumen de Factura de Consumo RFCE; queda como mejora.)
- **Envío asíncrono:** la factura se emite (y su e-CF queda firmado y guardado) en una sola transacción; el envío a la DGII lo
  hace una **cola** con reintentos y retroceso exponencial. Sin conexión con la DGII la factura no se pierde.
- **Límite del plan:** cada e-CF emitido cuenta contra `max_ecf_mes` del plan (`-1` = ilimitado).
- **Dependencias nuevas:** `qrcode` (código QR). La firma usa `xml-crypto` (`ecf-signing`).
- No incluye: contingencia, recepción/aprobación comercial de e-CF de terceros, anulación de rangos ni tipos distintos de
  31, 32 y 34 (los cubre el módulo `ecf-receiver` y trabajo posterior).

## Tech Stack

Node 22, `xml-crypto`, `qrcode`, `fetch` de Node (cliente HTTP) y `FormData`/`Blob` de Node (envío del XML).

## Commands

```
Pruebas:            npm test --prefix backend
Simulador DGII:     npm run dgii:simulador --prefix backend     (puerto 3900)
Procesar la cola:   la ejecuta el servidor cada 30 s (ECF_TRABAJADOR=1) o procesarCola() en pruebas
```

## Project Structure

```
database/migrations/…_create_ecf_tables.js         → ecf_emitidos, ecf_configuracion (los e-NCF usan `nfc_secuencias`)
backend/services/ecf/xml.js                        → construcción del XML (31, 32 y 34) desde una factura
backend/services/ecf/secuencias.js                 → validación de las secuencias E31/E32/E34 (se guardan en `nfc_secuencias`)
backend/services/ecf/emision.js                    → emitirEcf (dentro de la transacción de la factura), notaDeCredito
backend/services/ecf/clienteDgii.js                → semilla, token, recepción, consulta de estado
backend/services/ecf/simuladorDgii.js              → simulador de los servicios de la DGII
backend/services/ecf/cola.js                       → procesarCola con reintentos y retroceso exponencial
backend/services/ecf/representacion.js             → representación impresa (HTML con QR y código de seguridad)
backend/routes/ecf.js                              → configuración, secuencias, listado, reintento, RI y nota de crédito
backend/routes/facturas.js                         → acepta tipo_ncf E31/E32
frontend/src/vistas/ECF.jsx                        → certificado, secuencias y estado de los e-CF
backend/tests/ecf/*.test.js
```

## Contract

1. `POST /api/facturas` con `tipo_ncf: 'E31' | 'E32'`: exige certificado vigente y secuencia e-NCF activa del tipo; asigna el
   e-NCF (`nfc_numero = E31…`), guarda el e-CF firmado en `ecf_emitidos` (estado `generado`) y responde 201 con `ecf`.
   Si falta certificado, secuencia o hay límite alcanzado: 400/403 **sin consumir** número de factura ni e-NCF.
2. Estados de un e-CF: `generado` → `enviado` → `en_proceso` → `aceptado` | `aceptado_condicional` | `rechazado`; y `error`
   cuando se agotan los reintentos. Cada cambio guarda el mensaje de la DGII.
3. La cola reintenta con espera de 1, 2, 4, 8, 16, 32 y 60 minutos (máximo 8 intentos) y **nunca reenvía** un e-CF ya aceptado.
4. `GET /api/ecf` lista los e-CF de la empresa (filtro por estado); `POST /api/ecf/:id/reintentar` fuerza un reintento (admin).
5. `GET /api/ecf/:id/representacion` devuelve la representación impresa en HTML: e-NCF, leyenda de comprobante fiscal
   electrónico, código QR abajo a la izquierda y código de seguridad en letras.
6. `POST /api/ecf/:id/nota-credito` (admin) emite un e-CF 34 que referencia al original (`InformacionReferencia`) y marca la
   factura como anulada; solo sobre e-CF aceptados (o `aceptado_condicional`) y una sola vez.
7. Todo aislado por empresa y sujeto a la suscripción (bloqueada = no emite).

## Code Style

Igual que el repo. El XML se arma con funciones pequeñas por sección y escapado de caracteres especiales:

```js
const etiqueta = (nombre, valor) => (valor === undefined || valor === null || valor === '' ? '' : `<${nombre}>${escapar(valor)}</${nombre}>`)
```

## Testing Strategy

- **Unitarias del XML:** por tipo (31, 32, 34): etiquetas y orden, campos obligatorios y condicionales, fechas `dd-MM-AAAA`,
  redondeo, cálculo de gravado/ITBIS/exento por tasa, ítems con descuentos, escapado de `&`, `<` y acentos, y los rechazos
  (tasa no admitida, 32 ≥ 250,000 sin RNC, comprador sin razón social en 31).
- **Integración con el simulador de la DGII:** emisión completa hasta `aceptado`; rechazo con el motivo visible; reintentos con
  retroceso; caída del simulador (no se pierde la factura y se recupera al volver); cola sin duplicar envíos; nota de crédito;
  representación impresa con QR y código de seguridad; límite mensual; aislamiento entre empresas; permisos por rol.
- **Concurrencia:** varias emisiones a la vez dan e-NCF distintos y consecutivos.

## Boundaries

- **Always:** firmar antes de guardar; guardar el XML firmado tal como se envió; consumir la secuencia dentro de la transacción.
- **Ask first:** cambiar las URL o el ambiente por omisión; cambiar el orden de las etiquetas del XML.
- **Never:** reenviar un e-CF aceptado; emitir sin certificado vigente; reutilizar un e-NCF; enviar a producción desde las pruebas.

## Success Criteria

1. Una factura `E31` y una `E32` se emiten, se firman, se envían al simulador y llegan a `aceptado`; la RI muestra QR y código.
2. Un e-CF rechazado muestra el motivo y se puede corregir y volver a emitir.
3. Con la DGII caída la factura queda emitida y el envío se completa al recuperarse; nunca se envía dos veces.
4. La nota de crédito genera un e-CF 34 válido y deja la factura anulada.
5. Sin certificado, sin secuencia o sin cupo, no se consume ningún número.
6. Aislamiento y permisos comprobados; suite en verde.

## Open Questions

- **Certificación real:** pendiente del trámite con la DGII (certificado de INDOTEL y set de 25 comprobantes). El código está
  listo para apuntar a TesteCF cambiando el ambiente y la URL.
- **XSD oficial:** validar los XML generados contra los esquemas de la DGII antes de la certificación.
