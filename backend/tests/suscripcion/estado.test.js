// Pruebas unitarias (sin base de datos) del cálculo del estado de una suscripción.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluarEstado, hoyRD, DIAS_GRACIA } from '../../services/suscripcion/estado.js'

const HOY = '2026-09-27'

test('el período de gracia es de 2 días', () => {
  assert.equal(DIAS_GRACIA, 2)
})

test('hoyRD entrega la fecha AAAA-MM-DD de República Dominicana (UTC-4), no la de UTC', () => {
  // 03:00 UTC del día 28 todavía es el día 27 a las 23:00 en Santo Domingo
  assert.equal(hoyRD(new Date('2026-09-28T03:00:00Z')), '2026-09-27')
  assert.equal(hoyRD(new Date('2026-09-28T05:00:00Z')), '2026-09-28')
})

test('una empresa exenta nunca se bloquea, aunque tenga fechas vencidas', () => {
  const r = evaluarEstado({ estado: 'exento', fecha_fin_prueba: '2020-01-01', sub_fecha_fin: '2020-01-01' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, false)
  assert.equal(r.aviso, null)
})

test('una empresa activa sin fecha de vencimiento no se bloquea', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: null }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.vence, null)
})

test('activa con vencimiento lejano: sin bloqueo, sin gracia y con los días que le quedan', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: '2026-10-27' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, false)
  assert.equal(r.diasRestantes, 30)
  assert.equal(r.aviso, null)
})

test('activa que vence en 3 días: sigue normal pero avisa', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: '2026-09-30' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, false)
  assert.equal(r.diasRestantes, 3)
  assert.match(r.aviso, /vence en 3 días/)
})

test('activa que vence hoy todavía no está vencida', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: HOY }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, false)
  assert.equal(r.diasRestantes, 0)
})

test('activa vencida ayer: en gracia (le quedan 1 día), puede trabajar con aviso', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: '2026-09-26' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, true)
  assert.equal(r.diasRestantes, 1)
  assert.match(r.aviso, /venció/)
})

test('activa vencida hace 2 días: es el último día de gracia', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: '2026-09-25' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, true)
  assert.equal(r.diasRestantes, 0)
})

test('activa vencida hace 3 días: bloqueada', () => {
  const r = evaluarEstado({ estado: 'activo', sub_fecha_fin: '2026-09-24' }, HOY)
  assert.equal(r.bloqueado, true)
  assert.equal(r.enGracia, false)
  assert.equal(r.motivo, 'vencida')
})

test('en prueba vigente: sin bloqueo', () => {
  const r = evaluarEstado({ estado: 'prueba', fecha_fin_prueba: '2026-10-20' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.diasRestantes, 23)
})

test('en prueba vencida hace 1 día: gracia; hace 3 días: bloqueada', () => {
  assert.equal(evaluarEstado({ estado: 'prueba', fecha_fin_prueba: '2026-09-26' }, HOY).enGracia, true)
  const r = evaluarEstado({ estado: 'prueba', fecha_fin_prueba: '2026-09-24' }, HOY)
  assert.equal(r.bloqueado, true)
  assert.equal(r.motivo, 'prueba_vencida')
})

test('suspendida: bloqueada aunque no haya vencido', () => {
  const r = evaluarEstado({ estado: 'suspendido', sub_fecha_fin: '2027-01-01' }, HOY)
  assert.equal(r.bloqueado, true)
  assert.equal(r.motivo, 'suspendida')
})

test('cancelada: bloqueada', () => {
  const r = evaluarEstado({ estado: 'cancelado' }, HOY)
  assert.equal(r.bloqueado, true)
  assert.equal(r.motivo, 'cancelada')
})

test('suscripción marcada como expirada, suspendida o cancelada bloquea aunque el tenant figure activo', () => {
  assert.equal(evaluarEstado({ estado: 'activo', sub_status: 'expirado', sub_fecha_fin: '2027-01-01' }, HOY).bloqueado, true)
  assert.equal(evaluarEstado({ estado: 'activo', sub_status: 'suspendido' }, HOY).motivo, 'suspendida')
  assert.equal(evaluarEstado({ estado: 'activo', sub_status: 'cancelado' }, HOY).motivo, 'cancelada')
})

test('pendiente de pago dentro del plazo: puede trabajar y se le avisa cuántos días tiene para pagar', () => {
  const r = evaluarEstado({ estado: 'pendiente_pago', fecha_fin_prueba: '2026-10-01' }, HOY)
  assert.equal(r.bloqueado, false)
  assert.equal(r.enGracia, true)
  assert.equal(r.diasRestantes, 4)
  assert.match(r.aviso, /pagar/)
})

test('pendiente de pago con el plazo vencido: bloqueada, sin días de gracia adicionales', () => {
  const r = evaluarEstado({ estado: 'pendiente_pago', fecha_fin_prueba: '2026-09-26' }, HOY)
  assert.equal(r.bloqueado, true)
  assert.equal(r.motivo, 'pago_requerido')
})

test('el último día del plazo de pago todavía no está bloqueada', () => {
  const r = evaluarEstado({ estado: 'pendiente_pago', fecha_fin_prueba: HOY }, HOY)
  assert.equal(r.bloqueado, false)
})
