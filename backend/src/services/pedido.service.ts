import { conTransaccion } from "../config/db.js";
import { conflicto, noEncontrado } from "../errors.js";
import { cambiarEstado, ESTADO, historialEstados, registrarEstado } from "../repositories/estado.repository.js";
import {
  crearNotificacionPedido,
  TIPO_NOTIF_PEDIDO
} from "../repositories/notificacion.repository.js";
import {
  actualizarPedido,
  buscarPedido,
  entradasDePedido,
  insertarPedido,
  listarPedidos
} from "../repositories/pedido.repository.js";
import { emitir } from "../realtime/socket.js";
import { publicarNotificaciones } from "./notificacion.service.js";

export const listarPedidosService = (estadoId?: number) => listarPedidos(estadoId);

export async function obtenerPedidoService(id: number) {
  const pedido = await buscarPedido(id);

  if (!pedido) {
    throw noEncontrado("Pedido");
  }

  return pedido;
}

/** RF-17: detalle del pedido, sus entradas y el historial de estados. */
export async function detallePedidoService(id: number) {
  const pedido = await obtenerPedidoService(id);
  const [entradas, historial] = await Promise.all([entradasDePedido(id), historialEstados("pedido", id)]);

  return { ...pedido, entradas, historial };
}

/** RF-16 / RF-57: crea el pedido con estado "En espera" y su notificación de creación. */
export async function crearPedidoService(proveedor: string, empleadoId: number) {
  const { id, notificaciones } = await conTransaccion(async (cliente) => {
    const nuevoId = await insertarPedido(cliente, proveedor, empleadoId);
    await registrarEstado(cliente, "pedido", nuevoId, ESTADO.EN_ESPERA);
    const notificacion = await crearNotificacionPedido(
      cliente,
      nuevoId,
      TIPO_NOTIF_PEDIDO.CREACION,
      `Pedido #${nuevoId} (${proveedor}): creado`
    );

    return { id: nuevoId, notificaciones: [notificacion] };
  });

  publicarNotificaciones(notificaciones);
  emitir("movimiento:registrado", { tipo: "pedido", id });

  return obtenerPedidoService(id);
}

/** RF-20: solo se puede editar un pedido que aún no tiene entradas asociadas. */
export async function editarPedidoService(id: number, proveedor: string) {
  const pedido = await obtenerPedidoService(id);

  if (pedido.totalEntradas > 0) {
    throw conflicto("No se puede editar el pedido: ya tiene entradas asociadas");
  }

  await actualizarPedido(id, proveedor);
  emitir("movimiento:registrado", { tipo: "pedido", id });

  return obtenerPedidoService(id);
}

/** RF-21 / RF-58: cambio manual de estado; genera la notificación correspondiente. */
export async function cambiarEstadoPedidoService(id: number, tipoEstadoId: number) {
  const notificaciones = await conTransaccion(async (cliente) => {
    const nombreEstado = await cambiarEstado(cliente, "pedido", id, tipoEstadoId);
    const { rows } = await cliente.query<{ proveedor: string }>(
      "SELECT proveedor FROM pedidos WHERE id = $1",
      [id]
    );

    return [
      await crearNotificacionPedido(
        cliente,
        id,
        TIPO_NOTIF_PEDIDO.CAMBIO_ESTADO,
        `Pedido #${id} (${rows[0]?.proveedor ?? ""}): cambió a "${nombreEstado}"`
      )
    ];
  });

  publicarNotificaciones(notificaciones);
  emitir("movimiento:registrado", { tipo: "pedido", id });

  return obtenerPedidoService(id);
}
