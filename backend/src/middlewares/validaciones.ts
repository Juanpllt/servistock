import type { NextFunction, Request, Response } from "express";
import { body, param, query, validationResult, type ValidationChain } from "express-validator";

/** Devuelve 400 con la lista de errores si alguna validación previa falló. */
export function resultadoValidacion(req: Request, res: Response, next: NextFunction) {
  const errores = validationResult(req);

  if (!errores.isEmpty()) {
    return res.status(400).json({
      mensaje: errores.array()[0]?.msg ?? "Datos inválidos",
      errores: errores.array().map((e) => e.msg)
    });
  }

  next();
}

/** Encadena las validaciones y el manejo del resultado en un solo arreglo de middlewares. */
export const validar = (...cadenas: ValidationChain[]) => [...cadenas, resultadoValidacion];

export const idParam = (nombre = "id") =>
  param(nombre).isInt({ min: 1 }).withMessage(`${nombre} no es válido`).toInt();

export const idBody = (campo: string, mensaje?: string) =>
  body(campo)
    .isInt({ min: 1 })
    .withMessage(mensaje ?? `El campo ${campo} es obligatorio`)
    .toInt();

export const idBodyOpcional = (campo: string) =>
  body(campo).optional().isInt({ min: 1 }).withMessage(`El campo ${campo} no es válido`).toInt();

export const texto = (campo: string, etiqueta: string, max: number) =>
  body(campo)
    .isString()
    .withMessage(`${etiqueta} es obligatorio`)
    .bail()
    .trim()
    .notEmpty()
    .withMessage(`${etiqueta} es obligatorio`)
    .isLength({ max })
    .withMessage(`${etiqueta} no puede superar ${max} caracteres`);

export const textoOpcional = (campo: string, etiqueta: string, max: number) =>
  body(campo)
    .optional()
    .isString()
    .withMessage(`${etiqueta} no es válido`)
    .bail()
    .trim()
    .isLength({ max })
    .withMessage(`${etiqueta} no puede superar ${max} caracteres`);

export const cantidad = (campo: string) =>
  body(campo)
    .isInt({ min: 1, max: 1_000_000 })
    .withMessage("La cantidad debe ser un número entero mayor que cero")
    .toInt();

export const lineas = () => [
  body("lineas")
    .isArray({ min: 1, max: 200 })
    .withMessage("Debes agregar al menos un producto con su cantidad"),
  body("lineas.*.productoId")
    .isInt({ min: 1 })
    .withMessage("Cada línea debe indicar un producto válido")
    .toInt(),
  cantidad("lineas.*.cantidad")
];

export const filtroEstado = () =>
  query("estadoId").optional().isInt({ min: 1 }).withMessage("estadoId no es válido").toInt();

/** Rango de fechas del historial: ambas obligatorias, ISO válidas y `desde` <= `hasta`. */
export const rangoFechas = () => [
  query("desde").optional().isISO8601().withMessage("La fecha inicial no es válida"),
  query("hasta")
    .optional()
    .isISO8601()
    .withMessage("La fecha final no es válida")
    .bail()
    .custom((hasta, { req }) => {
      const desde = req.query?.["desde"];
      return !desde || new Date(String(desde)) <= new Date(String(hasta));
    })
    .withMessage("La fecha inicial no puede ser posterior a la final")
];
