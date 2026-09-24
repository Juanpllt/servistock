import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { pool } from "./config/db.js";
import { env } from "./config/env.js";
import { openapi } from "./docs/openapi.js";
import { AppError } from "./errors.js";
import { verificarToken } from "./middlewares/auth.middleware.js";
import { registrarPeticion } from "./middlewares/request-log.middleware.js";
import { logger } from "./observability/logger.js";
import authRoutes from "./routes/auth.routes.js";
import { routerCatalogo } from "./routes/catalogo.routes.js";
import empleadoRoutes from "./routes/empleado.routes.js";
import entradaRoutes from "./routes/entrada.routes.js";
import exportacionRoutes from "./routes/exportacion.routes.js";
import historialRoutes from "./routes/historial.routes.js";
import notificacionesRoutes from "./routes/notificaciones.routes.js";
import pedidoRoutes from "./routes/pedido.routes.js";
import productoRoutes from "./routes/producto.routes.js";
import proyectoRoutes from "./routes/proyecto.routes.js";
import resumenRoutes from "./routes/resumen.routes.js";
import salidaRoutes from "./routes/salida.routes.js";

const ADMIN = ["Administrador"];

/** Recursos con nombre fijo que nunca deben quedar en caché (para que las actualizaciones lleguen). */
const SIN_CACHE = /(index\.html|ngsw\.json|ngsw-worker\.js|manifest\.webmanifest|safety-worker\.js)$/;
/** Archivos con hash en el nombre (main-XXXX.js, chunk-XXXX.js, styles-XXXX.css): cambian si cambia el contenido. */
const CON_HASH = /(main|chunk|polyfills|styles)-[A-Za-z0-9]+\.(js|css)$/;

/** Traduce errores de PostgreSQL que no se controlaron en el servicio a respuestas HTTP claras. */
function errorDePostgres(codigo: string | undefined): { status: number; mensaje: string } | null {
  switch (codigo) {
    case "23505":
      return { status: 409, mensaje: "Ya existe un registro con esos datos" };
    case "23503":
      return { status: 409, mensaje: "La operación referencia datos inexistentes o en uso" };
    case "23514":
      return { status: 409, mensaje: "La operación viola una regla de integridad de los datos" };
    case "22P02":
    case "22003":
      return { status: 400, mensaje: "Algún dato tiene un formato o valor no válido" };
    default:
      return null;
  }
}

function manejarErrores(error: Error, req: Request, res: Response, next: NextFunction) {
  // Si ya se empezó a enviar la respuesta (p. ej. un XLSX en streaming) Express cierra la conexión
  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof AppError) {
    return res.status(error.status).json({ mensaje: error.message });
  }

  const estado = (error as { status?: number }).status;

  if (estado === 400 || estado === 413) {
    return res.status(estado).json({ mensaje: "Solicitud no válida" });
  }

  const pg = errorDePostgres((error as { code?: string }).code);

  if (pg) {
    return res.status(pg.status).json({ mensaje: pg.mensaje });
  }

  logger.error("error_no_controlado", {
    requestId: res.locals["requestId"],
    ruta: req.originalUrl,
    error: error.message
  });

  return res.status(500).json({ mensaje: "Error interno del servidor" });
}

/** Directiva CSP de la aplicación Angular servida por el backend (Auth0 se permite solo si está activo). */
function politicaDeContenido() {
  const auth0 = env.auth0.activo ? [`https://${env.auth0.domain}`] : [];

  return {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", ...auth0],
      frameSrc: [...auth0],
      fontSrc: ["'self'", "data:"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  };
}

export function crearApp() {
  const app = express();
  const carpetaFrontend = env.frontendDir ? resolve(env.frontendDir) : null;
  const sirveFrontend = Boolean(carpetaFrontend && existsSync(join(carpetaFrontend, "index.html")));

  // Detrás de Kong / Cloudflare / nginx / Railway la IP real llega en X-Forwarded-For
  app.set("trust proxy", 1);

  app.use(helmet(sirveFrontend ? { contentSecurityPolicy: politicaDeContenido() } : {}));
  app.use(
    cors({
      origin: env.corsOrigin,
      exposedHeaders: ["Content-Disposition", "X-Exportacion-Vacia", "X-Request-Id"]
    })
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(registrarPeticion);

  if (!sirveFrontend) {
    app.get("/", (_req, res) => {
      res.json({ mensaje: "Backend funcionando" });
    });
  }

  // Health check para Docker / balanceador (RNF-01, ADR-004): verifica también la base de datos
  app.get("/api/salud", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ estado: "ok" });
    } catch {
      res.status(503).json({ estado: "sin base de datos" });
    }
  });

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
  app.get("/api/openapi.json", (_req, res) => {
    res.json(openapi);
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/notificaciones", notificacionesRoutes);

  app.use("/api/empleados", verificarToken, empleadoRoutes);
  app.use("/api/productos", verificarToken, productoRoutes);
  app.use("/api/pedidos", verificarToken, pedidoRoutes);
  app.use("/api/entradas", verificarToken, entradaRoutes);
  app.use("/api/proyectos", verificarToken, proyectoRoutes);
  app.use("/api/salidas", verificarToken, salidaRoutes);
  app.use("/api/historial", verificarToken, historialRoutes);
  app.use("/api/exportaciones", verificarToken, exportacionRoutes);
  app.use("/api/resumen", verificarToken, resumenRoutes);

  // Catálogos (RF-13 a RF-15 y RF-61 a RF-64). Las categorías las gestiona cualquier empleado.
  app.use("/api/categorias", verificarToken, routerCatalogo("categorias_producto", "Categoría"));
  const catalogos = "/api/catalogos";
  app.use(`${catalogos}/tipos-entrada`, verificarToken, routerCatalogo("tipos_entrada", "Tipo de entrada", { rolesEscritura: ADMIN }));
  app.use(`${catalogos}/tipos-participacion`, verificarToken, routerCatalogo("tipos_empleado_proyecto", "Tipo de participación", { rolesEscritura: ADMIN }));
  app.use(`${catalogos}/tipos-notificacion-producto`, verificarToken, routerCatalogo("tipos_notificacion_producto", "Tipo de notificación de producto", { rolesEscritura: ADMIN }));
  app.use(`${catalogos}/tipos-notificacion-pedido`, verificarToken, routerCatalogo("tipos_notificacion_pedido", "Tipo de notificación de pedido", { rolesEscritura: ADMIN }));
  app.use(`${catalogos}/estados`, verificarToken, routerCatalogo("tipos_estado", "Estado", { rolesEscritura: ADMIN }));
  // RN-12: TipoEmpleado no se edita libremente; solo lectura (cambio de tipo: PATCH /empleados/:id/tipo)
  app.use(`${catalogos}/tipos-empleado`, verificarToken, routerCatalogo("roles", "Tipo de empleado", { soloLectura: true }));

  app.use("/api", (_req, res) => {
    res.status(404).json({ mensaje: "Ruta no encontrada" });
  });

  // Aplicación Angular (PWA): archivos estáticos y, para cualquier otra ruta, index.html (enrutado del cliente)
  if (sirveFrontend && carpetaFrontend) {
    app.use(
      express.static(carpetaFrontend, {
        index: false,
        setHeaders(res, ruta) {
          if (SIN_CACHE.test(ruta)) {
            res.setHeader("Cache-Control", "no-cache");
          } else if (CON_HASH.test(ruta)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else {
            res.setHeader("Cache-Control", "public, max-age=3600");
          }
        }
      })
    );

    app.use((req: Request, res: Response, next: NextFunction) => {
      if ((req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/socket.io")) {
        return next();
      }

      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(join(carpetaFrontend, "index.html"));
    });
  }

  app.use(manejarErrores);

  return app;
}
