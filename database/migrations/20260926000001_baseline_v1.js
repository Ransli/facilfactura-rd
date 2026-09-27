// Migración base: el esquema completo de la v1 (Seminario de Proyecto I), sin cambios.
// Las migraciones siguientes lo escalan a una plataforma multi-tenant.
// Fuente: database/schema.sql (14 tablas, claves foráneas, índices y datos iniciales).

const SENTENCIAS = [
  `CREATE TABLE roles (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(50)  NOT NULL UNIQUE,
  descripcion VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,

  `INSERT INTO roles (nombre, descripcion) VALUES
  ('admin',       'Acceso total al sistema'),
  ('facturador',  'Puede crear y emitir facturas'),
  ('visor',       'Solo puede consultar información');`,

  `CREATE TABLE usuarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  rol_id         INT UNSIGNED NOT NULL,
  activo         TINYINT(1)   DEFAULT 1,
  ultimo_acceso  TIMESTAMP    NULL,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rol_id) REFERENCES roles(id)
);`,

  `CREATE TABLE empresas (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  rnc         VARCHAR(20)  NOT NULL UNIQUE,
  telefono    VARCHAR(20),
  celular     VARCHAR(20),
  email       VARCHAR(150),
  direccion   TEXT,
  ciudad      VARCHAR(100),
  pais        VARCHAR(100) DEFAULT 'República Dominicana',
  sitio_web   VARCHAR(200),
  logo_path   VARCHAR(500),
  activo      TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);`,

  `CREATE TABLE clientes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  rnc         VARCHAR(20),
  telefono    VARCHAR(20),
  celular     VARCHAR(20),
  email       VARCHAR(150),
  direccion   TEXT,
  ciudad      VARCHAR(100),
  tipo        ENUM('empresa', 'persona') DEFAULT 'empresa',
  activo      TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);`,

  `CREATE TABLE metodos_pago (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id     INT UNSIGNED NOT NULL,
  tipo           ENUM('transferencia', 'cheque', 'efectivo', 'tarjeta') NOT NULL,
  banco          VARCHAR(100),
  numero_cuenta  VARCHAR(50),
  tipo_cuenta    ENUM('corriente', 'ahorros') DEFAULT 'corriente',
  titular        VARCHAR(200),
  activo         TINYINT(1)      DEFAULT 1,
  orden          TINYINT UNSIGNED DEFAULT 1,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);`,

  `CREATE TABLE categorias (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  tipo        ENUM('producto', 'servicio', 'ambos') DEFAULT 'ambos',
  descripcion VARCHAR(255),
  orden       TINYINT UNSIGNED DEFAULT 1,
  activo      TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);`,

  `CREATE TABLE tipos_servicio (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(200) NOT NULL,
  descripcion TEXT,
  activo      TINYINT(1)   DEFAULT 1,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);`,

  `INSERT INTO tipos_servicio (nombre, descripcion) VALUES
  ('Instalación de rótulos y señalización', 'Servicio de instalación de materiales publicitarios y señalización'),
  ('Impresión de materiales publicitarios', 'Impresión de banners, lonas, vinilos y materiales gráficos'),
  ('Diseño gráfico', 'Creación y diseño de artes, logos y materiales gráficos'),
  ('Alquiler de equipos', 'Renta de grúas, plataformas y equipos especiales para instalación'),
  ('Venta de materiales', 'Venta al detalle de materiales: lonas, yaldas, vinilos y similares'),
  ('Mano de obra', 'Servicios de instalación, montaje y trabajo manual'),
  ('Servicio general', 'Servicio de naturaleza general');`,

  `CREATE TABLE unidades_medida (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(50)  NOT NULL,
  abreviatura  VARCHAR(10)  NOT NULL,
  activo       TINYINT(1)   DEFAULT 1
);`,

  `INSERT INTO unidades_medida (nombre, abreviatura) VALUES
  ('Unidad',          'und'),
  ('Metro',           'm'),
  ('Metro cuadrado',  'm²'),
  ('Centímetro',      'cm'),
  ('Pie',             'pie'),
  ('Pieza',           'pz'),
  ('Rollo',           'rollo'),
  ('Hora',            'hr'),
  ('Día',             'día'),
  ('Servicio',        'svc'),
  ('Kilogramo',       'kg'),
  ('Litro',           'lt'),
  ('Global',          'global');`,

  `CREATE TABLE articulos (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categoria_id        INT UNSIGNED NOT NULL,
  tipo                ENUM('producto', 'servicio') NOT NULL DEFAULT 'producto',
  codigo              VARCHAR(50)  UNIQUE,
  nombre              VARCHAR(200) NOT NULL,
  descripcion         TEXT,
  unidad_medida_id    INT UNSIGNED NOT NULL,  -- unidad de medida por defecto
  tiene_dimensiones   TINYINT(1)   DEFAULT 0, -- true = el item tiene ancho x alto (ej: banners)
  activo              TINYINT(1)   DEFAULT 1,
  created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (categoria_id)     REFERENCES categorias(id),
  FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id)
);`,

  `CREATE TABLE articulo_precios (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  articulo_id       INT UNSIGNED NOT NULL,
  unidad_medida_id  INT UNSIGNED NOT NULL,
  precio_unitario   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  precio_detalle    DECIMAL(12,2) DEFAULT NULL,  -- precio al detalle (consumidor final)
  precio_mayoreo    DECIMAL(12,2) DEFAULT NULL,  -- precio al por mayor
  es_precio_default TINYINT(1)   DEFAULT 0,      -- 1 = precio que carga por defecto al seleccionar
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_articulo_unidad (articulo_id, unidad_medida_id),
  FOREIGN KEY (articulo_id)      REFERENCES articulos(id) ON DELETE CASCADE,
  FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id)
);`,

  `CREATE TABLE nfc_secuencias (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo_ncf           VARCHAR(5)   NOT NULL,               -- B01, B02, B14, B15, B16...
  descripcion        VARCHAR(200),                        -- Crédito Fiscal, Consumidor Final...
  desde              INT UNSIGNED NOT NULL,               -- número inicial del rango (ej: 1)
  hasta              INT UNSIGNED NOT NULL,               -- número final del rango  (ej: 500)
  ultimo_usado       INT UNSIGNED DEFAULT 0,              -- último número utilizado
  alerta_desde       INT UNSIGNED NOT NULL,               -- número a partir del cual alertar
  -- Ejemplo: desde=1, hasta=500, alerta_desde=400 → alerta cuando quedan 100
  fecha_vencimiento  DATE,
  activo             TINYINT(1)   DEFAULT 1,
  created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);`,

  `CREATE TABLE configuracion (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  empresa_id              INT UNSIGNED,
  factura_ultimo_numero   INT UNSIGNED     DEFAULT 0,
  factura_prefijo         VARCHAR(5)       DEFAULT 'F',
  moneda                  VARCHAR(10)      DEFAULT 'DOP',
  itbis_porcentaje        DECIMAL(5,2)     DEFAULT 18.00,
  ret_itbis_porcentaje    DECIMAL(5,2)     DEFAULT 100.00,
  ret_isr_porcentaje      DECIMAL(5,2)     DEFAULT 10.00,
  nfc_alerta_porcentaje   TINYINT UNSIGNED DEFAULT 80,
  -- 80 = alerta cuando se ha usado el 80% del rango NCF
  updated_at              TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);`,

  `INSERT INTO configuracion (factura_ultimo_numero, factura_prefijo, moneda) VALUES (0, 'F', 'DOP');`,

  `CREATE TABLE facturas (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  numero            VARCHAR(20)  NOT NULL UNIQUE,   -- F000001, F000002...
  nfc_secuencia_id  INT UNSIGNED,
  nfc_numero        VARCHAR(30),                    -- B010000000017
  tipo_servicio_id  INT UNSIGNED,
  fecha             DATE         NOT NULL,
  vencimiento       DATE,
  cliente_id        INT UNSIGNED NOT NULL,
  empresa_id        INT UNSIGNED NOT NULL,
  servicio          TEXT,                           -- descripción adicional libre
  subtotal          DECIMAL(12,2) DEFAULT 0.00,
  itbis             DECIMAL(12,2) DEFAULT 0.00,
  ret_itbis         DECIMAL(12,2) DEFAULT 0.00,
  ret_isr           DECIMAL(12,2) DEFAULT 0.00,
  total             DECIMAL(12,2) DEFAULT 0.00,
  estado            ENUM('borrador', 'emitida', 'anulada') DEFAULT 'borrador',
  usuario_id        INT UNSIGNED,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (nfc_secuencia_id) REFERENCES nfc_secuencias(id),
  FOREIGN KEY (tipo_servicio_id) REFERENCES tipos_servicio(id),
  FOREIGN KEY (cliente_id)       REFERENCES clientes(id),
  FOREIGN KEY (empresa_id)       REFERENCES empresas(id),
  FOREIGN KEY (usuario_id)       REFERENCES usuarios(id)
);`,

  `CREATE TABLE factura_items (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  factura_id          INT UNSIGNED NOT NULL,
  articulo_id         INT UNSIGNED NOT NULL,
  descripcion_custom  VARCHAR(500),               -- sobreescribe la descripción del artículo
  cantidad            DECIMAL(10,4) NOT NULL DEFAULT 1.0000,
  ancho               DECIMAL(10,2) DEFAULT NULL, -- solo si el artículo tiene_dimensiones = true
  alto                DECIMAL(10,2) DEFAULT NULL, -- solo si el artículo tiene_dimensiones = true
  unidad_medida_id    INT UNSIGNED NOT NULL,
  precio_unitario     DECIMAL(12,2) NOT NULL,
  tipo_precio         ENUM('unitario', 'detalle', 'mayoreo') DEFAULT 'unitario',
  subtotal            DECIMAL(12,2) NOT NULL,
  orden               TINYINT UNSIGNED DEFAULT 1,
  FOREIGN KEY (factura_id)       REFERENCES facturas(id) ON DELETE CASCADE,
  FOREIGN KEY (articulo_id)      REFERENCES articulos(id),
  FOREIGN KEY (unidad_medida_id) REFERENCES unidades_medida(id)
);`,

  `CREATE INDEX idx_facturas_fecha       ON facturas(fecha);`,

  `CREATE INDEX idx_facturas_cliente     ON facturas(cliente_id);`,

  `CREATE INDEX idx_facturas_estado      ON facturas(estado);`,

  `CREATE INDEX idx_facturas_numero      ON facturas(numero);`,

  `CREATE INDEX idx_articulos_categoria  ON articulos(categoria_id);`,

  `CREATE INDEX idx_articulos_tipo       ON articulos(tipo);`,

  `CREATE INDEX idx_factura_items_factura ON factura_items(factura_id);`,

];

export async function up(knex) {
  for (const sql of SENTENCIAS) {
    await knex.raw(sql)
  }
}

export async function down(knex) {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0')
  for (const t of ['factura_items', 'facturas', 'configuracion', 'nfc_secuencias', 'articulo_precios', 'articulos', 'unidades_medida', 'tipos_servicio', 'categorias', 'metodos_pago', 'clientes', 'empresas', 'usuarios', 'roles']) {
    await knex.schema.dropTableIfExists(t)
  }
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1')
}
