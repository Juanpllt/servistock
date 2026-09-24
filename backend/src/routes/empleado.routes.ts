import { Router } from "express";
import { body } from "express-validator";
import {
  cambiarTipo,
  crear,
  editar,
  eliminar,
  listar,
  obtener,
  proyectos
} from "../controllers/empleado.controller.js";
import { requiereRol } from "../middlewares/auth.middleware.js";
import { idBody, idParam, texto, validar } from "../middlewares/validaciones.js";

const router = Router();

const email = body("email")
  .isString()
  .withMessage("El usuario (correo) es obligatorio")
  .bail()
  .trim()
  .toLowerCase()
  .isEmail()
  .withMessage("Correo electrónico no válido")
  .isLength({ max: 150 })
  .withMessage("El correo no puede superar 150 caracteres");

const passwordNueva = body("password")
  .isString()
  .withMessage("La contraseña es obligatoria")
  .bail()
  .isLength({ min: 6, max: 128 })
  .withMessage("La contraseña debe tener entre 6 y 128 caracteres");

router.get("/", listar);
router.get("/:id", validar(idParam()), obtener);
router.get("/:id/proyectos", validar(idParam()), proyectos);

// RF-01 / RN-11: solo Administrador crea y elimina cuentas
router.post(
  "/",
  requiereRol("Administrador"),
  validar(texto("nombre", "El nombre", 100), email, passwordNueva, idBody("rolId", "El tipo de empleado es obligatorio")),
  crear
);
router.delete("/:id", requiereRol("Administrador"), validar(idParam()), eliminar);

// RF-05: el permiso (admin o la propia cuenta) se valida en el servicio
router.put(
  "/:id",
  validar(
    idParam(),
    texto("nombre", "El nombre", 100),
    email,
    body("password")
      .optional({ values: "falsy" })
      .isLength({ min: 6, max: 128 })
      .withMessage("La contraseña debe tener entre 6 y 128 caracteres")
  ),
  editar
);

// ADR-012: TipoEmpleado se modifica solo por este caso de uso, exclusivo del Administrador
router.patch(
  "/:id/tipo",
  requiereRol("Administrador"),
  validar(idParam(), idBody("rolId", "El tipo de empleado es obligatorio")),
  cambiarTipo
);

export default router;
