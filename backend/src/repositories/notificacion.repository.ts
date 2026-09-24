import { pool, type Ejecutor } from "../config/db.js";

export const TIPO_NOTIF_PRODUCTO = { STOCK_BAJO: 1 } as const;
export const TIPO_NOTIF_PEDIDO = { CREACION: 1, CAMBIO_ESTADO: 2 } as const;

/** Notificación ya persistida, lista para publicarse por Socket.IO tras el COMMIT. */
export interface NotificacionCreada {
  tipo: "producto" | "pedido";
  id: number;
  referenciaId: number;
  mensaje: string;
}

export interface Notificacion extends NotificacionCreada {
  fecha: string;
  leida: boolean;
  categoria: string;
}

export async function crearStockBajo(
  db: Ejecutor,
  producto: { id: number; nombre: string; stockActual: number; cantidadMinimaStock: number }
): Promise<NotificacionCreada> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO notificaciones_producto (producto_id, tipo_notificacion_producto_id)
     VALUES ($1, $2) RETURNING id`,
    [producto.id, TIPO_NOTIF_PRODUCTO.STOCK_BAJO]
  );

  return {
    tipo: "producto",
    id: rows[0]?.id ?? 0,
    referenciaId: producto.id,
    mensaje: `Stock bajo: ${producto.nombre} tiene ${producto.stockActual} unidades (mínimo ${producto.cantidadMinimaStock})`
  };
}

export async function crearNotificacionPedido(
  db: Ejecutor,
  pedidoId: number,
  tipoId: number,
  mensaje: string
): Promise<NotificacionCreada> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO notificaciones_pedido (pedido_id, tipo_notificacion_pedido_id)
     VALUES ($1, $2) RETURNING id`,
    [pedidoId, tipoId]
  );

  return { tipo: "pedido", id: rows[0]?.id ?? 0, referenciaId: pedidoId, mensaje };
}

/** RF-59: notificaciones de producto y de pedido juntas, ordenadas por fecha (más recientes primero). */
export async function listarNotificaciones(soloNoLeidas: boolean): Promise<Notificacion[]> {
  const filtro = soloNoLeidas ? "WHERE n.leida = FALSE" : "";

  const { rows } = await pool.query<Notificacion>(
    `SELECT * FROM (
       SELECT 'producto' AS tipo, n.id, n.producto_id AS "referenciaId", n.fecha, n.leida,
              t.nombre AS categoria,
              'Stock bajo: ' || p.nombre || ' tiene ' || p.stock_actual || ' unidades (mínimo '
                || p.cantidad_minima_stock || ')' AS mensaje
       FROM notificaciones_producto n
       JOIN tipos_notificacion_producto t ON t.id = n.tipo_notificacion_producto_id
       JOIN productos p ON p.id = n.producto_id ${filtro}
       UNION ALL
       SELECT 'pedido', n.id, n.pedido_id, n.fecha, n.leida, t.nombre,
              'Pedido #' || n.pedido_id || ' (' || pe.proveedor || '): ' || LOWER(t.nombre) AS mensaje
       FROM notificaciones_pedido n
       JOIN tipos_notificacion_pedido t ON t.id = n.tipo_notificacion_pedido_id
       JOIN pedidos pe ON pe.id = n.pedido_id ${filtro}
     ) todas ORDER BY fecha DESC, id DESC LIMIT 200`
  );

  return rows;
}

export async function contarNoLeidas(): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT ((SELECT COUNT(*) FROM notificaciones_producto WHERE leida = FALSE)
           + (SELECT COUNT(*) FROM notificaciones_pedido WHERE leida = FALSE))::int AS total`
  );

  return rows[0]?.total ?? 0;
}

export async function marcarLeida(tipo: "producto" | "pedido", id: number): Promise<boolean> {
  const tabla = tipo === "producto" ? "notificaciones_producto" : "notificaciones_pedido";
  const { rowCount } = await pool.query(`UPDATE ${tabla} SET leida = TRUE WHERE id = $1`, [id]);

  return (rowCount ?? 0) > 0;
}
