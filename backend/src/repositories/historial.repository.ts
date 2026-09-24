import { pool } from "../config/db.js";
import { sqlEstadoActual } from "./estado.repository.js";
import { condicionesRango, type Rango } from "./rango.js";

export interface PedidoHistorial {
  id: number;
  proveedor: string;
  estado: string | null;
  cambios: { estado: string; fechaCambio: string }[];
}

/**
 * RF-50: pedidos con movimientos (cambios de estado) dentro del rango, junto con esos cambios.
 * Sin rango devuelve todos los pedidos con todo su historial.
 */
export async function historialPedidosPorRango(rango: Rango): Promise<PedidoHistorial[]> {
  const valores: unknown[] = [];
  const enRango = condicionesRango("e.fecha_cambio", rango, valores);
  const condicion = enRango.length ? `AND ${enRango.join(" AND ")}` : "";

  const { rows } = await pool.query<PedidoHistorial>(
    `SELECT p.id, p.proveedor, ${sqlEstadoActual("pedido", "p")} AS estado,
            (SELECT json_agg(json_build_object('estado', te.nombre, 'fechaCambio', e.fecha_cambio)
                             ORDER BY e.fecha_cambio, e.id)
             FROM estado_pedido e JOIN tipos_estado te ON te.id = e.tipo_estado_id
             WHERE e.pedido_id = p.id ${condicion}) AS cambios
     FROM pedidos p
     WHERE EXISTS (SELECT 1 FROM estado_pedido e WHERE e.pedido_id = p.id ${condicion})
     ORDER BY p.id DESC`,
    valores
  );

  return rows;
}
