-- ============================================================
-- FácilFactura RD — esquema de la plataforma SaaS (base facilfactura_saas)
-- ARCHIVO GENERADO con "npm run db:dump-schema": no editar a mano.
-- Fuente de verdad: database/migrations/ (8 migraciones aplicadas al generar este archivo).
-- Contiene 23 tablas y los datos de referencia; no contiene datos de ninguna empresa.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS `facilfactura_saas` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `facilfactura_saas`;

-- Tabla articulo_precios
CREATE TABLE `articulo_precios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `articulo_id` int(10) unsigned NOT NULL,
  `unidad_medida_id` int(10) unsigned NOT NULL,
  `precio_unitario` decimal(12,2) NOT NULL DEFAULT 0.00,
  `precio_detalle` decimal(12,2) DEFAULT NULL,
  `precio_mayoreo` decimal(12,2) DEFAULT NULL,
  `es_precio_default` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_articulo_unidad` (`articulo_id`,`unidad_medida_id`),
  KEY `unidad_medida_id` (`unidad_medida_id`),
  KEY `fk_articulo_precios_tenant` (`tenant_id`),
  CONSTRAINT `articulo_precios_ibfk_1` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `articulo_precios_ibfk_2` FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidades_medida` (`id`),
  CONSTRAINT `fk_articulo_precios_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla articulos
CREATE TABLE `articulos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `categoria_id` int(10) unsigned NOT NULL,
  `tipo` enum('producto','servicio') NOT NULL DEFAULT 'producto',
  `codigo` varchar(50) DEFAULT NULL,
  `nombre` varchar(200) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `unidad_medida_id` int(10) unsigned NOT NULL,
  `tiene_dimensiones` tinyint(1) DEFAULT 0,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_articulos_tenant_codigo` (`tenant_id`,`codigo`),
  KEY `unidad_medida_id` (`unidad_medida_id`),
  KEY `idx_articulos_categoria` (`categoria_id`),
  KEY `idx_articulos_tipo` (`tipo`),
  CONSTRAINT `articulos_ibfk_1` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`),
  CONSTRAINT `articulos_ibfk_2` FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidades_medida` (`id`),
  CONSTRAINT `fk_articulos_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla categorias
CREATE TABLE `categorias` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `tipo` enum('producto','servicio','ambos') DEFAULT 'ambos',
  `descripcion` varchar(255) DEFAULT NULL,
  `orden` tinyint(3) unsigned DEFAULT 1,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_categorias_tenant` (`tenant_id`),
  CONSTRAINT `fk_categorias_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla certificados_digitales
CREATE TABLE `certificados_digitales` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `p12_cifrado` mediumtext NOT NULL,
  `password_cifrada` text NOT NULL,
  `titular` varchar(255) NOT NULL,
  `emisor` varchar(255) NOT NULL,
  `serie` varchar(100) NOT NULL,
  `huella` varchar(64) NOT NULL,
  `valido_desde` datetime NOT NULL,
  `valido_hasta` datetime NOT NULL,
  `subido_por` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_certificados_tenant` (`tenant_id`),
  CONSTRAINT `certificados_digitales_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla clientes
CREATE TABLE `clientes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(200) NOT NULL,
  `rnc` varchar(20) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `celular` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `direccion` text DEFAULT NULL,
  `ciudad` varchar(100) DEFAULT NULL,
  `tipo` enum('empresa','persona') DEFAULT 'empresa',
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_clientes_tenant` (`tenant_id`),
  CONSTRAINT `fk_clientes_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla configuracion
CREATE TABLE `configuracion` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned DEFAULT NULL,
  `factura_ultimo_numero` int(10) unsigned DEFAULT 0,
  `factura_prefijo` varchar(5) DEFAULT 'F',
  `moneda` varchar(10) DEFAULT 'DOP',
  `itbis_porcentaje` decimal(5,2) DEFAULT 18.00,
  `ret_itbis_porcentaje` decimal(5,2) DEFAULT 100.00,
  `ret_isr_porcentaje` decimal(5,2) DEFAULT 10.00,
  `nfc_alerta_porcentaje` tinyint(3) unsigned DEFAULT 80,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_configuracion_tenant` (`tenant_id`),
  KEY `empresa_id` (`empresa_id`),
  CONSTRAINT `configuracion_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `fk_configuracion_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla ecf_configuracion
CREATE TABLE `ecf_configuracion` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `ambiente` enum('TesteCF','CerteCF','eCF') NOT NULL DEFAULT 'TesteCF',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ecf_config_tenant` (`tenant_id`),
  CONSTRAINT `ecf_configuracion_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla ecf_emitidos
CREATE TABLE `ecf_emitidos` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `factura_id` int(10) unsigned NOT NULL,
  `tipo_ecf` tinyint(3) unsigned NOT NULL,
  `encf` varchar(13) NOT NULL,
  `ecf_referencia_id` int(10) unsigned DEFAULT NULL,
  `xml_firmado` mediumtext NOT NULL,
  `codigo_seguridad` varchar(6) NOT NULL,
  `fecha_firma` datetime NOT NULL,
  `rnc_emisor` varchar(11) NOT NULL,
  `rnc_comprador` varchar(11) DEFAULT NULL,
  `fecha_emision` date NOT NULL,
  `monto_total` decimal(12,2) NOT NULL,
  `tasa_itbis` tinyint(3) unsigned NOT NULL,
  `estado` enum('generado','enviado','en_proceso','aceptado','aceptado_condicional','rechazado','error') NOT NULL DEFAULT 'generado',
  `track_id` varchar(100) DEFAULT NULL,
  `mensaje_dgii` text DEFAULT NULL,
  `intentos` int(10) unsigned NOT NULL DEFAULT 0,
  `proximo_intento` datetime DEFAULT NULL,
  `ultimo_intento` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ecf_tenant_encf` (`tenant_id`,`encf`),
  UNIQUE KEY `uq_ecf_factura_tipo` (`factura_id`,`tipo_ecf`),
  KEY `ecf_emitidos_ecf_referencia_id_foreign` (`ecf_referencia_id`),
  KEY `idx_ecf_cola` (`estado`,`proximo_intento`),
  KEY `idx_ecf_tenant_fecha` (`tenant_id`,`created_at`),
  CONSTRAINT `ecf_emitidos_ecf_referencia_id_foreign` FOREIGN KEY (`ecf_referencia_id`) REFERENCES `ecf_emitidos` (`id`),
  CONSTRAINT `ecf_emitidos_factura_id_foreign` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`),
  CONSTRAINT `ecf_emitidos_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla empresas
CREATE TABLE `empresas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(200) NOT NULL,
  `rnc` varchar(20) NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `celular` varchar(20) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `direccion` text DEFAULT NULL,
  `ciudad` varchar(100) DEFAULT NULL,
  `pais` varchar(100) DEFAULT 'República Dominicana',
  `sitio_web` varchar(200) DEFAULT NULL,
  `logo_path` varchar(500) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_empresas_tenant_rnc` (`tenant_id`,`rnc`),
  CONSTRAINT `fk_empresas_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla factura_items
CREATE TABLE `factura_items` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `factura_id` int(10) unsigned NOT NULL,
  `articulo_id` int(10) unsigned NOT NULL,
  `descripcion_custom` varchar(500) DEFAULT NULL,
  `cantidad` decimal(10,4) NOT NULL DEFAULT 1.0000,
  `ancho` decimal(10,2) DEFAULT NULL,
  `alto` decimal(10,2) DEFAULT NULL,
  `unidad_medida_id` int(10) unsigned NOT NULL,
  `precio_unitario` decimal(12,2) NOT NULL,
  `tipo_precio` enum('unitario','detalle','mayoreo') DEFAULT 'unitario',
  `subtotal` decimal(12,2) NOT NULL,
  `orden` tinyint(3) unsigned DEFAULT 1,
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `articulo_id` (`articulo_id`),
  KEY `unidad_medida_id` (`unidad_medida_id`),
  KEY `idx_factura_items_factura` (`factura_id`),
  KEY `fk_factura_items_tenant` (`tenant_id`),
  CONSTRAINT `factura_items_ibfk_1` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `factura_items_ibfk_2` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`),
  CONSTRAINT `factura_items_ibfk_3` FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidades_medida` (`id`),
  CONSTRAINT `fk_factura_items_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla facturas
CREATE TABLE `facturas` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `numero` varchar(20) NOT NULL,
  `nfc_secuencia_id` int(10) unsigned DEFAULT NULL,
  `nfc_numero` varchar(30) DEFAULT NULL,
  `tipo_servicio_id` int(10) unsigned DEFAULT NULL,
  `fecha` date NOT NULL,
  `vencimiento` date DEFAULT NULL,
  `cliente_id` int(10) unsigned NOT NULL,
  `empresa_id` int(10) unsigned NOT NULL,
  `servicio` text DEFAULT NULL,
  `subtotal` decimal(12,2) DEFAULT 0.00,
  `itbis` decimal(12,2) DEFAULT 0.00,
  `ret_itbis` decimal(12,2) DEFAULT 0.00,
  `ret_isr` decimal(12,2) DEFAULT 0.00,
  `total` decimal(12,2) DEFAULT 0.00,
  `estado` enum('borrador','emitida','anulada') DEFAULT 'borrador',
  `usuario_id` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_facturas_tenant_numero` (`tenant_id`,`numero`),
  KEY `nfc_secuencia_id` (`nfc_secuencia_id`),
  KEY `tipo_servicio_id` (`tipo_servicio_id`),
  KEY `empresa_id` (`empresa_id`),
  KEY `usuario_id` (`usuario_id`),
  KEY `idx_facturas_fecha` (`fecha`),
  KEY `idx_facturas_cliente` (`cliente_id`),
  KEY `idx_facturas_estado` (`estado`),
  KEY `idx_facturas_numero` (`numero`),
  CONSTRAINT `facturas_ibfk_1` FOREIGN KEY (`nfc_secuencia_id`) REFERENCES `nfc_secuencias` (`id`),
  CONSTRAINT `facturas_ibfk_2` FOREIGN KEY (`tipo_servicio_id`) REFERENCES `tipos_servicio` (`id`),
  CONSTRAINT `facturas_ibfk_3` FOREIGN KEY (`cliente_id`) REFERENCES `clientes` (`id`),
  CONSTRAINT `facturas_ibfk_4` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `facturas_ibfk_5` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_facturas_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla metodos_pago
CREATE TABLE `metodos_pago` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) unsigned NOT NULL,
  `tipo` enum('transferencia','cheque','efectivo','tarjeta') NOT NULL,
  `banco` varchar(100) DEFAULT NULL,
  `numero_cuenta` varchar(50) DEFAULT NULL,
  `tipo_cuenta` enum('corriente','ahorros') DEFAULT 'corriente',
  `titular` varchar(200) DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `orden` tinyint(3) unsigned DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  KEY `fk_metodos_pago_tenant` (`tenant_id`),
  CONSTRAINT `fk_metodos_pago_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `metodos_pago_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla nfc_secuencias
CREATE TABLE `nfc_secuencias` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tipo_ncf` varchar(5) NOT NULL,
  `descripcion` varchar(200) DEFAULT NULL,
  `desde` int(10) unsigned NOT NULL,
  `hasta` int(10) unsigned NOT NULL,
  `ultimo_usado` int(10) unsigned DEFAULT 0,
  `alerta_desde` int(10) unsigned NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_nfc_secuencias_tenant` (`tenant_id`),
  CONSTRAINT `fk_nfc_secuencias_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla planes
CREATE TABLE `planes` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `slug` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `precio_mensual` decimal(10,2) NOT NULL DEFAULT 0.00,
  `moneda` varchar(10) NOT NULL DEFAULT 'DOP',
  `max_usuarios` int(11) NOT NULL,
  `max_clientes` int(11) NOT NULL,
  `max_ecf_mes` int(11) NOT NULL,
  `es_plan_prueba` tinyint(1) NOT NULL DEFAULT 0,
  `dias_prueba` int(11) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `orden` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `planes_slug_unique` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla roles
CREATE TABLE `roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla subscription_history
CREATE TABLE `subscription_history` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `accion` enum('creada','plan_cambiado','pago_registrado','renovada','suspendida','reactivada','cancelada','exenta','exencion_quitada') NOT NULL,
  `detalle` varchar(500) DEFAULT NULL,
  `actor` varchar(50) NOT NULL DEFAULT 'sistema',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_historial_tenant_fecha` (`tenant_id`,`created_at`),
  CONSTRAINT `subscription_history_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla subscription_payments
CREATE TABLE `subscription_payments` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `subscription_id` int(10) unsigned DEFAULT NULL,
  `monto` decimal(10,2) NOT NULL,
  `moneda` varchar(10) NOT NULL DEFAULT 'DOP',
  `metodo` enum('transferencia','tarjeta','efectivo','cheque') NOT NULL,
  `referencia` varchar(100) DEFAULT NULL,
  `estado` enum('pendiente','pagado','fallido','reembolsado') NOT NULL DEFAULT 'pagado',
  `periodo_desde` date DEFAULT NULL,
  `periodo_hasta` date DEFAULT NULL,
  `fecha_pago` date DEFAULT NULL,
  `registrado_por` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `subscription_payments_subscription_id_foreign` (`subscription_id`),
  KEY `idx_pagos_tenant_fecha` (`tenant_id`,`fecha_pago`),
  CONSTRAINT `subscription_payments_subscription_id_foreign` FOREIGN KEY (`subscription_id`) REFERENCES `tenant_subscriptions` (`id`),
  CONSTRAINT `subscription_payments_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla tenant_subscriptions
CREATE TABLE `tenant_subscriptions` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` int(10) unsigned NOT NULL,
  `plan_id` int(10) unsigned NOT NULL,
  `status` enum('activo','prueba','expirado','suspendido','cancelado','exento') NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date DEFAULT NULL,
  `dias_gracia` int(11) NOT NULL DEFAULT 2,
  `auto_renovar` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `tenant_subscriptions_plan_id_foreign` (`plan_id`),
  KEY `idx_subs_tenant_status` (`tenant_id`,`status`),
  CONSTRAINT `tenant_subscriptions_plan_id_foreign` FOREIGN KEY (`plan_id`) REFERENCES `planes` (`id`),
  CONSTRAINT `tenant_subscriptions_tenant_id_foreign` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla tenants
CREATE TABLE `tenants` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(200) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `rnc` varchar(20) NOT NULL,
  `email` varchar(150) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  `direccion` text DEFAULT NULL,
  `logo_path` varchar(500) DEFAULT NULL,
  `plan_id` int(10) unsigned NOT NULL,
  `estado` enum('activo','prueba','suspendido','cancelado','pendiente_pago','pendiente','exento') NOT NULL DEFAULT 'pendiente',
  `fecha_fin_prueba` date DEFAULT NULL,
  `ip_registro` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `tenants_slug_unique` (`slug`),
  UNIQUE KEY `tenants_rnc_unique` (`rnc`),
  KEY `tenants_plan_id_foreign` (`plan_id`),
  KEY `idx_tenants_estado` (`estado`),
  CONSTRAINT `tenants_plan_id_foreign` FOREIGN KEY (`plan_id`) REFERENCES `planes` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Tabla tipos_servicio
CREATE TABLE `tipos_servicio` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(200) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_tipos_servicio_tenant` (`tenant_id`),
  CONSTRAINT `fk_tipos_servicio_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla unidades_medida
CREATE TABLE `unidades_medida` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `abreviatura` varchar(10) NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_unidades_medida_tenant` (`tenant_id`),
  CONSTRAINT `fk_unidades_medida_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla usuarios
CREATE TABLE `usuarios` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `rol_id` int(10) unsigned NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `ultimo_acceso` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `tenant_id` int(10) unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `rol_id` (`rol_id`),
  KEY `fk_usuarios_tenant` (`tenant_id`),
  CONSTRAINT `fk_usuarios_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`id`),
  CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla usuarios_plataforma
CREATE TABLE `usuarios_plataforma` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `ultimo_acceso` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuarios_plataforma_email_unique` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Datos de referencia: roles
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `created_at`) VALUES
  (1, 'admin', 'Acceso total al sistema', '2026-09-30 20:46:44.000'),
  (2, 'facturador', 'Puede crear y emitir facturas', '2026-09-30 20:46:44.000'),
  (3, 'visor', 'Solo puede consultar información', '2026-09-30 20:46:44.000');

-- Datos de referencia: tipos_servicio
INSERT INTO `tipos_servicio` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`, `tenant_id`) VALUES
  (1, 'Instalación de rótulos y señalización', 'Servicio de instalación de materiales publicitarios y señalización', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1),
  (2, 'Impresión de materiales publicitarios', 'Impresión de banners, lonas, vinilos y materiales gráficos', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1),
  (3, 'Diseño gráfico', 'Creación y diseño de artes, logos y materiales gráficos', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1),
  (4, 'Alquiler de equipos', 'Renta de grúas, plataformas y equipos especiales para instalación', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1),
  (5, 'Venta de materiales', 'Venta al detalle de materiales: lonas, yaldas, vinilos y similares', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1),
  (6, 'Mano de obra', 'Servicios de instalación, montaje y trabajo manual', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1),
  (7, 'Servicio general', 'Servicio de naturaleza general', 1, '2026-09-30 20:46:44.000', '2026-09-30 20:46:44.000', 1);

-- Datos de referencia: unidades_medida
INSERT INTO `unidades_medida` (`id`, `nombre`, `abreviatura`, `activo`, `tenant_id`) VALUES
  (1, 'Unidad', 'und', 1, 1),
  (2, 'Metro', 'm', 1, 1),
  (3, 'Metro cuadrado', 'm²', 1, 1),
  (4, 'Centímetro', 'cm', 1, 1),
  (5, 'Pie', 'pie', 1, 1),
  (6, 'Pieza', 'pz', 1, 1),
  (7, 'Rollo', 'rollo', 1, 1),
  (8, 'Hora', 'hr', 1, 1),
  (9, 'Día', 'día', 1, 1),
  (10, 'Servicio', 'svc', 1, 1),
  (11, 'Kilogramo', 'kg', 1, 1),
  (12, 'Litro', 'lt', 1, 1),
  (13, 'Global', 'global', 1, 1);

-- Datos de referencia: configuracion
INSERT INTO `configuracion` (`id`, `empresa_id`, `factura_ultimo_numero`, `factura_prefijo`, `moneda`, `itbis_porcentaje`, `ret_itbis_porcentaje`, `ret_isr_porcentaje`, `nfc_alerta_porcentaje`, `updated_at`, `tenant_id`) VALUES
  (1, NULL, 0, 'F', 'DOP', '18.00', '100.00', '10.00', 80, '2026-09-30 20:46:44.000', 1);

SET FOREIGN_KEY_CHECKS = 1;
