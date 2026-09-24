import type pg from "pg";
import { conflicto, solicitudInvalida } from "../errors.js";

export interface ProductoBloqueado {
  id: number;
  nombre: string;
  stockActual: number;
  cantidadMinimaStock: number;
}

/**
 * Bloqueo pesimista de las filas de producto (`FOR UPDATE`) en una sola consulta por lote (ADR-002/003).
 * Se ordenan por id: dos transacciones que tocan los mismos productos los bloquean en el mismo orden,
 * lo que evita deadlocks.
 */
export async function bloquearProductos(
  cliente: pg.PoolClient,
  ids: number[]
): Promise<Map<number, ProductoBloqueado>> {
  const { rows } = await cliente.query<ProductoBloqueado>(
    `SELECT id, nombre, stock_actual AS "stockActual", cantidad_minima_stock AS "cantidadMinimaStock"
     FROM productos WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`,
    [ids]
  );

  if (rows.length !== new Set(ids).size) {
    const existentes = new Set(rows.map((p) => p.id));
    const faltante = ids.find((id) => !existentes.has(id));
    throw solicitudInvalida(`El producto ${faltante} no existe`);
  }

  return new Map(rows.map((p) => [p.id, p]));
}

/** Suma `delta` (positivo o negativo) al stock. La restricción CHECK impide dejarlo en negativo. */
export async function ajustarStock(
  cliente: pg.PoolClient,
  productoId: number,
  delta: number
): Promise<number> {
  try {
    const { rows } = await cliente.query<{ stock: number }>(
      "UPDATE productos SET stock_actual = stock_actual + $2 WHERE id = $1 RETURNING stock_actual AS stock",
      [productoId, delta]
    );

    return rows[0]?.stock ?? 0;
  } catch (error) {
    if ((error as { code?: string }).code === "23514") {
      throw conflicto("Stock insuficiente para completar la operación");
    }

    throw error;
  }
}

export interface AgrupadaLinea {
  productoId: number;
  cantidad: number;
}

/** Une líneas repetidas del mismo producto sumando sus cantidades (una línea por producto). */
export function agruparLineas(lineas: AgrupadaLinea[]): AgrupadaLinea[] {
  const porProducto = new Map<number, number>();

  for (const { productoId, cantidad } of lineas) {
    porProducto.set(productoId, (porProducto.get(productoId) ?? 0) + cantidad);
  }

  return [...porProducto].map(([productoId, cantidad]) => ({ productoId, cantidad }));
}
