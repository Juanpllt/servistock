import { pool } from "../config/db.js";

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  passwordHash: string;
  rol: string;
  activo: boolean;
}

const SELECT_USUARIO = `
  SELECT u.id, u.nombre, u.email, u.password_hash AS "passwordHash",
         r.nombre AS rol, u.activo
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
`;

export async function buscarPorEmail(email: string): Promise<Usuario | null> {
  const { rows } = await pool.query<Usuario>(`${SELECT_USUARIO} WHERE u.email = $1`, [email]);
  return rows[0] ?? null;
}

export async function buscarPorId(id: number): Promise<Usuario | null> {
  const { rows } = await pool.query<Usuario>(`${SELECT_USUARIO} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}
