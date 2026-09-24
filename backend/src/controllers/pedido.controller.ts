import type { Request, Response } from "express";
import {
  cambiarEstadoPedidoService,
  crearPedidoService,
  detallePedidoService,
  editarPedidoService,
  listarPedidosService
} from "../services/pedido.service.js";

export async function listar(req: Request, res: Response) {
  const { estadoId } = req.query;
  return res.json(await listarPedidosService(estadoId ? Number(estadoId) : undefined));
}

export async function obtener(req: Request, res: Response) {
  return res.json(await detallePedidoService(Number(req.params["id"])));
}

export async function crear(req: Request, res: Response) {
  const pedido = await crearPedidoService(req.body.proveedor, res.locals["usuario"].id);
  return res.status(201).json({ mensaje: "Pedido creado correctamente", data: pedido });
}

export async function editar(req: Request, res: Response) {
  const pedido = await editarPedidoService(Number(req.params["id"]), req.body.proveedor);
  return res.json({ mensaje: "Pedido actualizado correctamente", data: pedido });
}

export async function cambiarEstado(req: Request, res: Response) {
  const pedido = await cambiarEstadoPedidoService(Number(req.params["id"]), req.body.tipoEstadoId);
  return res.json({ mensaje: "Estado del pedido actualizado correctamente", data: pedido });
}
