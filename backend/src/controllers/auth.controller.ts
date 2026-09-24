import type { Request, Response } from "express";
import { env } from "../config/env.js";
import {
  loginAuth0Service,
  loginFirebaseService,
  loginService,
  perfilService
} from "../services/auth.service.js";
import { auth0Activo } from "../services/auth0.service.js";
import { firebaseActivo } from "../services/firebase.service.js";

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const resultado = await loginService({ email, password });

  if (!resultado) {
    return res.status(401).json({ mensaje: "Credenciales incorrectas" });
  }

  return res.status(200).json({
    mensaje: "Inicio de sesión correcto",
    ...resultado
  });
}

export async function loginFirebase(req: Request, res: Response) {
  if (!firebaseActivo) {
    return res.status(501).json({ mensaje: "Firebase Authentication no está configurado" });
  }

  const resultado = await loginFirebaseService(req.body.idToken);

  if (!resultado) {
    return res.status(401).json({ mensaje: "Credenciales incorrectas" });
  }

  return res.status(200).json({
    mensaje: "Inicio de sesión correcto",
    ...resultado
  });
}

export async function loginAuth0(req: Request, res: Response) {
  if (!auth0Activo) {
    return res.status(501).json({ mensaje: "Auth0 no está configurado" });
  }

  const resultado = await loginAuth0Service(req.body.idToken);

  if (resultado.estado === "invalido") {
    return res.status(401).json({ mensaje: "Credenciales incorrectas" });
  }

  if (resultado.estado === "no-registrado") {
    return res.status(403).json({
      mensaje: `Tu cuenta (${resultado.email}) no está registrada en Servistock. Pide a un Administrador que te cree con ese correo.`
    });
  }

  return res.status(200).json({ mensaje: "Inicio de sesión correcto", ...resultado.sesion });
}

/** Configuración pública para el frontend (nunca incluye secretos): qué formas de ingreso están activas. */
export function configuracion(_req: Request, res: Response) {
  return res.json({
    auth0: auth0Activo ? { domain: env.auth0.domain, clientId: env.auth0.clientId } : null
  });
}

export async function perfil(_req: Request, res: Response) {
  const usuario = await perfilService(res.locals.usuario.id);

  if (!usuario) {
    return res.status(401).json({ mensaje: "Sesión no válida" });
  }

  return res.status(200).json({ usuario });
}
