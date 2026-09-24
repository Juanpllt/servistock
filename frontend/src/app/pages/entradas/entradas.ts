import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable, debounceTime, filter } from 'rxjs';
import { Api, mensajeError } from '../../core/api.service';
import { Catalogos } from '../../core/catalogos.service';
import { Confirmacion, ESTADO, Entrada, EntradaDetalle, Pedido } from '../../core/modelos';
import { Realtime } from '../../core/realtime.service';
import { Toast } from '../../core/toast.service';
import { EstadoInsignia } from '../../shared/estado-insignia';
import { LineaForm, LineasEditor } from '../../shared/lineas-editor';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-entradas',
  imports: [FormsModule, DatePipe, Modal, EstadoInsignia, LineasEditor],
  templateUrl: './entradas.html',
})
export class Entradas implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute);
  protected readonly catalogos = inject(Catalogos);
  protected readonly COMPLETADO = ESTADO.COMPLETADO;

  protected readonly entradas = signal<Entrada[]>([]);
  protected readonly cargando = signal(true);
  protected readonly estadoFiltro = signal<number | ''>('');
  protected readonly detalle = signal<EntradaDetalle | null>(null);

  // Nueva entrada (RF-22 / caso de uso 5.2)
  protected readonly nueva = signal(false);
  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly lineas = signal<LineaForm[]>([]);
  protected readonly guardando = signal(false);
  protected pedidoId: number | null = null;
  protected tipoEntradaId: number | null = null;

  constructor() {
    inject(Realtime)
      .movimiento$.pipe(
        filter((m) => m.tipo === 'entrada'),
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
    const params = this.route.snapshot.queryParamMap;

    if (params.get('nueva')) {
      this.abrirNueva(params.get('pedidoId') ? Number(params.get('pedidoId')) : null);
    }
  }

  protected cargar() {
    this.cargando.set(true);
    this.api.get<Entrada[]>('/entradas', { estadoId: this.estadoFiltro() }).subscribe({
      next: (lista) => {
        this.entradas.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected abrirNueva(pedidoId: number | null = null) {
    this.api.get<Pedido[]>('/pedidos').subscribe((lista) => this.pedidos.set(lista));
    this.pedidoId = pedidoId;
    this.tipoEntradaId = this.catalogos.tiposEntrada()[0]?.id ?? null;
    this.lineas.set([]);
    this.nueva.set(true);
  }

  protected registrar() {
    if (!this.pedidoId) return this.toast.error('Selecciona el pedido asociado a la entrada');
    if (!this.tipoEntradaId) return this.toast.error('Selecciona el tipo de entrada');
    if (this.lineas().length === 0) return this.toast.error('Agrega al menos un producto con su cantidad');

    this.guardando.set(true);
    this.api
      .post<Confirmacion<EntradaDetalle>>('/entradas', {
        pedidoId: this.pedidoId,
        tipoEntradaId: this.tipoEntradaId,
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
          this.toast.error(mensajeError(e));
          this.guardando.set(false);
        },
      });
  }

  protected abrir(id: number) {
    this.api.get<EntradaDetalle>(`/entradas/${id}`).subscribe({
      next: (d) => this.detalle.set(d),
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  private aplicar(peticion: Observable<Confirmacion<EntradaDetalle>>) {
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

  /** RF-28 */
  protected cambiarEstado(tipoEstadoId: number) {
    const d = this.detalle();
    if (d) this.aplicar(this.api.patch<Confirmacion<EntradaDetalle>>(`/entradas/${d.id}/estado`, { tipoEstadoId }));
  }

  /** RF-27: confirma o descarta la llegada de cada línea de producto por separado. */
  protected cambiarEstadoLinea(lineaId: number, tipoEstadoId: number) {
    const d = this.detalle();
    if (d) {
      this.aplicar(this.api.patch<Confirmacion<EntradaDetalle>>(`/entradas/${d.id}/lineas/${lineaId}/estado`, { tipoEstadoId }));
    }
  }

  /** RF-26: solo líneas no completadas; el stock se ajusta por la diferencia. */
  protected editarCantidad(lineaId: number, cantidad: number) {
    const d = this.detalle();
    if (d) {
      this.aplicar(this.api.put<Confirmacion<EntradaDetalle>>(`/entradas/${d.id}/lineas/${lineaId}`, { cantidad: Number(cantidad) }));
    }
  }
}
