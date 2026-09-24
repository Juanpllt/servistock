import type pg from "pg";
import { crearStockBajo, type NotificacionCreada } from "../repositories/notificacion.repository.js";
import { emitir } from "../realtime/socket.js";

export interface ProductoActualizado {
  id: number;
  nombre: string;
  stockActual: number;
  cantidadMinimaStock: number;
}

/**
 * RF-56: crea una notificación por cada producto cuyo stock resultante sea menor o igual a su mínimo.
 * Se ejecuta dentro de la misma transacción del movimiento.
 */
export async function notificarStockBajo(
  cliente: pg.PoolClient,
  productos: ProductoActualizado[]
): Promise<NotificacionCreada[]> {
  const notificaciones: NotificacionCreada[] = [];

  for (const producto of productos) {
    if (producto.stockActual <= producto.cantidadMinimaStock) {
      notificaciones.push(await crearStockBajo(cliente, producto));
    }
  }

  return notificaciones;
}

/** Publica los nuevos niveles de stock. Solo debe llamarse DESPUÉS del COMMIT (decisión transversal). */
export function publicarStock(productos: ProductoActualizado[]): void {
  if (productos.length > 0) {
    emitir("stock:actualizado", productos);
  }
}
