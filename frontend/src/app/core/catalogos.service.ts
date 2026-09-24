import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from './api.service';
import { Catalogo, ESTADO } from './modelos';

/** Catálogos que casi todas las pantallas necesitan (estados, categorías, tipos). */
@Injectable({ providedIn: 'root' })
export class Catalogos {
  private readonly api = inject(Api);

  readonly estados = signal<Catalogo[]>([]);
  readonly categorias = signal<Catalogo[]>([]);
  readonly tiposEntrada = signal<Catalogo[]>([]);
  readonly tiposParticipacion = signal<Catalogo[]>([]);
  readonly tiposEmpleado = signal<Catalogo[]>([]);

  /** Estados que se pueden asignar a mano a una línea de producto: todos menos "En curso" (RF-27/44). */
  readonly estadosLinea = computed(() => this.estados().filter((e) => e.id !== ESTADO.EN_CURSO));

  cargarTodo() {
    this.api.get<Catalogo[]>('/catalogos/estados').subscribe((r) => this.estados.set(r));
    this.recargarCategorias();
    this.api.get<Catalogo[]>('/catalogos/tipos-entrada').subscribe((r) => this.tiposEntrada.set(r));
    this.api
      .get<Catalogo[]>('/catalogos/tipos-participacion')
      .subscribe((r) => this.tiposParticipacion.set(r));
    this.api.get<Catalogo[]>('/catalogos/tipos-empleado').subscribe((r) => this.tiposEmpleado.set(r));
  }

  recargarCategorias() {
    this.api.get<Catalogo[]>('/categorias').subscribe((r) => this.categorias.set(r));
  }

  recargarEstados() {
    this.api.get<Catalogo[]>('/catalogos/estados').subscribe((r) => this.estados.set(r));
  }

  recargarTiposEntrada() {
    this.api.get<Catalogo[]>('/catalogos/tipos-entrada').subscribe((r) => this.tiposEntrada.set(r));
  }

  recargarTiposParticipacion() {
    this.api
      .get<Catalogo[]>('/catalogos/tipos-participacion')
      .subscribe((r) => this.tiposParticipacion.set(r));
  }
}
