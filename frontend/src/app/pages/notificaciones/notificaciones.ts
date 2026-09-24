import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { Api, mensajeError } from '../../core/api.service';
import { Notificacion } from '../../core/modelos';
import { NotificacionesStore } from '../../core/notificaciones.service';
import { Realtime } from '../../core/realtime.service';
import { Toast } from '../../core/toast.service';

/** RF-59 / RF-60: notificaciones de producto y de pedido, ordenadas por fecha, marcables como leídas. */
@Component({
  selector: 'app-notificaciones',
  imports: [DatePipe],
  templateUrl: './notificaciones.html',
})
export class Notificaciones implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly store = inject(NotificacionesStore);

  protected readonly lista = signal<Notificacion[]>([]);
  protected readonly cargando = signal(true);
  protected readonly soloNoLeidas = signal(false);

  constructor() {
    inject(Realtime)
      .notificacion$.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.cargar());
  }

  ngOnInit() {
    this.cargar();
  }

  protected cargar() {
    this.api
      .get<{ noLeidas: number; notificaciones: Notificacion[] }>('/notificaciones', {
        soloNoLeidas: this.soloNoLeidas() ? 'true' : null,
      })
      .subscribe({
        next: (r) => {
          this.lista.set(r.notificaciones);
          this.store.noLeidas.set(r.noLeidas);
          this.cargando.set(false);
        },
        error: (e) => {
          this.toast.error(mensajeError(e));
          this.cargando.set(false);
        },
      });
  }

  protected alternarFiltro() {
    this.soloNoLeidas.update((v) => !v);
    this.cargar();
  }

  protected marcarLeida(n: Notificacion) {
    this.api.patch<{ mensaje: string }>(`/notificaciones/${n.tipo}/${n.id}/leida`).subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.cargar();
      },
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  protected marcarTodas() {
    const pendientes = this.lista().filter((n) => !n.leida);

    if (pendientes.length === 0) {
      return;
    }

    forkJoin(pendientes.map((n) => this.api.patch(`/notificaciones/${n.tipo}/${n.id}/leida`))).subscribe({
      next: () => {
        this.toast.exito('Notificaciones marcadas como leídas');
        this.cargar();
      },
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }
}
