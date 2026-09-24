import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool(env.db);

/** Acepta el pool o un cliente de transacción, para reutilizar los mismos repositorios. */
export type Ejecutor = Pick<pg.Pool, "query">;

/** Ejecuta `trabajo` dentro de una transacción ACID: COMMIT si termina, ROLLBACK completo si falla (ADR-001). */
export async function conTransaccion<T>(trabajo: (cliente: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const resultado = await trabajo(cliente);
    await cliente.query("COMMIT");
    return resultado;
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
