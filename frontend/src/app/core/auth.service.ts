import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

// Ruta relativa: en desarrollo la atiende el proxy de `ng serve` y en producción nginx/Kong
export const API_URL = '/api';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
}

interface LoginResponse {
  mensaje: string;
  token: string;
  usuario: Usuario;
}

const TOKEN_KEY = 'token';
const USUARIO_KEY = 'usuario';
/** Guarda {domain, clientId} cuando la sesión se abrió con Auth0, para cerrar también la sesión de Auth0. */
const VIA_AUTH0_KEY = 'via_auth0';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _usuario = signal<Usuario | null>(this.leerUsuario());

  readonly usuario = this._usuario.asReadonly();
  readonly autenticado = computed(() => this._usuario() !== null);
  readonly esAdmin = computed(() => this._usuario()?.rol === 'Administrador');

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>(`${API_URL}/auth/login`, { email, password })
      .pipe(tap((respuesta) => this.guardarSesion(respuesta)));
  }

  /** Cambia el ID token de Auth0 por la sesión propia de Servistock (el backend valida el token). */
  loginAuth0(idToken: string, config: { domain: string; clientId: string }) {
    return this.http.post<LoginResponse>(`${API_URL}/auth/auth0`, { idToken }).pipe(
      tap((respuesta) => {
        this.guardarSesion(respuesta);
        localStorage.setItem(VIA_AUTH0_KEY, JSON.stringify(config));
      }),
    );
  }

  private guardarSesion(respuesta: LoginResponse) {
    localStorage.setItem(TOKEN_KEY, respuesta.token);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(respuesta.usuario));
    this._usuario.set(respuesta.usuario);
  }

  /** Actualiza los datos guardados de la sesión (p. ej. tras editar "Mi cuenta"). */
  actualizarUsuario(usuario: Usuario) {
    localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
    this._usuario.set(usuario);
  }

  logout() {
    const viaAuth0 = this.leerViaAuth0();

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USUARIO_KEY);
    localStorage.removeItem(VIA_AUTH0_KEY);
    this._usuario.set(null);

    if (viaAuth0) {
      // También se cierra la sesión en Auth0; así el próximo ingreso permite elegir otra cuenta
      const regreso = encodeURIComponent(`${window.location.origin}/login`);
      window.location.href = `https://${viaAuth0.domain}/v2/logout?client_id=${encodeURIComponent(viaAuth0.clientId)}&returnTo=${regreso}`;
      return;
    }

    this.router.navigateByUrl('/login');
  }

  private leerViaAuth0(): { domain: string; clientId: string } | null {
    try {
      const guardado = localStorage.getItem(VIA_AUTH0_KEY);
      return guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  }

  private leerUsuario(): Usuario | null {
    try {
      const guardado = localStorage.getItem(USUARIO_KEY);
      return localStorage.getItem(TOKEN_KEY) && guardado ? JSON.parse(guardado) : null;
    } catch {
      return null;
    }
  }
}
