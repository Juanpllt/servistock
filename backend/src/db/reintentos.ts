/** Errores de red o de arranque que suelen resolverse solos en unos segundos. */
const TRANSITORIOS = new Set([
  "ENOTFOUND", // el nombre interno (p. ej. postgres.railway.internal) todavía no resuelve
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "57P03" // PostgreSQL está arrancando
]);

export function esTransitorio(error: unknown): boolean {
  const e = error as { code?: string; errors?: { code?: string }[] };
  return TRANSITORIOS.has(e?.code ?? "") || (e?.errors ?? []).some((x) => TRANSITORIOS.has(x?.code ?? ""));
}

interface Opciones {
  intentos?: number;
  esperaMs?: number;
  alReintentar?: (error: unknown, intento: number, intentos: number) => void;
}

/**
 * Ejecuta `tarea` y, si falla por un error transitorio (red o base de datos aún no disponible), reintenta.
 * Errores de otro tipo (contraseña incorrecta, SQL inválido...) se lanzan de inmediato.
 * En plataformas como Railway la red privada puede tardar unos segundos en estar lista al arrancar.
 */
export async function conReintentos<T>(tarea: () => Promise<T>, opciones: Opciones = {}): Promise<T> {
  const { intentos = 30, esperaMs = 2000, alReintentar } = opciones;

  for (let intento = 1; ; intento++) {
    try {
      return await tarea();
    } catch (error) {
      if (!esTransitorio(error) || intento >= intentos) {
        throw error;
      }

      alReintentar?.(error, intento, intentos);
      await new Promise((resolver) => setTimeout(resolver, esperaMs));
    }
  }
}
