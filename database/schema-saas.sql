-- ============================================================
-- FácilFactura RD — esquema de la plataforma SaaS (base facilfactura_saas)
-- ARCHIVO GENERADO con "npm run db:dump-schema": no editar a mano.
-- Fuente de verdad: database/migrations/ (1 migraciones aplicadas al generar este archivo).
-- Contiene 14 tablas y los datos de referencia; no contiene datos de ninguna empresa.
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_articulo_unidad` (`articulo_id`,`unidad_medida_id`),
  KEY `unidad_medida_id` (`unidad_medida_id`),
  CONSTRAINT `articulo_precios_ibfk_1` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`) ON DELETE CASCADE,
  CONSTRAINT `articulo_precios_ibfk_2` FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidades_medida` (`id`)
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `codigo` (`codigo`),
  KEY `unidad_medida_id` (`unidad_medida_id`),
  KEY `idx_articulos_categoria` (`categoria_id`),
  KEY `idx_articulos_tipo` (`tipo`),
  CONSTRAINT `articulos_ibfk_1` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`),
  CONSTRAINT `articulos_ibfk_2` FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidades_medida` (`id`)
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  CONSTRAINT `configuracion_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  PRIMARY KEY (`id`),
  UNIQUE KEY `rnc` (`rnc`)
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
  PRIMARY KEY (`id`),
  KEY `articulo_id` (`articulo_id`),
  KEY `unidad_medida_id` (`unidad_medida_id`),
  KEY `idx_factura_items_factura` (`factura_id`),
  CONSTRAINT `factura_items_ibfk_1` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`) ON DELETE CASCADE,
  CONSTRAINT `factura_items_ibfk_2` FOREIGN KEY (`articulo_id`) REFERENCES `articulos` (`id`),
  CONSTRAINT `factura_items_ibfk_3` FOREIGN KEY (`unidad_medida_id`) REFERENCES `unidades_medida` (`id`)
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `numero` (`numero`),
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
  CONSTRAINT `facturas_ibfk_5` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
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
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla roles
CREATE TABLE `roles` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla tipos_servicio
CREATE TABLE `tipos_servicio` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(200) NOT NULL,
  `descripcion` text DEFAULT NULL,
  `activo` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla unidades_medida
CREATE TABLE `unidades_medida` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `abreviatura` varchar(10) NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `rol_id` (`rol_id`),
  CONSTRAINT `usuarios_ibfk_1` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Datos de referencia: roles
INSERT INTO `roles` (`id`, `nombre`, `descripcion`, `created_at`) VALUES
  (1, 'admin', 'Acceso total al sistema', '2026-09-26 22:45:57.000'),
  (2, 'facturador', 'Puede crear y emitir facturas', '2026-09-26 22:45:57.000'),
  (3, 'visor', 'Solo puede consultar información', '2026-09-26 22:45:57.000');

-- Datos de referencia: tipos_servicio
INSERT INTO `tipos_servicio` (`id`, `nombre`, `descripcion`, `activo`, `created_at`, `updated_at`) VALUES
  (1, 'Instalación de rótulos y señalización', 'Servicio de instalación de materiales publicitarios y señalización', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000'),
  (2, 'Impresión de materiales publicitarios', 'Impresión de banners, lonas, vinilos y materiales gráficos', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000'),
  (3, 'Diseño gráfico', 'Creación y diseño de artes, logos y materiales gráficos', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000'),
  (4, 'Alquiler de equipos', 'Renta de grúas, plataformas y equipos especiales para instalación', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000'),
  (5, 'Venta de materiales', 'Venta al detalle de materiales: lonas, yaldas, vinilos y similares', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000'),
  (6, 'Mano de obra', 'Servicios de instalación, montaje y trabajo manual', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000'),
  (7, 'Servicio general', 'Servicio de naturaleza general', 1, '2026-09-26 22:45:58.000', '2026-09-26 22:45:58.000');

-- Datos de referencia: unidades_medida
INSERT INTO `unidades_medida` (`id`, `nombre`, `abreviatura`, `activo`) VALUES
  (1, 'Unidad', 'und', 1),
  (2, 'Metro', 'm', 1),
  (3, 'Metro cuadrado', 'm²', 1),
  (4, 'Centímetro', 'cm', 1),
  (5, 'Pie', 'pie', 1),
  (6, 'Pieza', 'pz', 1),
  (7, 'Rollo', 'rollo', 1),
  (8, 'Hora', 'hr', 1),
  (9, 'Día', 'día', 1),
  (10, 'Servicio', 'svc', 1),
  (11, 'Kilogramo', 'kg', 1),
  (12, 'Litro', 'lt', 1),
  (13, 'Global', 'global', 1);

-- Datos de referencia: configuracion
INSERT INTO `configuracion` (`id`, `empresa_id`, `factura_ultimo_numero`, `factura_prefijo`, `moneda`, `itbis_porcentaje`, `ret_itbis_porcentaje`, `ret_isr_porcentaje`, `nfc_alerta_porcentaje`, `updated_at`) VALUES
  (1, NULL, 0, 'F', 'DOP', '18.00', '100.00', '10.00', 80, '2026-09-26 22:45:58.000');

SET FOREIGN_KEY_CHECKS = 1;
