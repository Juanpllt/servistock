import type { Request, Response } from "express";
import {
  cambiarEstadoEntradaService,
  cambiarEstadoLineaEntradaService,
  crearEntradaService,
  detalleEntradaService,
  editarEntradaService,
  editarLineaEntradaService,
  listarEntradasService
} from "../services/entrada.service.js";

export async function listar(req: Request, res: Response) {
  const { estadoId } = req.query;
  return res.json(await listarEntradasService(estadoId ? Number(estadoId) : undefined));
}

export async function obtener(req: Request, res: Response) {
  return res.json(await detalleEntradaService(Number(req.params["id"])));
}

export async function crear(req: Request, res: Response) {
  const { pedidoId, tipoEntradaId, lineas } = req.body;
  const entrada = await crearEntradaService(res.locals["usuario"].id, { pedidoId, tipoEntradaId, lineas });

  return res.status(201).json({ mensaje: "Entrada registrada correctamente", data: entrada });
}

export async function editar(req: Request, res: Response) {
  const { pedidoId, tipoEntradaId } = req.body;
  const entrada = await editarEntradaService(Number(req.params["id"]), { pedidoId, tipoEntradaId });

  return res.json({ mensaje: "Entrada actualizada correctamente", data: entrada });
}

export async function editarLinea(req: Request, res: Response) {
  const entrada = await editarLineaEntradaService(
    Number(req.params["id"]),
    Number(req.params["lineaId"]),
    req.body.cantidad
  );

  return res.json({ mensaje: "Línea de entrada actualizada correctamente", data: entrada });
}

export async function cambiarEstado(req: Request, res: Response) {
  const entrada = await cambiarEstadoEntradaService(Number(req.params["id"]), req.body.tipoEstadoId);
  return res.json({ mensaje: "Estado de la entrada actualizado correctamente", data: entrada });
}

export async function cambiarEstadoLinea(req: Request, res: Response) {
  const entrada = await cambiarEstadoLineaEntradaService(
    Number(req.params["id"]),
    Number(req.params["lineaId"]),
    req.body.tipoEstadoId
  );

  return res.json({ mensaje: "Estado de la línea actualizado correctamente", data: entrada });
}
