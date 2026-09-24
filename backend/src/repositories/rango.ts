import { env } from "../config/env.js";

export interface Rango {
  desde?: string | undefined;
  hasta?: string | undefined;
}

/**
 * Condiciones SQL para filtrar `columna` (timestamptz) por días completos, en la zona horaria del negocio:
 * desde 00:00 del día `desde` hasta el final del día `hasta` (inclusive).
 */
export function condicionesRango(columna: string, rango: Rango | undefined, valores: unknown[]): string[] {
  const condiciones: string[] = [];

  if (rango?.desde) {
    valores.push(rango.desde, env.zonaHoraria);
    condiciones.push(`${columna} >= ($${valores.length - 1}::date::timestamp AT TIME ZONE $${valores.length})`);
  }

  if (rango?.hasta) {
    valores.push(rango.hasta, env.zonaHoraria);
    condiciones.push(
      `${columna} < (($${valores.length - 1}::date + 1)::timestamp AT TIME ZONE $${valores.length})`
    );
  }

  return condiciones;
}
