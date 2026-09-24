import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../observability/logger.js";

// Asigna un id a cada petición (trazabilidad) y registra método, ruta, estado y duración.
export function registrarPeticion(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header("x-request-id") ?? randomUUID();
  const inicio = performance.now();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    logger.info("http_request", {
      requestId,
      metodo: req.method,
      ruta: req.originalUrl.split("?")[0],
      estado: res.statusCode,
      ms: Math.round(performance.now() - inicio),
      usuarioId: res.locals.usuario?.id
    });
  });

  next();
}
