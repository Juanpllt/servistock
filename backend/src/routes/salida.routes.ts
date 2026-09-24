import { Router } from "express";
import {
  cambiarEstado,
  cambiarEstadoLinea,
  crear,
  editar,
  editarLinea,
  listar,
  obtener
} from "../controllers/salida.controller.js";
import {
  cantidad,
  filtroEstado,
  idBody,
  idParam,
  lineas,
  validar
} from "../middlewares/validaciones.js";

const router = Router();
const estado = idBody("tipoEstadoId", "El estado es obligatorio");
const proyecto = idBody("proyectoId", "La salida debe asociarse a un proyecto");

router.get("/", validar(filtroEstado()), listar);
router.get("/:id", validar(idParam()), obtener);
router.post("/", validar(proyecto, ...lineas()), crear);
router.put("/:id", validar(idParam(), proyecto), editar);
router.put("/:id/lineas/:lineaId", validar(idParam(), idParam("lineaId"), cantidad("cantidad")), editarLinea);
router.patch("/:id/estado", validar(idParam(), estado), cambiarEstado);
router.patch("/:id/lineas/:lineaId/estado", validar(idParam(), idParam("lineaId"), estado), cambiarEstadoLinea);

export default router;
