import { conTransaccion, pool } from "../config/db.js";
import { conflicto, noEncontrado } from "../errors.js";
import {
  cambiarEstado,
  ESTADO,
  estadoActualId,
  historialEstados,
  registrarEstado
} from "../repositories/estado.repository.js";
import { buscarProyecto } from "../repositories/proyecto.repository.js";
import type { Rango } from "../repositories/rango.js";
import {
  actualizarCantidadLineaSalida,
  actualizarProyectoSalida,
  bloquearLineaSalida,
  buscarSalida,
  insertarLineaSalida,
  insertarSalida,
  lineasDeSalida,
  listarSalidas
} from "../repositories/salida.repository.js";
import { agruparLineas, ajustarStock, bloquearProductos } from "../repositories/stock.repository.js";
import { emitir } from "../realtime/socket.js";
import { publicarNotificaciones } from "./notificacion.service.js";
import { notificarStockBajo, publicarStock, type ProductoActualizado } from "./stock.service.js";

export const listarSalidasService = (estadoId?: number, rango?: Rango) => listarSalidas(estadoId, rango);

export async function obtenerSalidaService(id: number) {
  const salida = await buscarSalida(id);

  if (!salida) {
    throw noEncontrado("Salida");
  }

  return salida;
}

/** RF-43: detalle con las líneas y el estado individual de cada una, más el historial (RF-53). */
export async function detalleSalidaService(id: number) {
  const salida = await obtenerSalidaService(id);
  const [lineas, historial] = await Promise.all([lineasDeSalida(id), historialEstados("salida", id)]);

  return { ...salida, lineas, historial };
}

/** Caso de uso 5.3: la salida se asocia a un proyecto existente y en curso. */
async function exigirProyectoEnCurso(proyectoId: number) {
  const proyecto = await buscarProyecto(proyectoId);

  if (!proyecto) {
    throw noEncontrado("Proyecto");
  }

  if (proyecto.estadoId !== ESTADO.EN_CURSO) {
    throw conflicto("El proyecto no está en curso: no se pueden registrar salidas");
  }
}

/**
 * RF-39 / ADR-001, ADR-002: valida el stock en el backend, dentro de la misma transacción y con bloqueo
 * pesimista de las filas de producto. Si alguna línea excede el stock disponible se hace rollback completo:
 * no queda salida, ni líneas, ni cambios de inventario.
 */
export async function crearSalidaService(
  empleadoId: number,
  datos: { proyectoId: number; lineas: { productoId: number; cantidad: number }[] }
) {
  await exigirProyectoEnCurso(datos.proyectoId);
  const lineas = agruparLineas(datos.lineas);

  const { id, actualizados, notificaciones } = await conTransaccion(async (cliente) => {
    const productos = await bloquearProductos(cliente, lineas.map((l) => l.productoId));

    for (const { productoId, cantidad } of lineas) {
      const producto = productos.get(productoId);

      if (producto && producto.stockActual < cantidad) {
        throw conflicto(
          `Stock insuficiente de "${producto.nombre}": disponible ${producto.stockActual}, solicitado ${cantidad}`
        );
      }
    }

    const salidaId = await insertarSalida(cliente, empleadoId, datos.proyectoId);
    await registrarEstado(cliente, "salida", salidaId, ESTADO.EN_ESPERA);
    const actualizados: ProductoActualizado[] = [];

    for (const { productoId, cantidad } of lineas) {
      const lineaId = await insertarLineaSalida(cliente, salidaId, productoId, cantidad);
      await registrarEstado(cliente, "salida_producto", lineaId, ESTADO.EN_ESPERA);
      const stockActual = await ajustarStock(cliente, productoId, -cantidad);
      const producto = productos.get(productoId);

      if (producto) {
        actualizados.push({ ...producto, stockActual });
      }
    }

    // RF-56: evaluar en la misma transacción si el stock resultante amerita una notificación
    return { id: salidaId, actualizados, notificaciones: await notificarStockBajo(cliente, actualizados) };
  });

  // Solo tras el COMMIT se propaga el cambio (regla arquitectónica principal)
  publicarStock(actualizados);
  publicarNotificaciones(notificaciones);
  emitir("movimiento:registrado", { tipo: "salida", id });

  return detalleSalidaService(id);
}

async function exigirSalidaEditable(salidaId: number) {
  await obtenerSalidaService(salidaId);

  if ((await estadoActualId(pool, "salida", salidaId)) === ESTADO.COMPLETADO) {
    throw conflicto("No se puede editar: la salida ya está completada");
  }
}

/** RF-47: cambia el proyecto de una salida que aún no está completada. */
export async function editarSalidaService(id: number, proyectoId: number) {
  await exigirSalidaEditable(id);
  await exigirProyectoEnCurso(proyectoId);
  await actualizarProyectoSalida(pool, id, proyectoId);
  emitir("movimiento:registrado", { tipo: "salida", id });

  return detalleSalidaService(id);
}

/** RF-47: edita la cantidad de una línea no completada, ajustando el stock por la diferencia. */
export async function editarLineaSalidaService(salidaId: number, lineaId: number, cantidad: number) {
  await exigirSalidaEditable(salidaId);

  const { actualizados, notificaciones } = await conTransaccion(async (cliente) => {
    const linea = await bloquearLineaSalida(cliente, salidaId, lineaId);

    if (!linea) {
      throw noEncontrado("Línea de salida");
    }

    if (linea.estadoId === ESTADO.COMPLETADO) {
      throw conflicto("No se puede editar: la línea ya está completada");
    }

    const productos = await bloquearProductos(cliente, [linea.productoId]);
    const producto = productos.get(linea.productoId);
    const diferencia = cantidad - linea.cantidad;

    if (producto && diferencia > producto.stockActual) {
      throw conflicto(
        `Stock insuficiente de "${producto.nombre}": disponible ${producto.stockActual}, se necesitan ${diferencia} más`
      );
    }

    const stockActual = await ajustarStock(cliente, linea.productoId, -diferencia);
    await actualizarCantidadLineaSalida(cliente, lineaId, cantidad);

    const actualizados = producto ? [{ ...producto, stockActual }] : [];
    return { actualizados, notificaciones: await notificarStockBajo(cliente, actualizados) };
  });

  publicarStock(actualizados);
  publicarNotificaciones(notificaciones);
  emitir("movimiento:registrado", { tipo: "salida", id: salidaId });

  return detalleSalidaService(salidaId);
}

/** RF-48: cambio manual del estado de la salida, sin derivarlo de sus líneas (RN-02/RN-03). */
export async function cambiarEstadoSalidaService(id: number, tipoEstadoId: number) {
  await cambiarEstado(pool, "salida", id, tipoEstadoId);
  emitir("movimiento:registrado", { tipo: "salida", id });

  return detalleSalidaService(id);
}

/** RF-44: cambio manual del estado de una línea de la salida. */
export async function cambiarEstadoLineaSalidaService(
  salidaId: number,
  lineaId: number,
  tipoEstadoId: number
) {
  await obtenerSalidaService(salidaId);

  const { rowCount } = await pool.query("SELECT 1 FROM salida_productos WHERE id = $1 AND salida_id = $2", [
    lineaId,
    salidaId
  ]);

  if (!rowCount) {
    throw noEncontrado("Línea de salida");
  }

  await cambiarEstado(pool, "salida_producto", lineaId, tipoEstadoId);
  emitir("movimiento:registrado", { tipo: "salida", id: salidaId });

  return detalleSalidaService(salidaId);
}
