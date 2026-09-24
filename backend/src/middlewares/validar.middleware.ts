import type { NextFunction, Request, Response } from "express";
import { body, validationResult } from "express-validator";

function resultado(req: Request, res: Response, next: NextFunction) {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    return res.status(400).json({
      mensaje: "Datos inválidos",
      errores: errores.array().map((e) => e.msg)
    });
  }

  next();
}

// Sanitización de entradas (bloque OWASP Sanitizer): tipo, recorte, normalización y escape.
export const validarLogin = [
  body("email")
    .isString()
    .withMessage("El correo es obligatorio")
    .bail()
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("Correo electrónico no válido")
    .isLength({ max: 150 })
    .withMessage("Correo electrónico demasiado largo"),
  body("password")
    .isString()
    .withMessage("La contraseña es obligatoria")
    .bail()
    .isLength({ min: 1, max: 128 })
    .withMessage("La contraseña es obligatoria"),
  body("recaptchaToken").optional().isString().isLength({ max: 4096 }),
  resultado
];

export const validarLoginFirebase = [
  body("idToken").isString().isLength({ min: 1, max: 4096 }).withMessage("idToken requerido"),
  resultado
];

export const validarNotificacion = [
  body("token").isString().trim().isLength({ min: 1, max: 4096 }).withMessage("token requerido"),
  body("titulo")
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("titulo requerido")
    .escape(),
  body("cuerpo")
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage("cuerpo requerido")
    .escape(),
  resultado
];
