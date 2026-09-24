import { pool, type Ejecutor } from "../config/db.js";
import { sqlEstadoActual } from "./estado.repository.js";
import { condicionesRango, type Rango } from "./rango.js";

export interface Entrada {
  id: number;
  fecha: string;
  empleadoId: number;
  empleado: string;
  pedidoId: number;
  proveedor: string;
  tipoEntradaId: number;
  tipoEntrada: string;
  estadoId: number | null;
  estado: string | null;
  totalLineas: number;
}

export interface LineaEntrada {
  id: number;
  entradaId: number;
  productoId: number;
  producto: string;
  codigoQrBarras: string;
  cantidad: number;
  estadoId: number | null;
  estado: string | null;
}

const SELECT_ENTRADA = `
  SELECT e.id, e.fecha, e.empleado_id AS "empleadoId", u.nombre AS empleado,
         e.pedido_id AS "pedidoId", pe.proveedor, e.tipo_entrada_id AS "tipoEntradaId", t.nombre AS "tipoEntrada",
         ${sqlEstadoActual("entrada", "e", "id")} AS "estadoId",
         ${sqlEstadoActual("entrada", "e")} AS estado,
         (SELECT COUNT(*)::int FROM entrada_productos l WHERE l.entrada_id = e.id) AS "totalLineas"
  FROM entradas e
  JOIN usuarios u ON u.id = e.empleado_id
  JOIN pedidos pe ON pe.id = e.pedido_id
  JOIN tipos_entrada t ON t.id = e.tipo_entrada_id
`;

export async function listarEntradas(estadoId?: number, rango?: Rango): Promise<Entrada[]> {
  const valores: unknown[] = [];
  const condiciones: string[] = [];

  if (estadoId) {
    valores.push(estadoId);
    condiciones.push(`${sqlEstadoActual("entrada", "e", "id")} = $${valores.length}`);
  }

  condiciones.push(...condicionesRango("e.fecha", rango, valores));

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await pool.query<Entrada>(
    `${SELECT_ENTRADA} ${where} ORDER BY e.fecha DESC, e.id DESC`,
    valores
  );

  return rows;
}

export async function buscarEntrada(id: number, db: Ejecutor = pool): Promise<Entrada | null> {
  const { rows } = await db.query<Entrada>(`${SELECT_ENTRADA} WHERE e.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function lineasDeEntrada(id: number, db: Ejecutor = pool): Promise<LineaEntrada[]> {
  const { rows } = await db.query<LineaEntrada>(
    `SELECT l.id, l.entrada_id AS "entradaId", l.producto_id AS "productoId", p.nombre AS producto,
            p.codigo_qr_barras AS "codigoQrBarras", l.cantidad,
            ${sqlEstadoActual("entrada_producto", "l", "id")} AS "estadoId",
            ${sqlEstadoActual("entrada_producto", "l")} AS estado
     FROM entrada_productos l JOIN productos p ON p.id = l.producto_id
     WHERE l.entrada_id = $1 ORDER BY l.id`,
    [id]
  );

  return rows;
}

export async function insertarEntrada(
  db: Ejecutor,
  empleadoId: number,
  pedidoId: number,
  tipoEntradaId: number
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO entradas (empleado_id, pedido_id, tipo_entrada_id) VALUES ($1, $2, $3) RETURNING id",
    [empleadoId, pedidoId, tipoEntradaId]
  );

  return rows[0]?.id ?? 0;
}

export async function insertarLineaEntrada(
  db: Ejecutor,
  entradaId: number,
  productoId: number,
  cantidad: number
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO entrada_productos (entrada_id, producto_id, cantidad) VALUES ($1, $2, $3) RETURNING id",
    [entradaId, productoId, cantidad]
  );

  return rows[0]?.id ?? 0;
}

export async function actualizarEncabezadoEntrada(
  db: Ejecutor,
  id: number,
  pedidoId: number,
  tipoEntradaId: number
): Promise<void> {
  await db.query("UPDATE entradas SET pedido_id = $2, tipo_entrada_id = $3 WHERE id = $1", [
    id,
    pedidoId,
    tipoEntradaId
  ]);
}

export interface LineaBloqueada {
  id: number;
  productoId: number;
  cantidad: number;
  estadoId: number | null;
}

/** Bloquea la línea (FOR UPDATE) verificando que pertenezca a la entrada indicada. */
export async function bloquearLineaEntrada(
  db: Ejecutor,
  entradaId: number,
  lineaId: number
): Promise<LineaBloqueada | null> {
  const { rows } = await db.query<LineaBloqueada>(
    `SELECT l.id, l.producto_id AS "productoId", l.cantidad,
            ${sqlEstadoActual("entrada_producto", "l", "id")} AS "estadoId"
     FROM entrada_productos l WHERE l.id = $2 AND l.entrada_id = $1 FOR UPDATE`,
    [entradaId, lineaId]
  );

  return rows[0] ?? null;
}

export async function actualizarCantidadLineaEntrada(
  db: Ejecutor,
  lineaId: number,
  cantidad: number
): Promise<void> {
  await db.query("UPDATE entrada_productos SET cantidad = $2 WHERE id = $1", [lineaId, cantidad]);
}
