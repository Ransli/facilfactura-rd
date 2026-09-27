// Suscripción mensual de cada empresa, sus pagos y la bitácora de cambios (propuesta de la Unidad II, V.3).
//
// - `tenant_subscriptions`: qué plan tiene la empresa y hasta cuándo está cubierta. `status` es el estado de la
//   suscripción; el estado comercial de la empresa vive en `tenants.estado`. `evaluarEstado()` combina ambos.
// - `subscription_payments`: cada pago registrado (manual por ahora), con el período que cubre.
// - `subscription_history`: quién cambió qué y cuándo. Solo se agregan filas, nunca se editan.

export async function up(knex) {
  await knex.schema.createTable('tenant_subscriptions', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.integer('plan_id').unsigned().notNullable().references('id').inTable('planes')
    t.enu('status', ['activo', 'prueba', 'expirado', 'suspendido', 'cancelado', 'exento']).notNullable()
    t.date('fecha_inicio').notNullable()
    t.date('fecha_fin').nullable()
    t.integer('dias_gracia').notNullable().defaultTo(2)
    t.boolean('auto_renovar').notNullable().defaultTo(false)
    t.timestamps(true, true)
    t.index(['tenant_id', 'status'], 'idx_subs_tenant_status')
  })

  await knex.schema.createTable('subscription_payments', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.integer('subscription_id').unsigned().nullable().references('id').inTable('tenant_subscriptions')
    t.decimal('monto', 10, 2).notNullable()
    t.string('moneda', 10).notNullable().defaultTo('DOP')
    t.enu('metodo', ['transferencia', 'tarjeta', 'efectivo', 'cheque']).notNullable()
    t.string('referencia', 100).nullable()
    t.enu('estado', ['pendiente', 'pagado', 'fallido', 'reembolsado']).notNullable().defaultTo('pagado')
    t.date('periodo_desde').nullable()
    t.date('periodo_hasta').nullable()
    t.date('fecha_pago').nullable()
    t.string('registrado_por', 50).nullable()        // 'master:<id>' o 'sistema'
    t.timestamps(true, true)
    t.index(['tenant_id', 'fecha_pago'], 'idx_pagos_tenant_fecha')
  })

  await knex.schema.createTable('subscription_history', (t) => {
    t.increments('id').unsigned()
    t.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
    t.enu('accion', ['creada', 'plan_cambiado', 'pago_registrado', 'renovada', 'suspendida', 'reactivada', 'cancelada', 'exenta', 'exencion_quitada'])
      .notNullable()
    t.string('detalle', 500).nullable()
    t.string('actor', 50).notNullable().defaultTo('sistema')   // 'master:<id>', 'usuario:<id>' o 'sistema'
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    t.index(['tenant_id', 'created_at'], 'idx_historial_tenant_fecha')
  })

  // La empresa migrada de la v1 (tenant 1) es exenta de pago: se le crea su suscripción exenta.
  const [tenant] = await knex('tenants').where({ id: 1 })
  if (tenant) {
    await knex('tenant_subscriptions').insert({
      tenant_id: 1, plan_id: tenant.plan_id, status: 'exento', fecha_inicio: knex.raw('CURDATE()'), fecha_fin: null,
    })
    await knex('subscription_history').insert({
      tenant_id: 1, accion: 'creada', detalle: 'Empresa migrada de la v1, exenta de pago', actor: 'sistema',
    })
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('subscription_history')
  await knex.schema.dropTableIfExists('subscription_payments')
  await knex.schema.dropTableIfExists('tenant_subscriptions')
}
