import { Redis } from "@upstash/redis";
import { env } from "../config/env.js";

// Caché distribuido: Redis en Upstash si hay credenciales; si no, memoria local del proceso.
const redis =
  env.redis.url && env.redis.token ? new Redis({ url: env.redis.url, token: env.redis.token }) : null;

const memoria = new Map<string, { valor: number; expira: number }>();

export const cacheDistribuido = redis !== null;

/** Suma 1 al contador de la clave y devuelve el nuevo valor. La ventana empieza en el primer incremento. */
export async function incrementar(clave: string, ttlSegundos: number): Promise<number> {
  if (redis) {
    const valor = await redis.incr(clave);
    if (valor === 1) {
      await redis.expire(clave, ttlSegundos);
    }
    return valor;
  }

  const ahora = Date.now();
  const actual = memoria.get(clave);

  if (!actual || actual.expira <= ahora) {
    memoria.set(clave, { valor: 1, expira: ahora + ttlSegundos * 1000 });
    return 1;
  }

  actual.valor += 1;
  return actual.valor;
}

export async function reiniciar(clave: string): Promise<void> {
  if (redis) {
    await redis.del(clave);
    return;
  }

  memoria.delete(clave);
}
