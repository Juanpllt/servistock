import type { Request, Response } from "express";
import type { TablaCatalogo } from "../repositories/catalogo.repository.js";
import { crearService, editarService, listarService } from "../services/catalogo.service.js";

/** Controlador genérico para cualquier catálogo (categorías, tipos de entrada, estados, ...). */
export function controladorCatalogo(tabla: TablaCatalogo, etiqueta: string) {
  return {
    async listar(_req: Request, res: Response) {
      return res.json(await listarService(tabla));
    },

    async crear(req: Request, res: Response) {
      const item = await crearService(tabla, etiqueta, req.body.nombre);
      return res.status(201).json({ mensaje: `${etiqueta} creado correctamente`, data: item });
    },

    async editar(req: Request, res: Response) {
      const item = await editarService(tabla, etiqueta, Number(req.params["id"]), req.body.nombre);
      return res.json({ mensaje: `${etiqueta} actualizado correctamente`, data: item });
    }
  };
}
