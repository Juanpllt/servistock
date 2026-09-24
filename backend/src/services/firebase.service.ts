import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { env } from "../config/env.js";

export const firebaseActivo = Boolean(env.firebaseServiceAccount);

function app(): App {
  if (!env.firebaseServiceAccount) {
    throw new Error("Firebase no está configurado (FIREBASE_SERVICE_ACCOUNT)");
  }

  return (
    getApps()[0] ??
    initializeApp({ credential: cert(JSON.parse(env.firebaseServiceAccount)) })
  );
}

/** Firebase Authentication: valida el ID token y devuelve el correo verificado. */
export async function verificarIdToken(idToken: string): Promise<string | null> {
  try {
    const decodificado = await getAuth(app()).verifyIdToken(idToken);
    return decodificado.email_verified && decodificado.email ? decodificado.email : null;
  } catch {
    return null;
  }
}

/** Firebase Cloud Messaging: envía una notificación push a un dispositivo. */
export async function enviarNotificacion(token: string, titulo: string, cuerpo: string) {
  return getMessaging(app()).send({
    token,
    notification: { title: titulo, body: cuerpo }
  });
}
