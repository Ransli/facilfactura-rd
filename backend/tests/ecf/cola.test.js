import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { iniciar } from '../helpers/contexto.js'
import { prepararEmpresaEcf } from '../helpers/ecf.js'
import { iniciarSimulador } from '../../services/ecf/simuladorDgii.js'
import { procesarCola, programarReintento, ESPERAS_MINUTOS, MAX_INTENTOS } from '../../services/ecf/cola.js'

let t, sim, A, B
before(async () => {
  t = await iniciar()
  sim = await iniciarSimulador()
  A = await prepararEmpresaEcf(t, 'Empresa Alfa')
  B = await prepararEmpresaEcf(t, 'Empresa Beta')
})
after(async () => { await sim.cerrar(); await t.cerrar() })
beforeEach(async () => {
  sim.reiniciar()
  await t.pool.query('DELETE FROM ecf_emitidos')          // cada prueba parte con la cola vacía
  await t.pool.query('DELETE FROM ecf_configuracion')
})

// «Ahora» a n minutos de un instante futuro fijo (segundos exactos: la base de datos no guarda milisegundos)
const base = Math.floor(Date.now() / 1000) * 1000 + 10_000
const en = (minutos) => new Date(base + minutos * 60_000)
const pasar = (minutos = 0, extra = {}) => procesarCola(t.pool, { ahora: en(minutos), baseUrl: sim.url, ...extra })
const fila = async (facturaId) => (await t.pool.query('SELECT * FROM ecf_emitidos WHERE factura_id = ?', [facturaId]))[0][0]
const emitir = async (empresa = A, tipo = 'E31', extra = {}) => {
  const r = await empresa.emitir(tipo, tipo === 'E32' ? { cliente: 'consumidor', ...extra } : extra)
  assert.equal(r.status, 201, r.data?.mensaje)
  return r.data.data.id
}
const minutosHasta = (fecha, minutos) => Math.round((fecha.getTime() - en(minutos).getTime()) / 1000)   // segundos de diferencia

// ── Camino feliz ──────────────────────────────────────────────

test('un e-CF generado se envía y se consulta en la misma pasada hasta quedar aceptado', async () => {
  const id = await emitir()
  const antes = await fila(id)
  const r = await pasar()
  assert.equal(r.procesados, 1)
  assert.equal(r.aceptados, 1)
  const despues = await fila(id)
  assert.equal(despues.estado, 'aceptado')
  assert.ok(despues.track_id)
  assert.equal(despues.intentos, 0)
  assert.equal(despues.proximo_intento, null)
  assert.equal(sim.recibidos.length, 1)
  assert.equal(sim.recibidos[0].xml, antes.xml_firmado, 'se envía el XML firmado tal como se guardó')
  assert.equal(sim.recibidos[0].archivo, `${A.rnc}${antes.encf}.xml`)
})

test('un e-CF aceptado nunca se vuelve a enviar, por muchas pasadas que haya', async () => {
  await emitir()
  for (let i = 0; i < 4; i++) await pasar(i)
  assert.equal(sim.recibidos.length, 1)
})

test('un e-CF aceptado condicional guarda las observaciones de la DGII', async () => {
  sim.config.resultado = 'aceptado_condicional'
  sim.config.motivo = 'Dirección del comprador incompleta'
  const id = await emitir()
  await pasar()
  const f = await fila(id)
  assert.equal(f.estado, 'aceptado_condicional')
  assert.equal(f.mensaje_dgii, 'Dirección del comprador incompleta')
})

test('un e-CF rechazado guarda el motivo, no se reenvía y no se reintenta', async () => {
  sim.config.resultado = 'rechazado'
  sim.config.motivo = 'El RNC del comprador no existe'
  const id = await emitir()
  const r = await pasar()
  assert.equal(r.rechazados, 1)
  const f = await fila(id)
  assert.equal(f.estado, 'rechazado')
  assert.equal(f.mensaje_dgii, 'El RNC del comprador no existe')
  await pasar(5)
  await pasar(120)
  assert.equal(sim.recibidos.length, 1)
})

test('un rechazo inmediato (firma inválida) queda como rechazado con su motivo, sin reintentos', async () => {
  const id = await emitir()
  await t.pool.query("UPDATE ecf_emitidos SET xml_firmado = REPLACE(xml_firmado, '<MontoTotal>1180.00', '<MontoTotal>1.00') WHERE factura_id = ?", [id])
  await pasar()
  const f = await fila(id)
  assert.equal(f.estado, 'rechazado')
  assert.match(f.mensaje_dgii, /firma/i)
  assert.equal(f.proximo_intento, null)
})

// ── En proceso ────────────────────────────────────────────────

test('mientras la DGII lo procesa se consulta cada minuto y nunca se reenvía', async () => {
  sim.config.consultasEnProceso = 2
  const id = await emitir()
  // el envío y la primera consulta ocurren en la misma pasada (1.ª consulta: en proceso)
  await pasar(0)
  let f = await fila(id)
  assert.equal(f.estado, 'en_proceso')
  assert.equal(minutosHasta(f.proximo_intento, 1), 0, 'la siguiente consulta es en 1 minuto')

  await pasar(0.5)                                   // todavía no le toca
  assert.equal(sim.recibidos.length, 1)
  assert.equal((await fila(id)).estado, 'en_proceso')

  await pasar(1)                                     // 2.ª consulta: en proceso
  assert.equal((await fila(id)).estado, 'en_proceso')
  await pasar(2)                                     // 3.ª consulta: resultado final
  f = await fila(id)
  assert.equal(f.estado, 'aceptado')
  assert.equal(sim.recibidos.length, 1)
})

// ── Reintentos con retroceso exponencial ──────────────────────

test('las esperas entre reintentos son 1, 2, 4, 8, 16, 32 y 60 minutos, con un máximo de 8 intentos', () => {
  assert.deepEqual(ESPERAS_MINUTOS, [1, 2, 4, 8, 16, 32, 60])
  assert.equal(MAX_INTENTOS, 8)
})

test('con la DGII caída la factura no se pierde: queda generada y se reintenta con espera creciente', async () => {
  sim.config.caido = true
  const id = await emitir()
  let minuto = 0
  for (let intento = 1; intento <= 7; intento++) {
    await pasar(minuto)
    const f = await fila(id)
    assert.equal(f.estado, 'generado', `intento ${intento}`)
    assert.equal(f.intentos, intento)
    assert.match(f.mensaje_dgii, /503|no disponible/i)
    const espera = ESPERAS_MINUTOS[intento - 1]
    assert.equal(minutosHasta(f.proximo_intento, minuto + espera), 0, `tras el intento ${intento} espera ${espera} min`)
    minuto += espera
  }
  const [[fac]] = await t.pool.query('SELECT estado FROM facturas WHERE id = ?', [id])
  assert.equal(fac.estado, 'emitida', 'la factura sigue emitida')
})

test('un reintento antes de su hora no hace nada', async () => {
  sim.config.caido = true
  const id = await emitir()
  await pasar(0)
  const antes = await fila(id)
  const r = await pasar(0.5)
  assert.equal(r.procesados, 0)
  assert.equal((await fila(id)).intentos, antes.intentos)
})

test('al agotar los 8 intentos queda en error y la cola deja de tocarlo', async () => {
  sim.config.caido = true
  const id = await emitir()
  let minuto = 0
  for (let i = 0; i < MAX_INTENTOS; i++) {
    await pasar(minuto)
    minuto += 100_000                                  // siempre le toca
  }
  const f = await fila(id)
  assert.equal(f.estado, 'error')
  assert.equal(f.intentos, MAX_INTENTOS)
  assert.equal(f.proximo_intento, null)
  assert.match(f.mensaje_dgii, /8 intentos/)
  const r = await pasar(minuto + 100_000)
  assert.equal(r.procesados, 0)
})

test('al recuperarse la DGII el envío se completa y los intentos vuelven a cero', async () => {
  sim.config.caido = true
  const id = await emitir()
  await pasar(0)
  await pasar(1)
  assert.equal((await fila(id)).intentos, 2)
  sim.config.caido = false
  await pasar(3)
  const f = await fila(id)
  assert.equal(f.estado, 'aceptado')
  assert.equal(f.intentos, 0)
  assert.equal(sim.recibidos.length, 1)
})

test('un e-CF en error se puede reintentar a mano y se envía; uno rechazado no', async () => {
  sim.config.caido = true
  const id = await emitir()
  for (let i = 0; i < MAX_INTENTOS; i++) await pasar(i * 100_000)
  assert.equal((await fila(id)).estado, 'error')

  sim.config.caido = false
  const ecfId = (await fila(id)).id
  assert.equal(await programarReintento(t.pool, A.tenantId, ecfId, en(2_000_000)), true)
  await pasar(2_000_000)
  assert.equal((await fila(id)).estado, 'aceptado')

  sim.config.resultado = 'rechazado'
  const id2 = await emitir()
  await pasar(2_000_001)
  const rechazado = await fila(id2)
  assert.equal(rechazado.estado, 'rechazado')
  assert.equal(await programarReintento(t.pool, A.tenantId, rechazado.id, en(2_000_002)), false)
})

test('reintentar un e-CF de otra empresa no hace nada', async () => {
  sim.config.caido = true
  const id = await emitir(A)
  for (let i = 0; i < MAX_INTENTOS; i++) await pasar(i * 100_000)
  const ecfId = (await fila(id)).id
  assert.equal(await programarReintento(t.pool, B.tenantId, ecfId, en(2_000_000)), false)
  assert.equal((await fila(id)).estado, 'error')
})

// ── Sin duplicar envíos ───────────────────────────────────────

test('dos trabajadores a la vez no envían el mismo e-CF dos veces', async () => {
  await emitir()
  await Promise.all([pasar(), pasar(), pasar()])
  assert.equal(sim.recibidos.length, 1)
})

// ── Varias empresas, ambiente y certificado ───────────────────

test('una pasada atiende a varias empresas, cada una con su propio certificado', async () => {
  const idA = await emitir(A)
  const idB = await emitir(B)
  const r = await pasar()
  assert.equal(r.procesados, 2)
  assert.equal((await fila(idA)).estado, 'aceptado')
  assert.equal((await fila(idB)).estado, 'aceptado')
  assert.equal(sim.autenticaciones(), 2)
  assert.deepEqual(sim.recibidos.map((x) => x.rncEmisor).sort(), [A.rnc, B.rnc].sort())
})

test('cada empresa se envía al ambiente que configuró', async () => {
  await t.pool.query("INSERT INTO ecf_configuracion (tenant_id, ambiente) VALUES (?, 'CerteCF')", [A.tenantId])
  await emitir(A)
  await emitir(B)
  await pasar()
  const deA = sim.rutas.filter((r) => r.startsWith('/certecf/'))
  const deB = sim.rutas.filter((r) => r.startsWith('/testecf/'))
  assert.ok(deA.length > 0 && deB.length > 0, sim.rutas.join(' '))
})

test('si la empresa borró su certificado, el envío falla con un motivo claro y se reintenta después', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Sin Certificado Luego')
  const id = await emitir(C)
  await t.pool.query('DELETE FROM certificados_digitales WHERE tenant_id = ?', [C.tenantId])
  await pasar()
  const f = await fila(id)
  assert.equal(f.estado, 'generado')
  assert.equal(f.intentos, 1)
  assert.match(f.mensaje_dgii, /certificado/i)
  assert.equal(sim.recibidos.length, 0)
})

test('el límite de e-CF por pasada se respeta y el resto queda para la siguiente', async () => {
  for (let i = 0; i < 3; i++) await emitir()
  const r = await pasar(0, { limite: 2 })
  assert.equal(r.procesados, 2)
  const r2 = await pasar(0, { limite: 2 })
  assert.equal(r2.procesados, 1)
})

test('una empresa suspendida sigue enviando lo ya emitido: el e-CF debe llegar a la DGII', async () => {
  const C = await prepararEmpresaEcf(t, 'Empresa Suspendida Luego')
  const id = await emitir(C)
  await t.pool.query("UPDATE tenants SET estado = 'suspendido' WHERE id = ?", [C.tenantId])
  await pasar()
  assert.equal((await fila(id)).estado, 'aceptado')
})
