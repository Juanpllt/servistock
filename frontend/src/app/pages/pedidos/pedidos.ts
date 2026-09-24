import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { debounceTime, filter } from 'rxjs';
import { Api, mensajeError } from '../../core/api.service';
import { Catalogos } from '../../core/catalogos.service';
import { Confirmacion, Pedido, PedidoDetalle } from '../../core/modelos';
import { Realtime } from '../../core/realtime.service';
import { Toast } from '../../core/toast.service';
import { EstadoInsignia } from '../../shared/estado-insignia';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-pedidos',
  imports: [FormsModule, RouterLink, DatePipe, Modal, EstadoInsignia],
  templateUrl: './pedidos.html',
})
export class Pedidos implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  private readonly route = inject(ActivatedRoute);
  protected readonly catalogos = inject(Catalogos);

  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly cargando = signal(true);
  protected readonly estadoFiltro = signal<number | ''>('');
  protected readonly detalle = signal<PedidoDetalle | null>(null);
  protected readonly formulario = signal<'nuevo' | 'editar' | null>(null);
  protected readonly guardando = signal(false);
  protected proveedor = '';

  constructor() {
    inject(Realtime)
      .movimiento$.pipe(
        filter((m) => m.tipo === 'pedido' || m.tipo === 'entrada'),
        debounceTime(300),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.cargar();
        const abierto = this.detalle();
        if (abierto) this.abrir(abierto.id);
      });
  }

  ngOnInit() {
    this.cargar();

    if (this.route.snapshot.queryParamMap.get('nuevo')) {
      this.abrirFormulario('nuevo');
    }
  }

  protected cargar() {
    this.cargando.set(true);
    this.api.get<Pedido[]>('/pedidos', { estadoId: this.estadoFiltro() }).subscribe({
      next: (lista) => {
        this.pedidos.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected abrir(id: number) {
    this.api.get<PedidoDetalle>(`/pedidos/${id}`).subscribe({
      next: (d) => this.detalle.set(d),
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  protected abrirFormulario(modo: 'nuevo' | 'editar') {
    this.proveedor = modo === 'editar' ? (this.detalle()?.proveedor ?? '') : '';
    this.formulario.set(modo);
  }

  protected guardar() {
    const proveedor = this.proveedor.trim();

    if (!proveedor) {
      this.toast.error('El proveedor es obligatorio');
      return;
    }

    this.guardando.set(true);
    const editando = this.formulario() === 'editar' ? this.detalle() : null;
    const peticion = editando
      ? this.api.put<Confirmacion<Pedido>>(`/pedidos/${editando.id}`, { proveedor })
      : this.api.post<Confirmacion<Pedido>>('/pedidos', { proveedor });

    peticion.subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.formulario.set(null);
        this.guardando.set(false);
        this.cargar();
        if (editando) this.abrir(editando.id);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.guardando.set(false);
      },
    });
  }

  /** RF-21: el estado se cambia a mano y sin derivarlo de las entradas. */
  protected cambiarEstado(id: number, tipoEstadoId: number) {
    this.api.patch<Confirmacion<Pedido>>(`/pedidos/${id}/estado`, { tipoEstadoId }).subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.cargar();
        this.abrir(id);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.abrir(id);
      },
    });
  }
}
