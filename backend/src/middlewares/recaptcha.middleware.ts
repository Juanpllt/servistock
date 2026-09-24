import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { logger } from "../observability/logger.js";

const UMBRAL = 0.5;

interface RespuestaGoogle {
  success: boolean;
  score?: number;
  action?: string;
}

// reCAPTCHA v3. Sin RECAPTCHA_SECRET queda desactivado (uso interno / desarrollo).
export async function verificarRecaptcha(req: Request, res: Response, next: NextFunction) {
  if (!env.recaptchaSecret) {
    return next();
  }

  const token = req.body?.recaptchaToken;

  if (typeof token !== "string" || !token) {
    return res.status(400).json({ mensaje: "Falta la verificación reCAPTCHA" });
  }

  try {
    const respuesta = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.recaptchaSecret, response: token })
    });
    const datos = (await respuesta.json()) as RespuestaGoogle;

    if (!datos.success || (datos.score ?? 0) < UMBRAL || datos.action !== "login") {
      logger.warn("recaptcha_rechazado", { score: datos.score, action: datos.action });
      return res.status(403).json({ mensaje: "Verificación reCAPTCHA fallida" });
    }

    next();
  } catch (error) {
    logger.error("recaptcha_error", { error: String(error) });
    return res.status(503).json({ mensaje: "No se pudo validar reCAPTCHA" });
  }
}
