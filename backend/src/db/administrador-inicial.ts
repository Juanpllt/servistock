import bcrypt from "bcryptjs";
import type { Ejecutor } from "../config/db.js";

export interface ConfigAdministrador {
  nombre?: string | undefined;
  email?: string | undefined;
  password?: string | undefined;
}

export type ResultadoAdministrador = "creado" | "existente" | "sin-configuracion" | "datos-invalidos";

const MIN_PASSWORD = 8;

/**
 * Crea el primer Administrador SOLO si todavía no hay ningún usuario, tomando sus datos de las variables de
 * entorno ADMIN_EMAIL y ADMIN_PASSWORD. Así ninguna contraseña (ni su hash) queda escrita en el código ni
 * existen cuentas de ejemplo conocidas por todos en producción.
 */
export async function crearAdministradorInicial(
  db: Ejecutor,
  { nombre = "Administrador", email, password }: ConfigAdministrador
): Promise<ResultadoAdministrador> {
  const { rows } = await db.query<{ total: number }>("SELECT COUNT(*)::int AS total FROM usuarios");

  if ((rows[0]?.total ?? 0) > 0) {
    return "existente";
  }

  if (!email || !password) {
    return "sin-configuracion";
  }

  const correo = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || password.length < MIN_PASSWORD) {
    return "datos-invalidos";
  }

  await db.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol_id)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE nombre = 'Administrador'))`,
    [nombre.trim() || "Administrador", correo, await bcrypt.hash(password, 10)]
  );

  return "creado";
}
