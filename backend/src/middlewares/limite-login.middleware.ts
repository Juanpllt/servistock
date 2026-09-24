import type { NextFunction, Request, Response } from "express";
import { incrementar, reiniciar } from "../cache/contador.js";

const MAX_INTENTOS = 5;
const VENTANA_SEGUNDOS = 15 * 60;

function clave(req: Request) {
  return `login:${req.ip}:${String(req.body?.email ?? "").toLowerCase()}`;
}

// Bloquea después de 5 intentos fallidos por IP + correo en 15 minutos.
export async function limitarIntentosLogin(req: Request, res: Response, next: NextFunction) {
  const k = clave(req);
  const intentos = await incrementar(k, VENTANA_SEGUNDOS);

  if (intentos > MAX_INTENTOS) {
    res.setHeader("Retry-After", String(VENTANA_SEGUNDOS));
    return res.status(429).json({
      mensaje: "Demasiados intentos. Intenta de nuevo en unos minutos"
    });
  }

  // Un inicio de sesión correcto reinicia el contador
  res.on("finish", () => {
    if (res.statusCode === 200) {
      void reiniciar(k);
    }
  });

  next();
}
