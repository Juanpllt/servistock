import { conTransaccion, pool } from "../config/db.js";
import { conflicto, noEncontrado, solicitudInvalida } from "../errors.js";
import type { Rango } from "../repositories/rango.js";
import {
  actualizarCantidadLineaEntrada,
  actualizarEncabezadoEntrada,
  bloquearLineaEntrada,
  buscarEntrada,
  insertarEntrada,
  insertarLineaEntrada,
  lineasDeEntrada,
  listarEntradas
} from "../repositories/entrada.repository.js";
import {
  cambiarEstado,
  ESTADO,
  estadoActualId,
  historialEstados,
  registrarEstado
} from "../repositories/estado.repository.js";
import { agruparLineas, ajustarStock, bloquearProductos } from "../repositories/stock.repository.js";
import { emitir } from "../realtime/socket.js";
import { publicarNotificaciones } from "./notificacion.service.js";
import { notificarStockBajo, publicarStock, type ProductoActualizado } from "./stock.service.js";

export const listarEntradasService = (estadoId?: number, rango?: Rango) => listarEntradas(estadoId, rango);

export async function obtenerEntradaService(id: number) {
  const entrada = await buscarEntrada(id);

  if (!entrada) {
    throw noEncontrado("Entrada");
  }

  return entrada;
}

/** RF-23: detalle con las líneas y el estado individual de cada una, más el historial (RF-51). */
export async function detalleEntradaService(id: number) {
  const entrada = await obtenerEntradaService(id);
  const [lineas, historial] = await Promise.all([lineasDeEntrada(id), historialEstados("entrada", id)]);

  return { ...entrada, lineas, historial };
}

async function exigirPedido(pedidoId: number) {
  const { rowCount } = await pool.query("SELECT 1 FROM pedidos WHERE id = $1", [pedidoId]);

  if (!rowCount) {
    throw noEncontrado("Pedido");
  }
}

async function exigirTipoEntrada(tipoEntradaId: number) {
  const { rowCount } = await pool.query("SELECT 1 FROM tipos_entrada WHERE id = $1", [tipoEntradaId]);

  if (!rowCount) {
    throw solicitudInvalida("El tipo de entrada indicado no existe");
  }
}

interface DatosEntrada {
  pedidoId: number;
  tipoEntradaId: number;
  lineas: { productoId: number; cantidad: number }[];
}

/**
 * RF-22 / ADR-015: entrada asociada obligatoriamente a un pedido existente. Entrada, líneas e incremento
 * de stock se confirman en una única transacción; si algo falla se hace rollback completo.
 */
export async function crearEntradaService(empleadoId: number, datos: DatosEntrada) {
  await exigirPedido(datos.pedidoId);
  await exigirTipoEntrada(datos.tipoEntradaId);

  const lineas = agruparLineas(datos.lineas);

  const { id, actualizados } = await conTransaccion(async (cliente) => {
    const entradaId = await insertarEntrada(cliente, empleadoId, datos.pedidoId, datos.tipoEntradaId);
    await registrarEstado(cliente, "entrada", entradaId, ESTADO.EN_ESPERA);

    const productos = await bloquearProductos(cliente, lineas.map((l) => l.productoId));
    const actualizados: ProductoActualizado[] = [];

    for (const { productoId, cantidad } of lineas) {
      const lineaId = await insertarLineaEntrada(cliente, entradaId, productoId, cantidad);
      await registrarEstado(cliente, "entrada_producto", lineaId, ESTADO.EN_ESPERA);
      const stockActual = await ajustarStock(cliente, productoId, cantidad);
      const producto = productos.get(productoId);

      if (producto) {
        actualizados.push({ ...producto, stockActual });
      }
    }

    return { id: entradaId, actualizados };
  });

  // Solo tras el COMMIT se propaga el cambio (regla arquitectónica principal)
  publicarStock(actualizados);
  emitir("movimiento:registrado", { tipo: "entrada", id });

  return detalleEntradaService(id);
}

async function exigirEntradaEditable(entradaId: number) {
  await obtenerEntradaService(entradaId);

  if ((await estadoActualId(pool, "entrada", entradaId)) === ESTADO.COMPLETADO) {
    throw conflicto("No se puede editar: la entrada ya está completada");
  }
}

/** RF-26: edita el encabezado de una entrada que aún no está completada. */
export async function editarEntradaService(id: number, datos: { pedidoId: number; tipoEntradaId: number }) {
  await exigirEntradaEditable(id);
  await exigirPedido(datos.pedidoId);
  await exigirTipoEntrada(datos.tipoEntradaId);
  await actualizarEncabezadoEntrada(pool, id, datos.pedidoId, datos.tipoEntradaId);
  emitir("movimiento:registrado", { tipo: "entrada", id });

  return detalleEntradaService(id);
}

/** RF-26: edita la cantidad de una línea no completada, ajustando el stock por la diferencia. */
export async function editarLineaEntradaService(entradaId: number, lineaId: number, cantidad: number) {
  await exigirEntradaEditable(entradaId);

  const { actualizados, notificaciones } = await conTransaccion(async (cliente) => {
    const linea = await bloquearLineaEntrada(cliente, entradaId, lineaId);

    if (!linea) {
      throw noEncontrado("Línea de entrada");
    }

    if (linea.estadoId === ESTADO.COMPLETADO) {
      throw conflicto("No se puede editar: la línea ya está completada");
    }

    const productos = await bloquearProductos(cliente, [linea.productoId]);
    const stockActual = await ajustarStock(cliente, linea.productoId, cantidad - linea.cantidad);
    await actualizarCantidadLineaEntrada(cliente, lineaId, cantidad);

    const producto = productos.get(linea.productoId);
    const actualizados = producto ? [{ ...producto, stockActual }] : [];

    return { actualizados, notificaciones: await notificarStockBajo(cliente, actualizados) };
  });

  publicarStock(actualizados);
  publicarNotificaciones(notificaciones);
  emitir("movimiento:registrado", { tipo: "entrada", id: entradaId });

  return detalleEntradaService(entradaId);
}

/** RF-28: cambio manual del estado de la entrada, sin derivarlo de sus líneas (RN-02/RN-03). */
export async function cambiarEstadoEntradaService(id: number, tipoEstadoId: number) {
  await cambiarEstado(pool, "entrada", id, tipoEstadoId);
  emitir("movimiento:registrado", { tipo: "entrada", id });

  return detalleEntradaService(id);
}

/** RF-27: cambio manual del estado de una línea de la entrada. */
export async function cambiarEstadoLineaEntradaService(
  entradaId: number,
  lineaId: number,
  tipoEstadoId: number
) {
  await obtenerEntradaService(entradaId);

  const { rowCount } = await pool.query(
    "SELECT 1 FROM entrada_productos WHERE id = $1 AND entrada_id = $2",
    [lineaId, entradaId]
  );

  if (!rowCount) {
    throw noEncontrado("Línea de entrada");
  }

  await cambiarEstado(pool, "entrada_producto", lineaId, tipoEstadoId);
  emitir("movimiento:registrado", { tipo: "entrada", id: entradaId });

  return detalleEntradaService(entradaId);
}
