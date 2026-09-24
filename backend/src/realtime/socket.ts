import type { Server as ServidorHttp } from "node:http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { env } from "../config/env.js";
import type { TokenPayload } from "../services/auth.service.js";

/**
 * Canal reactivo (decisión transversal): el backend publica eventos SOLO después del COMMIT.
 * Eventos:
 *  - stock:actualizado     -> [{ id, nombre, stockActual, cantidadMinimaStock }]
 *  - notificacion:nueva    -> { tipo: "producto" | "pedido", ... }
 *  - movimiento:registrado -> { tipo: "pedido" | "entrada" | "salida" | "proyecto", id }
 */
let io: Server | null = null;

export function iniciarTiempoReal(servidor: ServidorHttp): Server {
  io = new Server(servidor, { cors: { origin: env.corsOrigin } });

  // Solo usuarios con JWT válido pueden conectarse
  io.use((socket, next) => {
    const token = socket.handshake.auth?.["token"];

    try {
      socket.data["usuario"] = jwt.verify(String(token ?? ""), env.jwtSecret) as TokenPayload;
      next();
    } catch {
      next(new Error("No autorizado"));
    }
  });

  return io;
}

export function emitir(evento: string, datos: unknown): void {
  io?.emit(evento, datos);
}

export async function cerrarTiempoReal(): Promise<void> {
  if (io) {
    await io.close();
    io = null;
  }
}
