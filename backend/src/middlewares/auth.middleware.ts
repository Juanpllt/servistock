import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { TokenPayload } from "../services/auth.service.js";

export function verificarToken(req: Request, res: Response, next: NextFunction) {
  const [tipo, token] = (req.headers.authorization ?? "").split(" ");

  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ mensaje: "Token requerido" });
  }

  try {
    res.locals.usuario = jwt.verify(token, env.jwtSecret) as TokenPayload;
    next();
  } catch {
    return res.status(401).json({ mensaje: "Token inválido o expirado" });
  }
}

export function requiereRol(...roles: string[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(res.locals.usuario?.rol)) {
      return res.status(403).json({ mensaje: "No tienes permiso para esta acción" });
    }

    next();
  };
}
