import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../../core/api.service';
import { Entrada, EntradaDetalle, PedidoHistorial, Salida, SalidaDetalle } from '../../core/modelos';
import { Toast } from '../../core/toast.service';
import { EstadoInsignia } from '../../shared/estado-insignia';
import { Modal } from '../../shared/modal';

type Pestana = 'pedidos' | 'entradas' | 'salidas';

/** RF-49 a RF-55: historial de pedidos, entradas y salidas, con consulta por rango de fechas. */
@Component({
  selector: 'app-historial',
  imports: [FormsModule, DatePipe, Modal, EstadoInsignia],
  templateUrl: './historial.html',
})
export class Historial {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);

  protected readonly pestana = signal<Pestana>('pedidos');
  protected readonly cargando = signal(false);
  protected readonly pedidos = signal<PedidoHistorial[]>([]);
  protected readonly entradas = signal<Entrada[]>([]);
  protected readonly salidas = signal<Salida[]>([]);
  protected readonly detalleEntrada = signal<EntradaDetalle | null>(null);
  protected readonly detalleSalida = signal<SalidaDetalle | null>(null);

  protected desde = '';
  protected hasta = '';

  constructor() {
    this.consultar();
  }

  protected cambiarPestana(pestana: Pestana) {
    this.pestana.set(pestana);
    this.consultar();
  }

  protected consultar() {
    // Validación previa del rango (RF-50/52/54): el backend la repite
    if (this.desde && this.hasta && this.desde > this.hasta) {
      this.toast.error('La fecha inicial no puede ser posterior a la final');
      return;
    }

    const rango = { desde: this.desde, hasta: this.hasta };
    this.cargando.set(true);
    const alTerminar = { error: (e: unknown) => { this.toast.error(mensajeError(e)); this.cargando.set(false); } };

    switch (this.pestana()) {
      case 'pedidos':
        this.api.get<PedidoHistorial[]>('/historial/pedidos', rango).subscribe({
          next: (r) => { this.pedidos.set(r); this.cargando.set(false); }, ...alTerminar });
        break;
      case 'entradas':
        this.api.get<Entrada[]>('/historial/entradas', rango).subscribe({
          next: (r) => { this.entradas.set(r); this.cargando.set(false); }, ...alTerminar });
        break;
      case 'salidas':
        this.api.get<Salida[]>('/historial/salidas', rango).subscribe({
          next: (r) => { this.salidas.set(r); this.cargando.set(false); }, ...alTerminar });
        break;
    }
  }

  protected limpiar() {
    this.desde = '';
    this.hasta = '';
    this.consultar();
  }

  protected verEntrada(id: number) {
    this.api.get<EntradaDetalle>(`/historial/entradas/${id}`).subscribe({
      next: (d) => this.detalleEntrada.set(d),
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }

  protected verSalida(id: number) {
    this.api.get<SalidaDetalle>(`/historial/salidas/${id}`).subscribe({
      next: (d) => this.detalleSalida.set(d),
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }
}
