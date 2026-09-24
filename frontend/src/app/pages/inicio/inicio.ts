import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { debounceTime, merge } from 'rxjs';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Resumen } from '../../core/modelos';
import { Realtime } from '../../core/realtime.service';
import { EstadoInsignia } from '../../shared/estado-insignia';

/** RF-72: al iniciar sesión se ve el resumen de productos en stock bajo y proyectos en curso. */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink, EstadoInsignia, DatePipe],
  templateUrl: './inicio.html',
})
export class Inicio {
  private readonly api = inject(Api);
  private readonly realtime = inject(Realtime);
  protected readonly auth = inject(AuthService);

  protected readonly resumen = signal<Resumen | null>(null);
  protected readonly cargando = signal(true);

  constructor() {
    this.cargar();

    // Reactividad: cualquier cambio de stock o movimiento refresca el resumen sin recargar la página
    merge(this.realtime.stock$, this.realtime.movimiento$)
      .pipe(debounceTime(400), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.cargar());
  }

  private cargar() {
    this.api.get<Resumen>('/resumen').subscribe({
      next: (r) => {
        this.resumen.set(r);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false),
    });
  }
}
