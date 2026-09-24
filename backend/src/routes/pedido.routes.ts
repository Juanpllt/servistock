import { Router } from "express";
import { cambiarEstado, crear, editar, listar, obtener } from "../controllers/pedido.controller.js";
import { filtroEstado, idBody, idParam, texto, validar } from "../middlewares/validaciones.js";

const router = Router();
const proveedor = texto("proveedor", "El proveedor", 150);

router.get("/", validar(filtroEstado()), listar);
router.get("/:id", validar(idParam()), obtener);
router.post("/", validar(proveedor), crear);
router.put("/:id", validar(idParam(), proveedor), editar);
router.patch("/:id/estado", validar(idParam(), idBody("tipoEstadoId", "El estado es obligatorio")), cambiarEstado);

export default router;
