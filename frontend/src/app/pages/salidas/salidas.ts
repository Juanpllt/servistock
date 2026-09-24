import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, debounceTime, filter } from 'rxjs';
import { Api, mensajeError } from '../../core/api.service';
import { Catalogos } from '../../core/catalogos.service';
import { Confirmacion, ESTADO, Proyecto, Salida, SalidaDetalle } from '../../core/modelos';
import { Realtime } from '../../core/realtime.service';
import { Toast } from '../../core/toast.service';
import { EstadoInsignia } from '../../shared/estado-insignia';
import { LineaForm, LineasEditor } from '../../shared/lineas-editor';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-salidas',
  imports: [FormsModule, DatePipe, Modal, EstadoInsignia, LineasEditor],
  templateUrl: './salidas.html',
})
export class Salidas implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute);
  protected readonly catalogos = inject(Catalogos);
  protected readonly COMPLETADO = ESTADO.COMPLETADO;

  protected readonly salidas = signal<Salida[]>([]);
  protected readonly cargando = signal(true);
  protected readonly estadoFiltro = signal<number | ''>('');
  protected readonly detalle = signal<SalidaDetalle | null>(null);

  // Nueva salida (RF-39 / caso de uso 5.3)
  protected readonly nueva = signal(false);
  protected readonly proyectos = signal<Proyecto[]>([]);
  protected readonly lineas = signal<LineaForm[]>([]);
  protected readonly guardando = signal(false);
  protected proyectoId: number | null = null;

  constructor() {
    inject(Realtime)
      .movimiento$.pipe(
        filter((m) => m.tipo === 'salida'),
        debounceTime(300),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.cargar();
        const abierta = this.detalle();
        if (abierta) this.abrir(abierta.id);
      });
  }

  ngOnInit() {
    this.cargar();

    if (this.route.snapshot.queryParamMap.get('nueva')) {
      this.abrirNueva();
    }
  }

  protected cargar() {
    this.cargando.set(true);
    this.api.get<Salida[]>('/salidas', { estadoId: this.estadoFiltro() }).subscribe({
      next: (lista) => {
        this.salidas.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected abrirNueva() {
    // La salida solo puede asociarse a un proyecto en curso
    this.api.get<Proyecto[]>('/proyectos', { estadoId: ESTADO.EN_CURSO }).subscribe((lista) => this.proyectos.set(lista));
    this.proyectoId = null;
    this.lineas.set([]);
    this.nueva.set(true);
  }

  protected registrar() {
    if (!this.proyectoId) return this.toast.error('Selecciona el proyecto de la salida');
    if (this.lineas().length === 0) return this.toast.error('Agrega al menos un producto con su cantidad');

    const excedida = this.lineas().find((l) => l.cantidad > l.stock);

    if (excedida) {
      return this.toast.error(`Stock insuficiente de "${excedida.nombre}": disponible ${excedida.stock}`);
    }

    this.guardando.set(true);
    this.api
      .post<Confirmacion<SalidaDetalle>>('/salidas', {
        proyectoId: this.proyectoId,
        lineas: this.lineas().map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
      })
      .subscribe({
        next: (r) => {
          this.toast.exito(r.mensaje);
          this.nueva.set(false);
          this.guardando.set(false);
          this.cargar();
          this.detalle.set(r.data);
        },
        error: (e) => {
          // El backend es quien decide (stock actual real, concurrencia): se muestra su mensaje
          this.toast.error(mensajeError(e));
          this.guardando.set(false);
        },
      });
  }

  protected abrir(id: number) {
    this.api.get<SalidaDetalle>(`/salidas/${id}`).subscribe({
      next: (d) => this.detalle.set(d),
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  private aplicar(peticion: Observable<Confirmacion<SalidaDetalle>>) {
    peticion.subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.detalle.set(r.data);
        this.cargar();
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        const abierta = this.detalle();
        if (abierta) this.abrir(abierta.id);
      },
    });
  }

  /** RF-48 */
  protected cambiarEstado(tipoEstadoId: number) {
    const d = this.detalle();
    if (d) this.aplicar(this.api.patch<Confirmacion<SalidaDetalle>>(`/salidas/${d.id}/estado`, { tipoEstadoId }));
  }

  /** RF-44 */
  protected cambiarEstadoLinea(lineaId: number, tipoEstadoId: number) {
    const d = this.detalle();
    if (d) {
      this.aplicar(this.api.patch<Confirmacion<SalidaDetalle>>(`/salidas/${d.id}/lineas/${lineaId}/estado`, { tipoEstadoId }));
    }
  }

  /** RF-47: solo líneas no completadas; el stock se ajusta por la diferencia. */
  protected editarCantidad(lineaId: number, cantidad: number) {
    const d = this.detalle();
    if (d) {
      this.aplicar(this.api.put<Confirmacion<SalidaDetalle>>(`/salidas/${d.id}/lineas/${lineaId}`, { cantidad: Number(cantidad) }));
    }
  }
}
