import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import type { Auth0Client } from '@auth0/auth0-spa-js';
import { firstValueFrom } from 'rxjs';
import { API_URL } from './auth.service';

interface ConfigAuth0 {
  domain: string;
  clientId: string;
}

/**
 * Ingreso con Auth0 (Identity Provider federado) usando redirección con PKCE:
 *  1. El botón lleva al usuario a la pantalla de login de Auth0.
 *  2. Auth0 regresa a /login con un código; el SDK lo cambia por un ID token.
 *  3. Ese ID token se envía al backend, que lo valida y entrega el JWT propio de la API.
 * La configuración (dominio y Client ID, ambos públicos) la entrega el backend, así que no hay que recompilar.
 */
@Injectable({ providedIn: 'root' })
export class Auth0Login {
  private readonly http = inject(HttpClient);
  private cliente: Auth0Client | null = null;

  /** null = Auth0 no está configurado en el backend (el botón no se muestra). */
  readonly config = signal<ConfigAuth0 | null>(null);
  readonly listo = signal(false);

  async cargarConfiguracion() {
    try {
      const r = await firstValueFrom(this.http.get<{ auth0: ConfigAuth0 | null }>(`${API_URL}/auth/config`));
      this.config.set(r.auth0);
    } catch {
      this.config.set(null);
    } finally {
      this.listo.set(true);
    }
  }

  /** ¿La URL actual es el regreso de Auth0 (con código de autorización o con error)? */
  esRegreso(): boolean {
    const p = new URLSearchParams(window.location.search);
    return (p.has('code') && p.has('state')) || p.has('error');
  }

  async iniciarSesion() {
    const cliente = await this.obtenerCliente();
    await cliente?.loginWithRedirect();
  }

  /** Procesa el regreso de Auth0 y devuelve el ID token, o lanza un Error con el motivo. */
  async completarRegreso(): Promise<string> {
    const params = new URLSearchParams(window.location.search);
    const motivo = params.get('error_description') ?? params.get('error');

    if (motivo) {
      this.limpiarUrl();
      throw new Error(motivo);
    }

    const cliente = await this.obtenerCliente();

    if (!cliente) {
      throw new Error('Auth0 no está configurado');
    }

    try {
      await cliente.handleRedirectCallback();
    } finally {
      // Con éxito o error, se quita ?code=...&state=... para que recargar la página no repita el intento
      this.limpiarUrl();
    }

    const claims = await cliente.getIdTokenClaims();

    if (!claims?.__raw) {
      throw new Error('Auth0 no entregó el identificador de la sesión');
    }

    return claims.__raw;
  }

  private async obtenerCliente(): Promise<Auth0Client | null> {
    if (!this.config()) {
      await this.cargarConfiguracion();
    }

    const config = this.config();

    if (!config) {
      return null;
    }

    // El SDK se descarga solo cuando hace falta (no pesa en la carga inicial de la aplicación).
    // Se usa `new Auth0Client` y no `createAuth0Client`: este último hace una comprobación silenciosa de
    // sesión (iframe) que puede tardar hasta 60 s con la pantalla en "Ingresando..." y aquí no se necesita.
    const { Auth0Client: Cliente } = await import('@auth0/auth0-spa-js');

    this.cliente ??= new Cliente({
      domain: config.domain,
      clientId: config.clientId,
      cacheLocation: 'memory',
      authorizationParams: {
        redirect_uri: `${window.location.origin}/login`,
        scope: 'openid profile email',
      },
    });

    return this.cliente;
  }

  private limpiarUrl() {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}
