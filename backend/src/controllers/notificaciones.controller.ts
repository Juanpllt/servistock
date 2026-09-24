import type { Request, Response } from "express";
import { enviarNotificacion, firebaseActivo } from "../services/firebase.service.js";
import { listarNotificacionesService, marcarLeidaService } from "../services/notificacion.service.js";

export async function enviar(req: Request, res: Response) {
  if (!firebaseActivo) {
    return res.status(501).json({ mensaje: "Firebase Cloud Messaging no está configurado" });
  }

  const { token, titulo, cuerpo } = req.body;
  const id = await enviarNotificacion(token, titulo, cuerpo);

  return res.status(202).json({ mensaje: "Notificación enviada", id });
}

/** RF-59: notificaciones de producto y de pedido, ordenadas por fecha. */
export async function listar(req: Request, res: Response) {
  return res.json(await listarNotificacionesService(req.query["soloNoLeidas"] === "true"));
}

/** RF-60 */
export async function marcarLeida(req: Request, res: Response) {
  const tipo = req.params["tipo"] === "pedido" ? "pedido" : "producto";
  await marcarLeidaService(tipo, Number(req.params["id"]));

  return res.json({ mensaje: "Notificación marcada como leída" });
}
