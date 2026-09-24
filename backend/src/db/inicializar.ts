import { readFileSync } from "node:fs";
import pg from "pg";
import { env } from "../config/env.js";

const esquema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

/**
 * Crea la base de datos si no existe y aplica el esquema y los datos iniciales.
 * Es idempotente (todo usa IF NOT EXISTS / ON CONFLICT), así que se puede ejecutar en cada arranque.
 */
export async function inicializarBaseDeDatos(): Promise<void> {
  // 1. Crear la base de datos si no existe (conectando a la base "postgres").
  //    Con una base administrada por la plataforma (DATABASE_URL) ya existe y no hay permiso para crearla.
  if (!env.dbGestionada) {
    const admin = new pg.Client({ ...env.db, database: "postgres" });
    await admin.connect();

    try {
      const existe = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [env.db.database]);

      if (existe.rowCount === 0) {
        await admin.query(`CREATE DATABASE "${env.db.database}"`);
        console.log(`Base de datos "${env.db.database}" creada`);
      }
    } finally {
      await admin.end();
    }
  }

  // 2. Crear tablas y datos iniciales
  const client = new pg.Client(env.db);
  await client.connect();

  try {
    await client.query(esquema);
  } finally {
    await client.end();
  }
}
