import { pool } from "../config/db.js";

export interface Producto {
  id: number;
  nombre: string;
  categoriaId: number;
  categoria: string;
  codigoQrBarras: string;
  cantidadMinimaStock: number;
  stockActual: number;
  stockBajo: boolean;
}

const SELECT_PRODUCTO = `
  SELECT p.id, p.nombre, p.categoria_id AS "categoriaId", c.nombre AS categoria,
         p.codigo_qr_barras AS "codigoQrBarras", p.cantidad_minima_stock AS "cantidadMinimaStock",
         p.stock_actual AS "stockActual", (p.stock_actual <= p.cantidad_minima_stock) AS "stockBajo"
  FROM productos p
  JOIN categorias_producto c ON c.id = p.categoria_id
`;

export interface FiltroProductos {
  nombre?: string | undefined;
  categoriaId?: number | undefined;
}

export async function listarProductos({ nombre, categoriaId }: FiltroProductos): Promise<Producto[]> {
  const condiciones: string[] = [];
  const valores: unknown[] = [];

  if (nombre) {
    // position() en vez de ILIKE: el texto buscado no interpreta comodines (% o _)
    valores.push(nombre);
    condiciones.push(`position(LOWER($${valores.length}::text) in LOWER(p.nombre)) > 0`);
  }

  if (categoriaId) {
    valores.push(categoriaId);
    condiciones.push(`p.categoria_id = $${valores.length}`);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const { rows } = await pool.query<Producto>(`${SELECT_PRODUCTO} ${where} ORDER BY p.nombre`, valores);

  return rows;
}

export async function buscarProductoPorId(id: number): Promise<Producto | null> {
  const { rows } = await pool.query<Producto>(`${SELECT_PRODUCTO} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

/** Búsqueda por índice único del código QR/de barras (RNF-02: menos de 1 s). */
export async function buscarProductoPorCodigo(codigo: string): Promise<Producto | null> {
  const { rows } = await pool.query<Producto>(`${SELECT_PRODUCTO} WHERE p.codigo_qr_barras = $1`, [codigo]);
  return rows[0] ?? null;
}

export interface DatosProducto {
  nombre: string;
  categoriaId: number;
  codigoQrBarras: string;
  cantidadMinimaStock: number;
}

export async function crearProducto(datos: DatosProducto): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO productos (nombre, categoria_id, codigo_qr_barras, cantidad_minima_stock)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [datos.nombre, datos.categoriaId, datos.codigoQrBarras, datos.cantidadMinimaStock]
  );

  return rows[0]?.id ?? 0;
}

export async function editarProducto(id: number, datos: DatosProducto): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE productos SET nombre = $2, categoria_id = $3, codigo_qr_barras = $4, cantidad_minima_stock = $5
     WHERE id = $1`,
    [id, datos.nombre, datos.categoriaId, datos.codigoQrBarras, datos.cantidadMinimaStock]
  );

  return (rowCount ?? 0) > 0;
}
