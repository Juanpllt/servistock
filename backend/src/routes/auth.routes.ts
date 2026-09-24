import { Router } from "express";
import { configuracion, login, loginAuth0, loginFirebase, perfil } from "../controllers/auth.controller.js";
import { verificarToken } from "../middlewares/auth.middleware.js";
import { limitarIntentosLogin } from "../middlewares/limite-login.middleware.js";
import { verificarRecaptcha } from "../middlewares/recaptcha.middleware.js";
import { validarLogin, validarLoginFirebase } from "../middlewares/validar.middleware.js";

const router = Router();

router.post("/login", validarLogin, verificarRecaptcha, limitarIntentosLogin, login);
router.post("/firebase", validarLoginFirebase, limitarIntentosLogin, loginFirebase);
router.post("/auth0", validarLoginFirebase, limitarIntentosLogin, loginAuth0);
router.get("/config", configuracion);
router.get("/me", verificarToken, perfil);

export default router;
