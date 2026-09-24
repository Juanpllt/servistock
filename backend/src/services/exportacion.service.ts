import type { Response } from "express";
import ExcelJS from "exceljs";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { sqlEstadoActual } from "../repositories/estado.repository.js";

const LOTE = 500;
const fecha = (columna: string) => `to_char(${columna} AT TIME ZONE $2, 'YYYY-MM-DD HH24:MI')`;

interface Columna {
  header: string;
  key: string;
  width: number;
}

/**
 * Cada consulta recibe `$1` = última clave leída y `$2` = zona horaria, y devuelve filas ordenadas con
 * una columna `clave`. Así se leen lotes de tamaño fijo (paginación por clave) sin cargar todo en memoria.
 */
interface Definicion {
  archivo: string;
  hoja: string;
  columnas: Columna[];
  sql: string;
}

const DEFINICIONES: Record<string, Definicion> = {
  // RF-67
  pedidos: {
    archivo: "pedidos",
    hoja: "Pedidos",
    columnas: [
      { header: "Pedido", key: "id", width: 10 },
      { header: "Proveedor", key: "proveedor", width: 32 },
      { header: "Creado por", key: "empleado", width: 24 },
      { header: "Fecha de creación", key: "creado", width: 20 },
      { header: "Estado actual", key: "estado", width: 16 },
      { header: "Entradas", key: "entradas", width: 10 },
      { header: "Historial de estados", key: "historial", width: 60 }
    ],
    sql: `SELECT p.id AS clave, p.id, p.proveedor, u.nombre AS empleado, ${fecha("p.creado_en")} AS creado,
            ${sqlEstadoActual("pedido", "p")} AS estado,
            (SELECT COUNT(*)::int FROM entradas e WHERE e.pedido_id = p.id) AS entradas,
            (SELECT string_agg(te.nombre || ' (' || ${fecha("e.fecha_cambio")} || ')', ' → ' ORDER BY e.fecha_cambio, e.id)
             FROM estado_pedido e JOIN tipos_estado te ON te.id = e.tipo_estado_id WHERE e.pedido_id = p.id) AS historial
          FROM pedidos p LEFT JOIN usuarios u ON u.id = p.empleado_id
          WHERE p.id > $1 ORDER BY p.id LIMIT ${LOTE}`
  },
  // RF-68: una fila por línea de producto
  entradas: {
    archivo: "entradas",
    hoja: "Entradas",
    columnas: [
      { header: "Entrada", key: "entrada", width: 10 },
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Pedido", key: "pedido", width: 10 },
      { header: "Proveedor", key: "proveedor", width: 28 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Registrada por", key: "empleado", width: 24 },
      { header: "Estado entrada", key: "estadoEntrada", width: 16 },
      { header: "Producto", key: "producto", width: 32 },
      { header: "Código", key: "codigo", width: 20 },
      { header: "Cantidad", key: "cantidad", width: 10 },
      { header: "Estado línea", key: "estadoLinea", width: 16 }
    ],
    sql: `SELECT l.id AS clave, e.id AS entrada, ${fecha("e.fecha")} AS fecha, e.pedido_id AS pedido,
            pe.proveedor, t.nombre AS tipo, u.nombre AS empleado,
            ${sqlEstadoActual("entrada", "e")} AS "estadoEntrada",
            p.nombre AS producto, p.codigo_qr_barras AS codigo, l.cantidad,
            ${sqlEstadoActual("entrada_producto", "l")} AS "estadoLinea"
          FROM entrada_productos l
          JOIN entradas e ON e.id = l.entrada_id
          JOIN pedidos pe ON pe.id = e.pedido_id
          JOIN tipos_entrada t ON t.id = e.tipo_entrada_id
          JOIN usuarios u ON u.id = e.empleado_id
          JOIN productos p ON p.id = l.producto_id
          WHERE l.id > $1 ORDER BY l.id LIMIT ${LOTE}`
  },
  // RF-69: una fila por línea de producto
  salidas: {
    archivo: "salidas",
    hoja: "Salidas",
    columnas: [
      { header: "Salida", key: "salida", width: 10 },
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Proyecto", key: "proyecto", width: 32 },
      { header: "Registrada por", key: "empleado", width: 24 },
      { header: "Estado salida", key: "estadoSalida", width: 16 },
      { header: "Producto", key: "producto", width: 32 },
      { header: "Código", key: "codigo", width: 20 },
      { header: "Cantidad", key: "cantidad", width: 10 },
      { header: "Estado línea", key: "estadoLinea", width: 16 }
    ],
    sql: `SELECT l.id AS clave, s.id AS salida, ${fecha("s.fecha")} AS fecha, pr.nombre AS proyecto,
            u.nombre AS empleado, ${sqlEstadoActual("salida", "s")} AS "estadoSalida",
            p.nombre AS producto, p.codigo_qr_barras AS codigo, l.cantidad,
            ${sqlEstadoActual("salida_producto", "l")} AS "estadoLinea"
          FROM salida_productos l
          JOIN salidas s ON s.id = l.salida_id
          JOIN proyectos pr ON pr.id = s.proyecto_id
          JOIN usuarios u ON u.id = s.empleado_id
          JOIN productos p ON p.id = l.producto_id
          WHERE l.id > $1 ORDER BY l.id LIMIT ${LOTE}`
  },
  // RF-70: cada proyecto con el detalle agregado de sus salidas (se lee por lotes de proyectos completos)
  proyectos: {
    archivo: "proyectos",
    hoja: "Proyectos",
    columnas: [
      { header: "Proyecto", key: "id", width: 10 },
      { header: "Nombre", key: "nombre", width: 34 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Producto", key: "producto", width: 32 },
      { header: "Código", key: "codigo", width: 20 },
      { header: "Cantidad usada", key: "cantidad", width: 16 }
    ],
    sql: `SELECT p.id AS clave, p.id, p.nombre, ${sqlEstadoActual("proyecto", "p")} AS estado,
            prod.nombre AS producto, prod.codigo_qr_barras AS codigo, SUM(l.cantidad)::int AS cantidad
          FROM proyectos p
          LEFT JOIN salidas s ON s.proyecto_id = p.id
          LEFT JOIN salida_productos l ON l.salida_id = s.id
          LEFT JOIN productos prod ON prod.id = l.producto_id
          WHERE p.id IN (SELECT id FROM proyectos WHERE id > $1 ORDER BY id LIMIT 100)
          GROUP BY p.id, p.nombre, prod.id, prod.nombre, prod.codigo_qr_barras
          ORDER BY p.id, prod.nombre`
  },
  // RF-71: lee el stock persistido, sin recalcular movimientos históricos (ADR-010)
  inventario: {
    archivo: "inventario",
    hoja: "Inventario",
    columnas: [
      { header: "Producto", key: "nombre", width: 34 },
      { header: "Categoría", key: "categoria", width: 22 },
      { header: "Código", key: "codigo", width: 22 },
      { header: "Stock actual", key: "stock", width: 14 },
      { header: "Mínimo", key: "minimo", width: 10 },
      { header: "Situación", key: "situacion", width: 14 }
    ],
    sql: `SELECT p.id AS clave, p.nombre, c.nombre AS categoria, p.codigo_qr_barras AS codigo,
            p.stock_actual AS stock, p.cantidad_minima_stock AS minimo,
            CASE WHEN p.stock_actual <= p.cantidad_minima_stock THEN 'Stock bajo' ELSE 'Normal' END AS situacion
          FROM productos p JOIN categorias_producto c ON c.id = p.categoria_id
          WHERE p.id > $1 ORDER BY p.id LIMIT ${LOTE}`
  }
};

export const TIPOS_EXPORTACION = Object.keys(DEFINICIONES);

type Fila = Record<string, unknown> & { clave: number };

async function leerLote(sql: string, ultimaClave: number): Promise<Fila[]> {
  // PostgreSQL rechaza parámetros que la consulta no referencia: solo se envía $2 si se usa
  const parametros = sql.includes("$2") ? [ultimaClave, env.zonaHoraria] : [ultimaClave];
  const { rows } = await pool.query<Fila>(sql, parametros);
  return rows;
}

/**
 * Genera el XLSX en streaming directamente sobre la respuesta HTTP, leyendo por lotes (ADR-008/009/010).
 * Sin datos, el archivo lleva solo los encabezados y se avisa con `X-Exportacion-Vacia: true`.
 */
export async function exportarExcel(tipo: string, res: Response): Promise<void> {
  const definicion = DEFINICIONES[tipo];

  if (!definicion) {
    throw new Error(`Tipo de exportación desconocido: ${tipo}`);
  }

  let lote = await leerLote(definicion.sql, 0);
  const dia = new Date().toLocaleDateString("en-CA", { timeZone: env.zonaHoraria });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="servistock-${definicion.archivo}-${dia}.xlsx"`);
  res.setHeader("X-Exportacion-Vacia", String(lote.length === 0));
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, X-Exportacion-Vacia");

  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const hoja = libro.addWorksheet(definicion.hoja, { views: [{ state: "frozen", ySplit: 1 }] });
  hoja.columns = definicion.columnas;
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).commit();

  while (lote.length > 0) {
    for (const fila of lote) {
      hoja.addRow(fila).commit();
    }

    const ultima = lote[lote.length - 1];
    lote = ultima ? await leerLote(definicion.sql, ultima.clave) : [];
  }

  hoja.commit();
  await libro.commit();
}
