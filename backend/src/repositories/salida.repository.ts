import { pool, type Ejecutor } from "../config/db.js";
import { sqlEstadoActual } from "./estado.repository.js";
import { condicionesRango, type Rango } from "./rango.js";

export interface Salida {
  id: number;
  fecha: string;
  proyectoId: number;
  proyecto: string;
  empleadoId: number;
  empleado: string;
  estadoId: number | null;
  estado: string | null;
  totalLineas: number;
}

export interface LineaSalida {
  id: number;
  salidaId: number;
  productoId: number;
  producto: string;
  codigoQrBarras: string;
  cantidad: number;
  estadoId: number | null;
  estado: string | null;
}

const SELECT_SALIDA = `
  SELECT s.id, s.fecha, s.proyecto_id AS "proyectoId", pr.nombre AS proyecto,
         s.empleado_id AS "empleadoId", u.nombre AS empleado,
         ${sqlEstadoActual("salida", "s", "id")} AS "estadoId",
         ${sqlEstadoActual("salida", "s")} AS estado,
         (SELECT COUNT(*)::int FROM salida_productos l WHERE l.salida_id = s.id) AS "totalLineas"
  FROM salidas s
  JOIN proyectos pr ON pr.id = s.proyecto_id
  JOIN usuarios u ON u.id = s.empleado_id
`;

export async function listarSalidas(estadoId?: number, rango?: Rango): Promise<Salida[]> {
  const valores: unknown[] = [];
  const condiciones: string[] = [];

  if (estadoId) {
    valores.push(estadoId);
    condiciones.push(`${sqlEstadoActual("salida", "s", "id")} = $${valores.length}`);
  }

  condiciones.push(...condicionesRango("s.fecha", rango, valores));

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await pool.query<Salida>(
    `${SELECT_SALIDA} ${where} ORDER BY s.fecha DESC, s.id DESC`,
    valores
  );

  return rows;
}

export async function buscarSalida(id: number, db: Ejecutor = pool): Promise<Salida | null> {
  const { rows } = await db.query<Salida>(`${SELECT_SALIDA} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function lineasDeSalida(id: number, db: Ejecutor = pool): Promise<LineaSalida[]> {
  const { rows } = await db.query<LineaSalida>(
    `SELECT l.id, l.salida_id AS "salidaId", l.producto_id AS "productoId", p.nombre AS producto,
            p.codigo_qr_barras AS "codigoQrBarras", l.cantidad,
            ${sqlEstadoActual("salida_producto", "l", "id")} AS "estadoId",
            ${sqlEstadoActual("salida_producto", "l")} AS estado
     FROM salida_productos l JOIN productos p ON p.id = l.producto_id
     WHERE l.salida_id = $1 ORDER BY l.id`,
    [id]
  );

  return rows;
}

export async function insertarSalida(db: Ejecutor, empleadoId: number, proyectoId: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO salidas (empleado_id, proyecto_id) VALUES ($1, $2) RETURNING id",
    [empleadoId, proyectoId]
  );

  return rows[0]?.id ?? 0;
}

export async function insertarLineaSalida(
  db: Ejecutor,
  salidaId: number,
  productoId: number,
  cantidad: number
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO salida_productos (salida_id, producto_id, cantidad) VALUES ($1, $2, $3) RETURNING id",
    [salidaId, productoId, cantidad]
  );

  return rows[0]?.id ?? 0;
}

export async function actualizarProyectoSalida(db: Ejecutor, id: number, proyectoId: number): Promise<void> {
  await db.query("UPDATE salidas SET proyecto_id = $2 WHERE id = $1", [id, proyectoId]);
}

export interface LineaSalidaBloqueada {
  id: number;
  productoId: number;
  cantidad: number;
  estadoId: number | null;
}

/** Bloquea la línea (FOR UPDATE) verificando que pertenezca a la salida indicada. */
export async function bloquearLineaSalida(
  db: Ejecutor,
  salidaId: number,
  lineaId: number
): Promise<LineaSalidaBloqueada | null> {
  const { rows } = await db.query<LineaSalidaBloqueada>(
    `SELECT l.id, l.producto_id AS "productoId", l.cantidad,
            ${sqlEstadoActual("salida_producto", "l", "id")} AS "estadoId"
     FROM salida_productos l WHERE l.id = $2 AND l.salida_id = $1 FOR UPDATE`,
    [salidaId, lineaId]
  );

  return rows[0] ?? null;
}

export async function actualizarCantidadLineaSalida(
  db: Ejecutor,
  lineaId: number,
  cantidad: number
): Promise<void> {
  await db.query("UPDATE salida_productos SET cantidad = $2 WHERE id = $1", [lineaId, cantidad]);
}
