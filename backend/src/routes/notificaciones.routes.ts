import { Router } from "express";
import { param, query } from "express-validator";
import { enviar, listar, marcarLeida } from "../controllers/notificaciones.controller.js";
import { requiereRol, verificarToken } from "../middlewares/auth.middleware.js";
import { idParam, validar } from "../middlewares/validaciones.js";
import { validarNotificacion } from "../middlewares/validar.middleware.js";

const router = Router();

router.get("/", verificarToken, validar(query("soloNoLeidas").optional().isBoolean()), listar);
router.patch(
  "/:tipo/:id/leida",
  verificarToken,
  validar(param("tipo").isIn(["producto", "pedido"]).withMessage("Tipo de notificación no válido"), idParam()),
  marcarLeida
);

// Solo el Administrador puede disparar notificaciones push (FCM) a un dispositivo
router.post("/", verificarToken, requiereRol("Administrador"), validarNotificacion, enviar);

export default router;
