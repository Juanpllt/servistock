import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";

export const auth0Activo = env.auth0.activo;

// Las claves públicas de Auth0 se descargan una vez y jose las mantiene en caché (y las renueva si rotan)
const claves = auth0Activo
  ? createRemoteJWKSet(
      new URL(env.auth0.jwksUri || `${env.auth0.issuer.replace(/\/?$/, "/")}.well-known/jwks.json`)
    )
  : null;

/**
 * Identity Provider federado (Auth0): valida el ID token que Auth0 entregó al navegador y devuelve el
 * correo verificado. Comprueba firma (RS256), emisor, destinatario (Client ID) y vencimiento.
 * Exige `email_verified` para que nadie pueda registrarse en Auth0 con un correo ajeno.
 */
export async function verificarIdTokenAuth0(idToken: string): Promise<string | null> {
  if (!claves) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(idToken, claves, {
      issuer: env.auth0.issuer,
      audience: env.auth0.clientId,
      algorithms: ["RS256"]
    });

    return payload["email_verified"] === true && typeof payload["email"] === "string"
      ? payload["email"].toLowerCase()
      : null;
  } catch {
    return null;
  }
}
