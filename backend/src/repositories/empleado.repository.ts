import { pool } from "../config/db.js";

export interface Empleado {
  id: number;
  nombre: string;
  email: string;
  rolId: number;
  rol: string;
  activo: boolean;
  creadoEn: string;
}

const SELECT_EMPLEADO = `
  SELECT u.id, u.nombre, u.email, u.rol_id AS "rolId", r.nombre AS rol, u.activo, u.creado_en AS "creadoEn"
  FROM usuarios u JOIN roles r ON r.id = u.rol_id
`;

export async function listarEmpleados(): Promise<Empleado[]> {
  const { rows } = await pool.query<Empleado>(`${SELECT_EMPLEADO} ORDER BY u.nombre`);
  return rows;
}

export async function buscarEmpleado(id: number): Promise<Empleado | null> {
  const { rows } = await pool.query<Empleado>(`${SELECT_EMPLEADO} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function crearEmpleado(datos: {
  nombre: string;
  email: string;
  passwordHash: string;
  rolId: number;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [datos.nombre, datos.email, datos.passwordHash, datos.rolId]
  );

  return rows[0]?.id ?? 0;
}

export async function actualizarEmpleado(
  id: number,
  datos: { nombre: string; email: string; passwordHash?: string | undefined }
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE usuarios SET nombre = $2, email = $3, password_hash = COALESCE($4, password_hash) WHERE id = $1`,
    [id, datos.nombre, datos.email, datos.passwordHash ?? null]
  );

  return (rowCount ?? 0) > 0;
}

export async function cambiarRolEmpleado(id: number, rolId: number): Promise<boolean> {
  const { rowCount } = await pool.query("UPDATE usuarios SET rol_id = $2 WHERE id = $1", [id, rolId]);
  return (rowCount ?? 0) > 0;
}

/** RN-13: baja física del registro. */
export async function eliminarEmpleado(id: number): Promise<boolean> {
  const { rowCount } = await pool.query("DELETE FROM usuarios WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

export async function contarAdministradores(): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM usuarios u JOIN roles r ON r.id = u.rol_id
     WHERE r.nombre = 'Administrador' AND u.activo`
  );

  return rows[0]?.total ?? 0;
}

export interface ProyectoDeEmpleado {
  id: number;
  nombre: string;
  descripcion: string;
  tipoParticipacion: string;
  estado: string | null;
}

/** RF-74: proyectos en los que el empleado tiene una asignación vigente. */
export async function proyectosDeEmpleado(id: number): Promise<ProyectoDeEmpleado[]> {
  const { rows } = await pool.query<ProyectoDeEmpleado>(
    `SELECT p.id, p.nombre, p.descripcion, t.nombre AS "tipoParticipacion",
            (SELECT te.nombre FROM estado_proyecto e JOIN tipos_estado te ON te.id = e.tipo_estado_id
             WHERE e.proyecto_id = p.id ORDER BY e.fecha_cambio DESC, e.id DESC LIMIT 1) AS estado
     FROM empleado_proyecto ep
     JOIN proyectos p ON p.id = ep.proyecto_id
     JOIN tipos_empleado_proyecto t ON t.id = ep.tipo_empleado_proyecto_id
     WHERE ep.empleado_id = $1 ORDER BY p.nombre`,
    [id]
  );

  return rows;
}
