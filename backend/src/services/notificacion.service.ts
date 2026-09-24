import { noEncontrado } from "../errors.js";
import {
  contarNoLeidas,
  listarNotificaciones,
  marcarLeida,
  type NotificacionCreada
} from "../repositories/notificacion.repository.js";
import { emitir } from "../realtime/socket.js";

/** Publica por Socket.IO las notificaciones creadas dentro de una transacción ya confirmada. */
export function publicarNotificaciones(notificaciones: NotificacionCreada[]): void {
  for (const notificacion of notificaciones) {
    emitir("notificacion:nueva", notificacion);
  }
}

export async function listarNotificacionesService(soloNoLeidas: boolean) {
  const [notificaciones, noLeidas] = await Promise.all([
    listarNotificaciones(soloNoLeidas),
    contarNoLeidas()
  ]);

  return { noLeidas, notificaciones };
}

export async function marcarLeidaService(tipo: "producto" | "pedido", id: number) {
  if (!(await marcarLeida(tipo, id))) {
    throw noEncontrado("Notificación");
  }
}
