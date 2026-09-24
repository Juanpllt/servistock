import { Router } from "express";
import {
  cambiarEstado,
  cambiarEstadoLinea,
  crear,
  editar,
  editarLinea,
  listar,
  obtener
} from "../controllers/entrada.controller.js";
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

router.get("/", validar(filtroEstado()), listar);
router.get("/:id", validar(idParam()), obtener);
router.post(
  "/",
  validar(idBody("pedidoId", "La entrada debe asociarse a un pedido"), idBody("tipoEntradaId", "El tipo de entrada es obligatorio"), ...lineas()),
  crear
);
router.put(
  "/:id",
  validar(idParam(), idBody("pedidoId", "La entrada debe asociarse a un pedido"), idBody("tipoEntradaId", "El tipo de entrada es obligatorio")),
  editar
);
router.put("/:id/lineas/:lineaId", validar(idParam(), idParam("lineaId"), cantidad("cantidad")), editarLinea);
router.patch("/:id/estado", validar(idParam(), estado), cambiarEstado);
router.patch("/:id/lineas/:lineaId/estado", validar(idParam(), idParam("lineaId"), estado), cambiarEstadoLinea);

export default router;
