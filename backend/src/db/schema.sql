CREATE TABLE IF NOT EXISTS roles (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  rol_id        INTEGER NOT NULL REFERENCES roles(id),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (nombre) VALUES ('Administrador'), ('Empleado')
ON CONFLICT (nombre) DO NOTHING;

-- No se siembran cuentas: el primer Administrador se crea al arrancar con ADMIN_EMAIL y ADMIN_PASSWORD
-- (ver db/administrador-inicial.ts). Nunca se guardan contraseñas ni hashes en el código.

-- ============================================================================
-- Modelo de dominio de Servistock (documento de requisitos, sección 3).
-- "usuarios" / "roles" cumplen el papel de Empleado / TipoEmpleado.
-- ============================================================================

-- Catálogos ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categorias_producto (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_entrada (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_empleado_proyecto (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_notificacion_producto (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_notificacion_pedido (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_estado (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE
);

-- IDs fijos: la lógica del sistema usa el id (no el nombre), así el catálogo se puede renombrar (RF-64)
INSERT INTO tipos_estado (id, nombre) VALUES (1, 'En espera'), (2, 'En curso'), (3, 'Completado'), (4, 'Cancelado')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('tipos_estado', 'id'), GREATEST((SELECT MAX(id) FROM tipos_estado), 4));

INSERT INTO tipos_entrada (nombre) VALUES ('Compra'), ('Ajuste por descuadre'), ('Devolución')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO tipos_empleado_proyecto (nombre) VALUES ('Líder'), ('Técnico'), ('Apoyo')
ON CONFLICT (nombre) DO NOTHING;

-- IDs fijos también aquí: 1 = Stock bajo | 1 = Creación, 2 = Cambio de estado
INSERT INTO tipos_notificacion_producto (id, nombre) VALUES (1, 'Stock bajo')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('tipos_notificacion_producto', 'id'), GREATEST((SELECT MAX(id) FROM tipos_notificacion_producto), 1));

INSERT INTO tipos_notificacion_pedido (id, nombre) VALUES (1, 'Creación'), (2, 'Cambio de estado')
ON CONFLICT DO NOTHING;
SELECT setval(pg_get_serial_sequence('tipos_notificacion_pedido', 'id'), GREATEST((SELECT MAX(id) FROM tipos_notificacion_pedido), 2));

-- Productos ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id                    SERIAL PRIMARY KEY,
  nombre                VARCHAR(150) NOT NULL,
  categoria_id          INTEGER NOT NULL REFERENCES categorias_producto(id),
  codigo_qr_barras      VARCHAR(100) NOT NULL UNIQUE,
  cantidad_minima_stock INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_minima_stock >= 0),
  -- Stock persistido: se actualiza en la misma transacción del movimiento (ADR-006)
  stock_actual          INTEGER NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (LOWER(nombre));
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria_id);

-- Pedidos y entradas ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id          SERIAL PRIMARY KEY,
  proveedor   VARCHAR(150) NOT NULL,
  empleado_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RN-01: toda entrada pertenece a exactamente un pedido (FK obligatoria, ADR-015)
CREATE TABLE IF NOT EXISTS entradas (
  id              SERIAL PRIMARY KEY,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empleado_id     INTEGER NOT NULL REFERENCES usuarios(id),
  pedido_id       INTEGER NOT NULL REFERENCES pedidos(id),
  tipo_entrada_id INTEGER NOT NULL REFERENCES tipos_entrada(id)
);

CREATE INDEX IF NOT EXISTS idx_entradas_pedido ON entradas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_entradas_fecha ON entradas (fecha);

CREATE TABLE IF NOT EXISTS entrada_productos (
  id          SERIAL PRIMARY KEY,
  entrada_id  INTEGER NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS idx_entrada_productos_entrada ON entrada_productos (entrada_id);
CREATE INDEX IF NOT EXISTS idx_entrada_productos_producto ON entrada_productos (producto_id);

-- Proyectos y salidas --------------------------------------------------------
CREATE TABLE IF NOT EXISTS proyectos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proyectos_nombre ON proyectos (LOWER(nombre));

CREATE TABLE IF NOT EXISTS empleado_proyecto (
  id                        SERIAL PRIMARY KEY,
  empleado_id               INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  proyecto_id               INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  tipo_empleado_proyecto_id INTEGER NOT NULL REFERENCES tipos_empleado_proyecto(id),
  UNIQUE (empleado_id, proyecto_id)
);

-- RN-14: toda salida pertenece obligatoriamente a un proyecto
CREATE TABLE IF NOT EXISTS salidas (
  id          SERIAL PRIMARY KEY,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
  empleado_id INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE INDEX IF NOT EXISTS idx_salidas_proyecto ON salidas (proyecto_id);
CREATE INDEX IF NOT EXISTS idx_salidas_fecha ON salidas (fecha);

CREATE TABLE IF NOT EXISTS salida_productos (
  id          SERIAL PRIMARY KEY,
  salida_id   INTEGER NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0)
);

CREATE INDEX IF NOT EXISTS idx_salida_productos_salida ON salida_productos (salida_id);
CREATE INDEX IF NOT EXISTS idx_salida_productos_producto ON salida_productos (producto_id);

-- Historial de estados (RN-02 a RN-04) ---------------------------------------
-- El estado actual de una entidad es su registro con la fecha más reciente.
CREATE TABLE IF NOT EXISTS estado_pedido (
  id             SERIAL PRIMARY KEY,
  pedido_id      INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo_estado_id INTEGER NOT NULL REFERENCES tipos_estado(id),
  fecha_cambio   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS estado_entrada (
  id             SERIAL PRIMARY KEY,
  entrada_id     INTEGER NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
  tipo_estado_id INTEGER NOT NULL REFERENCES tipos_estado(id),
  fecha_cambio   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS estado_entrada_producto (
  id                  SERIAL PRIMARY KEY,
  entrada_producto_id INTEGER NOT NULL REFERENCES entrada_productos(id) ON DELETE CASCADE,
  tipo_estado_id      INTEGER NOT NULL REFERENCES tipos_estado(id),
  fecha_cambio        TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS estado_salida (
  id             SERIAL PRIMARY KEY,
  salida_id      INTEGER NOT NULL REFERENCES salidas(id) ON DELETE CASCADE,
  tipo_estado_id INTEGER NOT NULL REFERENCES tipos_estado(id),
  fecha_cambio   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS estado_salida_producto (
  id                 SERIAL PRIMARY KEY,
  salida_producto_id INTEGER NOT NULL REFERENCES salida_productos(id) ON DELETE CASCADE,
  tipo_estado_id     INTEGER NOT NULL REFERENCES tipos_estado(id),
  fecha_cambio       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS estado_proyecto (
  id             SERIAL PRIMARY KEY,
  proyecto_id    INTEGER NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  tipo_estado_id INTEGER NOT NULL REFERENCES tipos_estado(id),
  fecha_cambio   TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_estado_pedido ON estado_pedido (pedido_id, fecha_cambio DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_estado_entrada ON estado_entrada (entrada_id, fecha_cambio DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_estado_entrada_producto ON estado_entrada_producto (entrada_producto_id, fecha_cambio DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_estado_salida ON estado_salida (salida_id, fecha_cambio DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_estado_salida_producto ON estado_salida_producto (salida_producto_id, fecha_cambio DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_estado_proyecto ON estado_proyecto (proyecto_id, fecha_cambio DESC, id DESC);

-- Notificaciones -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones_producto (
  id                            SERIAL PRIMARY KEY,
  producto_id                   INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo_notificacion_producto_id INTEGER NOT NULL REFERENCES tipos_notificacion_producto(id),
  fecha                         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leida                         BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS notificaciones_pedido (
  id                          SERIAL PRIMARY KEY,
  pedido_id                   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo_notificacion_pedido_id INTEGER NOT NULL REFERENCES tipos_notificacion_pedido(id),
  fecha                       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leida                       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_notif_producto_fecha ON notificaciones_producto (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_notif_pedido_fecha ON notificaciones_pedido (fecha DESC);
