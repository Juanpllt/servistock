import { construirRutasDominio, etiquetasDominio } from "./openapi-dominio.js";

// Contrato OpenAPI 3: es la fuente de verdad que también consume Kong y el frontend.
const usuario = {
  type: "object",
  properties: {
    id: { type: "integer", example: 1 },
    nombre: { type: "string", example: "Administrador" },
    email: { type: "string", example: "admin@correo.com" },
    rol: { type: "string", enum: ["Administrador", "Empleado"] }
  }
};

const sesion = {
  type: "object",
  properties: {
    mensaje: { type: "string" },
    token: { type: "string", description: "JWT válido por 1 hora" },
    usuario: { $ref: "#/components/schemas/Usuario" }
  }
};

const error = (descripcion: string) => ({
  description: descripcion,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
});

const rutasDominio = construirRutasDominio();

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Servistock API",
    version: "1.0.0",
    description:
      "API REST de Servistock (inventario de Servingeniería). Autenticación con JWT y roles Administrador y Empleado. Las operaciones críticas de stock son transaccionales (ACID) y se publican por Socket.IO solo después del COMMIT."
  },
  servers: [{ url: "http://localhost:3000", description: "Local (directo)" }],
  tags: [{ name: "Auth" }, ...etiquetasDominio],
  paths: {
    ...rutasDominio,
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión con correo y contraseña",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "usuario@empresa.com" },
                  password: { type: "string", example: "********" },
                  recaptchaToken: {
                    type: "string",
                    description: "Requerido si reCAPTCHA está activo"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Sesión iniciada",
            content: { "application/json": { schema: sesion } }
          },
          "400": error("Datos inválidos"),
          "401": error("Credenciales incorrectas"),
          "403": error("reCAPTCHA fallido"),
          "429": error("Demasiados intentos")
        }
      }
    },
    "/api/auth/firebase": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión con un ID token de Firebase Authentication",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["idToken"],
                properties: { idToken: { type: "string" } }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Sesión iniciada",
            content: { "application/json": { schema: sesion } }
          },
          "401": error("Token de Firebase inválido o usuario no registrado"),
          "501": error("Firebase no configurado")
        }
      }
    },
    "/api/auth/auth0": {
      post: {
        tags: ["Auth"],
        summary: "Iniciar sesión con un ID token de Auth0 (la cuenta debe existir en Servistock)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["idToken"],
                properties: { idToken: { type: "string", description: "ID token (JWT RS256) emitido por Auth0" } }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Sesión iniciada",
            content: { "application/json": { schema: sesion } }
          },
          "401": error("Token de Auth0 inválido, vencido o con correo sin verificar"),
          "403": error("El correo no está registrado en Servistock"),
          "501": error("Auth0 no configurado")
        }
      }
    },
    "/api/auth/config": {
      get: {
        tags: ["Auth"],
        summary: "Configuración pública del login (dominio y Client ID de Auth0, o null si está desactivado)",
        responses: { "200": { description: "Configuración pública" } }
      }
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Datos del usuario autenticado",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Usuario actual",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { usuario: { $ref: "#/components/schemas/Usuario" } }
                }
              }
            }
          },
          "401": error("Token requerido, inválido o vencido")
        }
      }
    },
    "/api/notificaciones": {
      ...rutasDominio["/api/notificaciones"],
      post: {
        tags: ["Notificaciones"],
        summary: "Enviar notificación push (FCM). Solo Administrador",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "titulo", "cuerpo"],
                properties: {
                  token: { type: "string", description: "Token FCM del dispositivo" },
                  titulo: { type: "string", example: "Stock bajo" },
                  cuerpo: { type: "string", example: "Quedan 3 unidades de Producto X" }
                }
              }
            }
          }
        },
        responses: {
          "202": { description: "Notificación enviada" },
          "400": error("Datos inválidos"),
          "401": error("No autenticado"),
          "403": error("Sin permiso"),
          "501": error("FCM no configurado")
        }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    schemas: {
      Usuario: usuario,
      Error: {
        type: "object",
        properties: {
          mensaje: { type: "string" },
          errores: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};
