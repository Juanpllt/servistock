import dotenv from "dotenv";

dotenv.config({ quiet: true });

function requerida(nombre: string): string {
  const valor = process.env[nombre];

  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre} en backend/.env`);
  }

  return valor;
}

interface ConfigBaseDeDatos {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
}

/**
 * Railway, Render, Heroku, etc. entregan la base de datos como una sola URL (DATABASE_URL).
 * Si existe, tiene prioridad sobre las variables DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME.
 */
function baseDeDatos(): { config: ConfigBaseDeDatos; gestionada: boolean } {
  const url = process.env.DATABASE_URL;
  const exigeSsl = process.env.DB_SSL === "true";

  if (url) {
    const u = new URL(url);
    const sslmode = u.searchParams.get("sslmode");

    return {
      gestionada: true,
      config: {
        host: u.hostname,
        port: Number(u.port || 5432),
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ""),
        ...(exigeSsl || (sslmode && sslmode !== "disable") ? { ssl: { rejectUnauthorized: false } } : {})
      }
    };
  }

  return {
    gestionada: false,
    config: {
      host: process.env.DB_HOST ?? "localhost",
      port: Number(process.env.DB_PORT ?? 5432),
      user: process.env.DB_USER ?? "postgres",
      password: process.env.DB_PASSWORD ?? "",
      database: process.env.DB_NAME ?? "servistack",
      ...(exigeSsl ? { ssl: { rejectUnauthorized: false } } : {})
    }
  };
}

const { config: db, gestionada: dbGestionada } = baseDeDatos();

const auth0Domain = (process.env.AUTH0_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const auth0ClientId = process.env.AUTH0_CLIENT_ID ?? "";

export const env = {
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:4200",
  jwtSecret: requerida("JWT_SECRET"),
  // Zona horaria del negocio: define qué día es "hoy" en los rangos de fechas y en las exportaciones
  zonaHoraria: process.env.TZ_NEGOCIO ?? "America/Bogota",
  db,
  // true cuando la base la administra la plataforma (DATABASE_URL): no se intenta crear la base de datos
  dbGestionada,
  // Carpeta con la aplicación Angular compilada. Si existe, el backend también sirve el frontend (un solo servicio)
  frontendDir: process.env.FRONTEND_DIR || undefined,
  // Auth0 (Identity Provider federado). Sin AUTH0_DOMAIN y AUTH0_CLIENT_ID queda desactivado
  auth0: {
    domain: auth0Domain,
    clientId: auth0ClientId,
    issuer: process.env.AUTH0_ISSUER ?? (auth0Domain ? `https://${auth0Domain}/` : ""),
    // Solo se cambia en pruebas (servidor de claves local); con Auth0 real siempre es la URL por defecto
    jwksUri: process.env.AUTH0_JWKS_URI ?? "",
    activo: Boolean(auth0Domain && auth0ClientId)
  },
  // Bloques opcionales: si la variable está vacía el bloque queda desactivado
  logtail: {
    sourceToken: process.env.LOGTAIL_SOURCE_TOKEN || undefined,
    endpoint: process.env.LOGTAIL_ENDPOINT || undefined
  },
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL || undefined,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || undefined
  },
  recaptchaSecret: process.env.RECAPTCHA_SECRET || undefined,
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT || undefined
};
