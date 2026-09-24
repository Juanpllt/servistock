import { Router } from "express";
import { body, param, query } from "express-validator";
import { crear, editar, listar, obtener, obtenerPorCodigo } from "../controllers/producto.controller.js";
import { idBody, idParam, texto, validar } from "../middlewares/validaciones.js";

const router = Router();

const camposProducto = [
  texto("nombre", "El nombre", 150),
  idBody("categoriaId", "La categoría es obligatoria"),
  texto("codigoQrBarras", "El código QR/de barras", 100),
  body("cantidadMinimaStock")
    .isInt({ min: 0, max: 1_000_000 })
    .withMessage("La cantidad mínima es obligatoria y debe ser un entero mayor o igual a cero")
    .toInt()
];

router.get(
  "/",
  validar(
    query("nombre").optional().isString().trim().isLength({ max: 150 }),
    query("categoriaId").optional().isInt({ min: 1 }).withMessage("categoriaId no es válido")
  ),
  listar
);
// Antes de "/:id" para que "codigo" no se interprete como id
router.get("/codigo/:codigo", validar(param("codigo").isString().trim().isLength({ min: 1, max: 100 })), obtenerPorCodigo);
router.get("/:id", validar(idParam()), obtener);
router.post("/", validar(...camposProducto), crear);
router.put("/:id", validar(idParam(), ...camposProducto), editar);

export default router;
