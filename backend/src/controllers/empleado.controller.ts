import type { Request, Response } from "express";
import {
  cambiarTipoService,
  crearEmpleadoService,
  editarEmpleadoService,
  eliminarEmpleadoService,
  listarEmpleadosService,
  obtenerEmpleadoService,
  proyectosDeEmpleadoService
} from "../services/empleado.service.js";

export async function listar(_req: Request, res: Response) {
  return res.json(await listarEmpleadosService());
}

export async function obtener(req: Request, res: Response) {
  return res.json(await obtenerEmpleadoService(Number(req.params["id"])));
}

export async function proyectos(req: Request, res: Response) {
  return res.json(await proyectosDeEmpleadoService(Number(req.params["id"])));
}

export async function crear(req: Request, res: Response) {
  const { nombre, email, password, rolId } = req.body;
  const empleado = await crearEmpleadoService({ nombre, email, password, rolId });

  return res.status(201).json({ mensaje: "Empleado creado correctamente", data: empleado });
}

export async function editar(req: Request, res: Response) {
  const { nombre, email, password } = req.body;
  const empleado = await editarEmpleadoService(res.locals["usuario"], Number(req.params["id"]), {
    nombre,
    email,
    password
  });

  return res.json({ mensaje: "Empleado actualizado correctamente", data: empleado });
}

export async function cambiarTipo(req: Request, res: Response) {
  const empleado = await cambiarTipoService(Number(req.params["id"]), req.body.rolId);
  return res.json({ mensaje: "Tipo de empleado actualizado correctamente", data: empleado });
}

export async function eliminar(req: Request, res: Response) {
  await eliminarEmpleadoService(res.locals["usuario"], Number(req.params["id"]));
  return res.json({ mensaje: "Empleado eliminado correctamente" });
}
