import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import {
  buscarPorEmail,
  buscarPorId,
  type Usuario
} from "../repositories/usuario.repository.js";
import { verificarIdTokenAuth0 } from "./auth0.service.js";
import { verificarIdToken } from "./firebase.service.js";

export interface LoginData {
  email: string;
  password: string;
}

export interface TokenPayload {
  id: number;
  email: string;
  rol: string;
}

// Se compara contra este hash cuando el correo no existe, para que la respuesta
// tarde lo mismo y no se pueda averiguar qué correos están registrados.
const HASH_FALSO = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8.4GuFJeJ2G9Yg1Q2z2n5Jm0r6vB2K";

function datosPublicos(usuario: Usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol
  };
}

function emitirSesion(usuario: Usuario) {
  const payload: TokenPayload = {
    id: usuario.id,
    email: usuario.email,
    rol: usuario.rol
  };

  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: "1h" });

  return { token, usuario: datosPublicos(usuario) };
}

export async function loginService(data: LoginData) {
  const usuario = await buscarPorEmail(data.email);

  const passwordCorrecto = await bcrypt.compare(
    data.password,
    usuario?.passwordHash ?? HASH_FALSO
  );

  if (!usuario || !usuario.activo || !passwordCorrecto) {
    return null;
  }

  return emitirSesion(usuario);
}

/** Identity Provider federado: cambia un ID token de Firebase por el JWT de la API. */
export async function loginFirebaseService(idToken: string) {
  const email = await verificarIdToken(idToken);

  if (!email) {
    return null;
  }

  const usuario = await buscarPorEmail(email.toLowerCase());

  if (!usuario || !usuario.activo) {
    return null;
  }

  return emitirSesion(usuario);
}

export type ResultadoAuth0 =
  | { estado: "ok"; sesion: ReturnType<typeof emitirSesion> }
  | { estado: "invalido" }
  | { estado: "no-registrado"; email: string };

/**
 * Identity Provider federado (Auth0): cambia un ID token de Auth0 por el JWT de la API.
 * La cuenta debe existir y estar activa en Servistock (la crea un Administrador con ese mismo correo):
 * Auth0 solo demuestra quién es la persona, los permisos siguen siendo los de Servistock.
 */
export async function loginAuth0Service(idToken: string): Promise<ResultadoAuth0> {
  const email = await verificarIdTokenAuth0(idToken);

  if (!email) {
    return { estado: "invalido" };
  }

  const usuario = await buscarPorEmail(email);

  if (!usuario || !usuario.activo) {
    return { estado: "no-registrado", email };
  }

  return { estado: "ok", sesion: emitirSesion(usuario) };
}

export async function perfilService(id: number) {
  const usuario = await buscarPorId(id);

  if (!usuario || !usuario.activo) {
    return null;
  }

  return datosPublicos(usuario);
}
