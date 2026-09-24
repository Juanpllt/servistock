import { Router, type Request, type Response } from "express";
import { param } from "express-validator";
import { validar } from "../middlewares/validaciones.js";
import { exportarExcel, TIPOS_EXPORTACION } from "../services/exportacion.service.js";

const router = Router();

/** RF-67 a RF-71: GET /api/exportaciones/{pedidos|entradas|salidas|proyectos|inventario} */
router.get(
  "/:tipo",
  validar(param("tipo").isIn(TIPOS_EXPORTACION).withMessage("Tipo de exportación no válido")),
  async (req: Request, res: Response) => {
    await exportarExcel(String(req.params["tipo"]), res);
  }
);

export default router;
