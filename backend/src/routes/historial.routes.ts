import { Router } from "express";
import { entrada, entradas, pedido, pedidos, proyecto, salida, salidas } from "../controllers/historial.controller.js";
import { idParam, rangoFechas, validar } from "../middlewares/validaciones.js";

const router = Router();

router.get("/pedidos", validar(...rangoFechas()), pedidos);
router.get("/pedidos/:id", validar(idParam()), pedido);
router.get("/entradas", validar(...rangoFechas()), entradas);
router.get("/entradas/:id", validar(idParam()), entrada);
router.get("/salidas", validar(...rangoFechas()), salidas);
router.get("/salidas/:id", validar(idParam()), salida);
router.get("/proyectos/:id", validar(idParam()), proyecto);

export default router;
