import { pool, type Ejecutor } from "../config/db.js";
import { sqlEstadoActual } from "./estado.repository.js";

export interface Proyecto {
  id: number;
  nombre: string;
  descripcion: string;
  creadoEn: string;
  estadoId: number | null;
  estado: string | null;
  totalEmpleados: number;
}

const SELECT_PROYECTO = `
  SELECT p.id, p.nombre, p.descripcion, p.creado_en AS "creadoEn",
         ${sqlEstadoActual("proyecto", "p", "id")} AS "estadoId",
         ${sqlEstadoActual("proyecto", "p")} AS estado,
         (SELECT COUNT(*)::int FROM empleado_proyecto ep WHERE ep.proyecto_id = p.id) AS "totalEmpleados"
  FROM proyectos p
`;

export async function listarProyectos(filtro: {
  estadoId?: number | undefined;
  nombre?: string | undefined;
}): Promise<Proyecto[]> {
  const condiciones: string[] = [];
  const valores: unknown[] = [];

  if (filtro.estadoId) {
    valores.push(filtro.estadoId);
    condiciones.push(`${sqlEstadoActual("proyecto", "p", "id")} = $${valores.length}`);
  }

  if (filtro.nombre) {
    valores.push(filtro.nombre);
    condiciones.push(`position(LOWER($${valores.length}::text) in LOWER(p.nombre)) > 0`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await pool.query<Proyecto>(`${SELECT_PROYECTO} ${where} ORDER BY p.id DESC`, valores);

  return rows;
}

export async function buscarProyecto(id: number, db: Ejecutor = pool): Promise<Proyecto | null> {
  const { rows } = await db.query<Proyecto>(`${SELECT_PROYECTO} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function insertarProyecto(db: Ejecutor, nombre: string, descripcion: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    "INSERT INTO proyectos (nombre, descripcion) VALUES ($1, $2) RETURNING id",
    [nombre, descripcion]
  );

  return rows[0]?.id ?? 0;
}

export async function actualizarProyecto(id: number, nombre: string, descripcion: string): Promise<void> {
  await pool.query("UPDATE proyectos SET nombre = $2, descripcion = $3 WHERE id = $1", [id, nombre, descripcion]);
}

export interface EmpleadoAsignado {
  empleadoId: number;
  nombre: string;
  email: string;
  tipoParticipacionId: number;
  tipoParticipacion: string;
}

export async function empleadosDeProyecto(id: number): Promise<EmpleadoAsignado[]> {
  const { rows } = await pool.query<EmpleadoAsignado>(
    `SELECT u.id AS "empleadoId", u.nombre, u.email, t.id AS "tipoParticipacionId", t.nombre AS "tipoParticipacion"
     FROM empleado_proyecto ep
     JOIN usuarios u ON u.id = ep.empleado_id
     JOIN tipos_empleado_proyecto t ON t.id = ep.tipo_empleado_proyecto_id
     WHERE ep.proyecto_id = $1 ORDER BY u.nombre`,
    [id]
  );

  return rows;
}

export async function asignarEmpleado(proyectoId: number, empleadoId: number, tipoId: number): Promise<void> {
  await pool.query(
    "INSERT INTO empleado_proyecto (proyecto_id, empleado_id, tipo_empleado_proyecto_id) VALUES ($1, $2, $3)",
    [proyectoId, empleadoId, tipoId]
  );
}

export async function modificarAsignacion(
  proyectoId: number,
  empleadoId: number,
  tipoId: number
): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE empleado_proyecto SET tipo_empleado_proyecto_id = $3 WHERE proyecto_id = $1 AND empleado_id = $2",
    [proyectoId, empleadoId, tipoId]
  );

  return (rowCount ?? 0) > 0;
}

export async function retirarEmpleado(proyectoId: number, empleadoId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    "DELETE FROM empleado_proyecto WHERE proyecto_id = $1 AND empleado_id = $2",
    [proyectoId, empleadoId]
  );

  return (rowCount ?? 0) > 0;
}

export interface SalidaDeProyecto {
  id: number;
  fecha: string;
  empleado: string;
  estado: string | null;
  totalLineas: number;
}

export async function salidasDeProyecto(id: number): Promise<SalidaDeProyecto[]> {
  const { rows } = await pool.query<SalidaDeProyecto>(
    `SELECT s.id, s.fecha, u.nombre AS empleado, ${sqlEstadoActual("salida", "s")} AS estado,
            (SELECT COUNT(*)::int FROM salida_productos l WHERE l.salida_id = s.id) AS "totalLineas"
     FROM salidas s JOIN usuarios u ON u.id = s.empleado_id
     WHERE s.proyecto_id = $1 ORDER BY s.fecha DESC, s.id DESC`,
    [id]
  );

  return rows;
}

export interface ConsumoProducto {
  productoId: number;
  producto: string;
  codigoQrBarras: string;
  cantidadTotal: number;
}

/** RF-42: suma las cantidades de todas las líneas de salida del proyecto, por producto. */
export async function consumoPorProducto(id: number): Promise<ConsumoProducto[]> {
  const { rows } = await pool.query<ConsumoProducto>(
    `SELECT p.id AS "productoId", p.nombre AS producto, p.codigo_qr_barras AS "codigoQrBarras",
            SUM(l.cantidad)::int AS "cantidadTotal"
     FROM salida_productos l
     JOIN salidas s ON s.id = l.salida_id
     JOIN productos p ON p.id = l.producto_id
     WHERE s.proyecto_id = $1 GROUP BY p.id, p.nombre, p.codigo_qr_barras ORDER BY p.nombre`,
    [id]
  );

  return rows;
}
