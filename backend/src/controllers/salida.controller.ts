import type { Request, Response } from "express";
import {
  cambiarEstadoLineaSalidaService,
  cambiarEstadoSalidaService,
  crearSalidaService,
  detalleSalidaService,
  editarLineaSalidaService,
  editarSalidaService,
  listarSalidasService
} from "../services/salida.service.js";

export async function listar(req: Request, res: Response) {
  const { estadoId } = req.query;
  return res.json(await listarSalidasService(estadoId ? Number(estadoId) : undefined));
}

export async function obtener(req: Request, res: Response) {
  return res.json(await detalleSalidaService(Number(req.params["id"])));
}

export async function crear(req: Request, res: Response) {
  const { proyectoId, lineas } = req.body;
  const salida = await crearSalidaService(res.locals["usuario"].id, { proyectoId, lineas });

  return res.status(201).json({ mensaje: "Salida registrada correctamente", data: salida });
}

export async function editar(req: Request, res: Response) {
  const salida = await editarSalidaService(Number(req.params["id"]), req.body.proyectoId);
  return res.json({ mensaje: "Salida actualizada correctamente", data: salida });
}

export async function editarLinea(req: Request, res: Response) {
  const salida = await editarLineaSalidaService(
    Number(req.params["id"]),
    Number(req.params["lineaId"]),
    req.body.cantidad
  );

  return res.json({ mensaje: "Línea de salida actualizada correctamente", data: salida });
}

export async function cambiarEstado(req: Request, res: Response) {
  const salida = await cambiarEstadoSalidaService(Number(req.params["id"]), req.body.tipoEstadoId);
  return res.json({ mensaje: "Estado de la salida actualizado correctamente", data: salida });
}

export async function cambiarEstadoLinea(req: Request, res: Response) {
  const salida = await cambiarEstadoLineaSalidaService(
    Number(req.params["id"]),
    Number(req.params["lineaId"]),
    req.body.tipoEstadoId
  );

  return res.json({ mensaje: "Estado de la línea actualizado correctamente", data: salida });
}
