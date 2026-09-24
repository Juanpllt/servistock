import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API_URL } from './auth.service';

type Parametros = Record<string, string | number | null | undefined>;

/** Cliente HTTP fino: antepone /api y descarta los parámetros vacíos. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(ruta: string, parametros: Parametros = {}) {
    let params = new HttpParams();

    for (const [clave, valor] of Object.entries(parametros)) {
      if (valor !== null && valor !== undefined && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }

    return this.http.get<T>(`${API_URL}${ruta}`, { params });
  }

  post<T>(ruta: string, cuerpo: unknown = {}) {
    return this.http.post<T>(`${API_URL}${ruta}`, cuerpo);
  }

  put<T>(ruta: string, cuerpo: unknown) {
    return this.http.put<T>(`${API_URL}${ruta}`, cuerpo);
  }

  patch<T>(ruta: string, cuerpo: unknown = {}) {
    return this.http.patch<T>(`${API_URL}${ruta}`, cuerpo);
  }

  delete<T>(ruta: string) {
    return this.http.delete<T>(`${API_URL}${ruta}`);
  }

  /** Descarga un archivo (Excel) conservando las cabeceras de la respuesta. */
  descargar(ruta: string) {
    return this.http.get(`${API_URL}${ruta}`, { responseType: 'blob', observe: 'response' });
  }
}

/** Texto amigable para mostrar al usuario a partir de un error HTTP. */
export function mensajeError(error: unknown): string {
  const e = error as HttpErrorResponse;

  if (e?.status === 0) {
    return 'No se pudo conectar con el servidor';
  }

  return e?.error?.mensaje ?? 'Ocurrió un error inesperado';
}
