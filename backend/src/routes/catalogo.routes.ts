import { Router } from "express";
import { controladorCatalogo } from "../controllers/catalogo.controller.js";
import { requiereRol } from "../middlewares/auth.middleware.js";
import { idParam, texto, validar } from "../middlewares/validaciones.js";
import type { TablaCatalogo } from "../repositories/catalogo.repository.js";

interface OpcionesCatalogo {
  /** Si se indica, solo esos roles pueden crear/editar (la lectura siempre es para todo usuario autenticado). */
  rolesEscritura?: string[];
  soloLectura?: boolean;
}

export function routerCatalogo(
  tabla: TablaCatalogo,
  etiqueta: string,
  { rolesEscritura, soloLectura = false }: OpcionesCatalogo = {}
) {
  const router = Router();
  const controlador = controladorCatalogo(tabla, etiqueta);
  const permiso = rolesEscritura ? [requiereRol(...rolesEscritura)] : [];
  const nombre = texto("nombre", "El nombre", 80);

  router.get("/", controlador.listar);

  if (!soloLectura) {
    router.post("/", ...permiso, validar(nombre), controlador.crear);
    router.put("/:id", ...permiso, validar(idParam(), nombre), controlador.editar);
  }

  return router;
}
