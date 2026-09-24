import { pool, type Ejecutor } from "../config/db.js";
import { conflicto, noEncontrado } from "../errors.js";

/** IDs fijos del catálogo TipoEstado (ver schema.sql). La lógica usa el id, no el nombre. */
export const ESTADO = {
  EN_ESPERA: 1,
  EN_CURSO: 2,
  COMPLETADO: 3,
  CANCELADO: 4
} as const;

export type Entidad =
  | "pedido"
  | "entrada"
  | "entrada_producto"
  | "salida"
  | "salida_producto"
  | "proyecto";

const TABLAS: Record<Entidad, { tabla: string; fk: string; padre: string; etiqueta: string }> = {
  pedido: { tabla: "estado_pedido", fk: "pedido_id", padre: "pedidos", etiqueta: "Pedido" },
  entrada: { tabla: "estado_entrada", fk: "entrada_id", padre: "entradas", etiqueta: "Entrada" },
  entrada_producto: {
    tabla: "estado_entrada_producto",
    fk: "entrada_producto_id",
    padre: "entrada_productos",
    etiqueta: "Línea de entrada"
  },
  salida: { tabla: "estado_salida", fk: "salida_id", padre: "salidas", etiqueta: "Salida" },
  salida_producto: {
    tabla: "estado_salida_producto",
    fk: "salida_producto_id",
    padre: "salida_productos",
    etiqueta: "Línea de salida"
  },
  proyecto: { tabla: "estado_proyecto", fk: "proyecto_id", padre: "proyectos", etiqueta: "Proyecto" }
};

/** Lanza 404 si el registro no existe. */
export async function exigirEntidad(db: Ejecutor, entidad: Entidad, id: number): Promise<void> {
  const { padre, etiqueta } = TABLAS[entidad];
  const { rowCount } = await db.query(`SELECT 1 FROM ${padre} WHERE id = $1`, [id]);

  if (!rowCount) {
    throw noEncontrado(etiqueta);
  }
}

/**
 * Subconsulta SQL con el estado actual de una entidad (RN-04): el registro más reciente.
 * `columna` = "id" o "nombre" del TipoEstado; `alias` = alias de la tabla padre en el FROM.
 */
export function sqlEstadoActual(entidad: Entidad, alias: string, columna: "id" | "nombre" = "nombre") {
  const { tabla, fk } = TABLAS[entidad];

  // Alias internos con prefijo propio: no pueden chocar con el alias de la tabla padre (p. ej. "e" en entradas)
  return `(SELECT est_te.${columna} FROM ${tabla} est_h JOIN tipos_estado est_te ON est_te.id = est_h.tipo_estado_id
           WHERE est_h.${fk} = ${alias}.id ORDER BY est_h.fecha_cambio DESC, est_h.id DESC LIMIT 1)`;
}

/** RF-21/27/28/37/44/48: valida que el valor pertenezca al catálogo y devuelve su nombre. */
export async function validarTipoEstado(db: Ejecutor, tipoEstadoId: number): Promise<string> {
  const { rows } = await db.query<{ nombre: string }>("SELECT nombre FROM tipos_estado WHERE id = $1", [
    tipoEstadoId
  ]);

  if (!rows[0]) {
    throw conflicto("El estado indicado no pertenece al catálogo de estados");
  }

  return rows[0].nombre;
}

/**
 * RN-02/RN-03: cambio de estado siempre manual y sin validar el estado de los hijos.
 * Registra el nuevo estado con la fecha actual y devuelve el nombre del estado.
 */
export async function cambiarEstado(
  db: Ejecutor,
  entidad: Entidad,
  id: number,
  tipoEstadoId: number
): Promise<string> {
  await exigirEntidad(db, entidad, id);
  const nombre = await validarTipoEstado(db, tipoEstadoId);
  await registrarEstado(db, entidad, id, tipoEstadoId);
  return nombre;
}

export async function registrarEstado(
  db: Ejecutor,
  entidad: Entidad,
  id: number,
  tipoEstadoId: number
): Promise<void> {
  const { tabla, fk } = TABLAS[entidad];

  await db.query(`INSERT INTO ${tabla} (${fk}, tipo_estado_id) VALUES ($1, $2)`, [id, tipoEstadoId]);
}

export async function estadoActualId(db: Ejecutor, entidad: Entidad, id: number): Promise<number> {
  const { rows } = await db.query<{ estado: number | null }>(
    `SELECT ${sqlEstadoActual(entidad, "x", "id")} AS estado FROM (SELECT $1::int AS id) x`,
    [id]
  );

  const estado = rows[0]?.estado;

  if (estado == null) {
    throw noEncontrado("Registro");
  }

  return estado;
}

export interface CambioEstado {
  id: number;
  tipoEstadoId: number;
  estado: string;
  fechaCambio: string;
}

/** Historial completo de cambios de estado, del más antiguo al más reciente (RF-49, 51, 53, 55). */
export async function historialEstados(
  entidad: Entidad,
  id: number,
  db: Ejecutor = pool
): Promise<CambioEstado[]> {
  const { tabla, fk } = TABLAS[entidad];
  const { rows } = await db.query<CambioEstado>(
    `SELECT e.id, e.tipo_estado_id AS "tipoEstadoId", te.nombre AS estado, e.fecha_cambio AS "fechaCambio"
     FROM ${tabla} e JOIN tipos_estado te ON te.id = e.tipo_estado_id
     WHERE e.${fk} = $1 ORDER BY e.fecha_cambio, e.id`,
    [id]
  );

  return rows;
}
