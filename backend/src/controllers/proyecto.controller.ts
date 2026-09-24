import type { Request, Response } from "express";
import {
  asignarEmpleadoService,
  cambiarEstadoProyectoService,
  consumoProyectoService,
  crearProyectoService,
  detalleProyectoService,
  editarProyectoService,
  listarProyectosService,
  reasignarEmpleadoService,
  retirarEmpleadoService
} from "../services/proyecto.service.js";

const id = (req: Request) => Number(req.params["id"]);
const empleadoId = (req: Request) => Number(req.params["empleadoId"]);

export async function listar(req: Request, res: Response) {
  const { estadoId, nombre } = req.query;

  return res.json(
    await listarProyectosService({
      estadoId: estadoId ? Number(estadoId) : undefined,
      nombre: typeof nombre === "string" && nombre ? nombre : undefined
    })
  );
}

export async function obtener(req: Request, res: Response) {
  return res.json(await detalleProyectoService(id(req)));
}

export async function consumo(req: Request, res: Response) {
  return res.json(await consumoProyectoService(id(req)));
}

export async function crear(req: Request, res: Response) {
  const proyecto = await crearProyectoService(req.body.nombre, req.body.descripcion ?? "");
  return res.status(201).json({ mensaje: "Proyecto creado correctamente", data: proyecto });
}

export async function editar(req: Request, res: Response) {
  const proyecto = await editarProyectoService(id(req), req.body.nombre, req.body.descripcion ?? "");
  return res.json({ mensaje: "Proyecto actualizado correctamente", data: proyecto });
}

export async function cambiarEstado(req: Request, res: Response) {
  const proyecto = await cambiarEstadoProyectoService(id(req), req.body.tipoEstadoId);
  return res.json({ mensaje: "Estado del proyecto actualizado correctamente", data: proyecto });
}

export async function asignar(req: Request, res: Response) {
  const proyecto = await asignarEmpleadoService(id(req), req.body.empleadoId, req.body.tipoParticipacionId);
  return res.status(201).json({ mensaje: "Empleado asignado correctamente", data: proyecto });
}

export async function reasignar(req: Request, res: Response) {
  const proyecto = await reasignarEmpleadoService(id(req), empleadoId(req), req.body.tipoParticipacionId);
  return res.json({ mensaje: "Asignación actualizada correctamente", data: proyecto });
}

export async function retirar(req: Request, res: Response) {
  const proyecto = await retirarEmpleadoService(id(req), empleadoId(req));
  return res.json({ mensaje: "Empleado retirado del proyecto correctamente", data: proyecto });
}
