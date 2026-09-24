import { pool, type Ejecutor } from "../config/db.js";
import { sqlEstadoActual } from "./estado.repository.js";

export interface Pedido {
  id: number;
  proveedor: string;
  empleadoId: number | null;
  empleado: string | null;
  creadoEn: string;
  estadoId: number | null;
  estado: string | null;
  totalEntradas: number;
}

const SELECT_PEDIDO = `
  SELECT p.id, p.proveedor, p.empleado_id AS "empleadoId", u.nombre AS empleado, p.creado_en AS "creadoEn",
         ${sqlEstadoActual("pedido", "p", "id")} AS "estadoId",
         ${sqlEstadoActual("pedido", "p")} AS estado,
         (SELECT COUNT(*)::int FROM entradas e WHERE e.pedido_id = p.id) AS "totalEntradas"
  FROM pedidos p LEFT JOIN usuarios u ON u.id = p.empleado_id
`;

export async function listarPedidos(estadoId?: number, db: Ejecutor = pool): Promise<Pedido[]> {
  const filtro = estadoId ? `WHERE ${sqlEstadoActual("pedido", "p", "id")} = $1` : "";
  const { rows } = await db.query<Pedido>(
    `${SELECT_PEDIDO} ${filtro} ORDER BY p.id DESC`,
    estadoId ? [estadoId] : []
  );

  return rows;
}

export async function buscarPedido(id: number, db: Ejecutor = pool): Promise<Pedido | null> {
  const { rows } = await db.query<Pedido>(`${SELECT_PEDIDO} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertarPedido(db: Ejecutor, proveedor: string, empleadoId: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO pedidos (proveedor, empleado_id) VALUES ($1, $2) RETURNING id",
    [proveedor, empleadoId]
  );

  return rows[0]?.id ?? 0;
}

export async function actualizarPedido(id: number, proveedor: string): Promise<void> {
  await pool.query("UPDATE pedidos SET proveedor = $2 WHERE id = $1", [id, proveedor]);
}

export interface EntradaResumen {
  id: number;
  fecha: string;
  tipoEntrada: string;
  estado: string | null;
}

export async function entradasDePedido(id: number): Promise<EntradaResumen[]> {
  const { rows } = await pool.query<EntradaResumen>(
    `SELECT e.id, e.fecha, t.nombre AS "tipoEntrada", ${sqlEstadoActual("entrada", "e")} AS estado
     FROM entradas e JOIN tipos_entrada t ON t.id = e.tipo_entrada_id
     WHERE e.pedido_id = $1 ORDER BY e.fecha DESC, e.id DESC`,
    [id]
  );

  return rows;
}
