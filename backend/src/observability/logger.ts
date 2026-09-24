import { Logtail } from "@logtail/node";
import { env } from "../config/env.js";

// Better Stack (Logtail) si hay token; si no, solo consola.
const logtail = env.logtail.sourceToken
  ? new Logtail(
      env.logtail.sourceToken,
      env.logtail.endpoint ? { endpoint: env.logtail.endpoint } : undefined
    )
  : null;

type Contexto = Record<string, unknown>;

export const logger = {
  info(mensaje: string, contexto: Contexto = {}) {
    console.log(mensaje, contexto);
    void logtail?.info(mensaje, contexto);
  },
  warn(mensaje: string, contexto: Contexto = {}) {
    console.warn(mensaje, contexto);
    void logtail?.warn(mensaje, contexto);
  },
  error(mensaje: string, contexto: Contexto = {}) {
    console.error(mensaje, contexto);
    void logtail?.error(mensaje, contexto);
  },
  async flush() {
    await logtail?.flush();
  },
  get remotoActivo() {
    return logtail !== null;
  }
};
