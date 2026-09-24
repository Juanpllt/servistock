import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api.service';
import { Notificacion } from './modelos';
import { Realtime } from './realtime.service';
import { Toast } from './toast.service';

/** Contador de notificaciones sin leer, actualizado en vivo por Socket.IO. */
@Injectable({ providedIn: 'root' })
export class NotificacionesStore {
  private readonly api = inject(Api);
  private readonly realtime = inject(Realtime);
  private readonly toast = inject(Toast);
  private iniciado = false;

  readonly noLeidas = signal(0);

  iniciar() {
    this.refrescar();

    if (this.iniciado) {
      return;
    }

    this.iniciado = true;
    this.realtime.notificacion$.subscribe((n) => {
      this.noLeidas.update((valor) => valor + 1);
      this.toast.info(n.mensaje);
    });
  }

  refrescar() {
    this.api
      .get<{ noLeidas: number; notificaciones: Notificacion[] }>('/notificaciones', { soloNoLeidas: 'true' })
      .subscribe((r) => this.noLeidas.set(r.noLeidas));
  }
}
