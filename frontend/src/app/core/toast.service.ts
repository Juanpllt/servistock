import { Injectable, signal } from '@angular/core';

export interface Aviso {
  id: number;
  tipo: 'exito' | 'error' | 'info';
  texto: string;
}

/** Mensajes de confirmación (éxito) y de error que exigen los requisitos funcionales. */
@Injectable({ providedIn: 'root' })
export class Toast {
  private siguiente = 1;
  readonly avisos = signal<Aviso[]>([]);

  exito(texto: string) {
    this.mostrar('exito', texto);
  }

  error(texto: string) {
    this.mostrar('error', texto, 6000);
  }

  info(texto: string) {
    this.mostrar('info', texto);
  }

  cerrar(id: number) {
    this.avisos.update((lista) => lista.filter((a) => a.id !== id));
  }

  private mostrar(tipo: Aviso['tipo'], texto: string, duracion = 4000) {
    const id = this.siguiente++;
    this.avisos.update((lista) => [...lista, { id, tipo, texto }]);
    setTimeout(() => this.cerrar(id), duracion);
  }
}
