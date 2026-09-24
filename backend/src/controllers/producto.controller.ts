import type { Request, Response } from "express";
import {
  crearProductoService,
  editarProductoService,
  listarProductosService,
  obtenerPorCodigoService,
  obtenerProductoService
} from "../services/producto.service.js";

function datos(req: Request) {
  return {
    nombre: req.body.nombre as string,
    categoriaId: req.body.categoriaId as number,
    codigoQrBarras: req.body.codigoQrBarras as string,
    cantidadMinimaStock: req.body.cantidadMinimaStock as number
  };
}

export async function listar(req: Request, res: Response) {
  const { nombre, categoriaId } = req.query;

  return res.json(
    await listarProductosService({
      nombre: typeof nombre === "string" && nombre ? nombre : undefined,
      categoriaId: categoriaId ? Number(categoriaId) : undefined
    })
  );
}

export async function obtener(req: Request, res: Response) {
  return res.json(await obtenerProductoService(Number(req.params["id"])));
}

export async function obtenerPorCodigo(req: Request, res: Response) {
  return res.json(await obtenerPorCodigoService(String(req.params["codigo"])));
}

export async function crear(req: Request, res: Response) {
  const producto = await crearProductoService(datos(req));
  return res.status(201).json({ mensaje: "Producto creado correctamente", data: producto });
}

export async function editar(req: Request, res: Response) {
  const producto = await editarProductoService(Number(req.params["id"]), datos(req));
  return res.json({ mensaje: "Producto actualizado correctamente", data: producto });
}
