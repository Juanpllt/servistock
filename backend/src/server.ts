import { createServer } from "node:http";
import { crearApp } from "./app.js";
import { pool } from "./config/db.js";
import { env } from "./config/env.js";
import { inicializarBaseDeDatos } from "./db/inicializar.js";
import { conReintentos } from "./db/reintentos.js";
import { logger } from "./observability/logger.js";
import { cerrarTiempoReal, iniciarTiempoReal } from "./realtime/socket.js";

// El esquema es idempotente: al arrancar se asegura que la base de datos y las tablas existan
if (process.env.AUTO_INIT_DB !== "false") {
  // Reintenta si la base de datos o la red privada de la plataforma aún no están listas
  await conReintentos(inicializarBaseDeDatos, {
    alReintentar: (error, intento, intentos) =>
      logger.warn("base_de_datos_no_disponible", {
        intento: `${intento}/${intentos}`,
        motivo: (error as { code?: string }).code ?? String(error),
        host: env.db.host
      })
  });
}

const servidor = createServer(crearApp());
iniciarTiempoReal(servidor);

servidor.listen(env.port, () => {
  logger.info(`Servidor funcionando en http://localhost:${env.port}`, {
    logsRemotos: logger.remotoActivo
  });
});

async function cerrar() {
  servidor.close();
  await cerrarTiempoReal();
  await pool.end().catch(() => undefined);
  await logger.flush();
  process.exit(0);
}

process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
