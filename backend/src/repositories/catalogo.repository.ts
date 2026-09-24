import { pool } from "../config/db.js";

/** Tablas de catálogo permitidas (constantes internas, nunca provienen del usuario). */
export type TablaCatalogo =
  | "categorias_producto"
  | "tipos_entrada"
  | "tipos_empleado_proyecto"
  | "tipos_notificacion_producto"
  | "tipos_notificacion_pedido"
  | "tipos_estado"
  | "roles";

export interface ItemCatalogo {
  id: number;
  nombre: string;
}

export async function listarCatalogo(tabla: TablaCatalogo): Promise<ItemCatalogo[]> {
  const { rows } = await pool.query<ItemCatalogo>(`SELECT id, nombre FROM ${tabla} ORDER BY id`);
  return rows;
}

export async function crearCatalogo(tabla: TablaCatalogo, nombre: string): Promise<ItemCatalogo> {
  const { rows } = await pool.query<ItemCatalogo>(
    `INSERT INTO ${tabla} (nombre) VALUES ($1) RETURNING id, nombre`,
    [nombre]
  );

  return rows[0] as ItemCatalogo;
}

export async function editarCatalogo(
  tabla: TablaCatalogo,
  id: number,
  nombre: string
): Promise<ItemCatalogo | null> {
  const { rows } = await pool.query<ItemCatalogo>(
    `UPDATE ${tabla} SET nombre = $2 WHERE id = $1 RETURNING id, nombre`,
    [id, nombre]
  );

  return rows[0] ?? null;
}
