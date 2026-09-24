import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, debounceTime, filter } from 'rxjs';
import { Api, mensajeError } from '../../core/api.service';
import { Catalogos } from '../../core/catalogos.service';
import { Confirmacion, Consumo, Empleado, Proyecto, ProyectoDetalle } from '../../core/modelos';
import { Realtime } from '../../core/realtime.service';
import { Toast } from '../../core/toast.service';
import { EstadoInsignia } from '../../shared/estado-insignia';
import { Modal } from '../../shared/modal';

@Component({
  selector: 'app-proyectos',
  imports: [FormsModule, DatePipe, Modal, EstadoInsignia],
  templateUrl: './proyectos.html',
})
export class Proyectos implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  protected readonly catalogos = inject(Catalogos);

  protected readonly proyectos = signal<Proyecto[]>([]);
  protected readonly cargando = signal(true);
  protected readonly estadoFiltro = signal<number | ''>('');
  protected readonly buscar = signal('');

  protected readonly detalle = signal<ProyectoDetalle | null>(null);
  protected readonly consumo = signal<Consumo[]>([]);
  protected readonly empleados = signal<Empleado[]>([]);
  protected readonly formulario = signal<'nuevo' | 'editar' | null>(null);
  protected readonly guardando = signal(false);

  protected nombre = '';
  protected descripcion = '';
  protected nuevoEmpleadoId: number | null = null;
  protected nuevoTipoId: number | null = null;

  constructor() {
    inject(Realtime)
      .movimiento$.pipe(
        filter((m) => m.tipo === 'proyecto' || m.tipo === 'salida'),
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
    this.api.get<Empleado[]>('/empleados').subscribe((lista) => this.empleados.set(lista));
  }

  protected cargar() {
    this.cargando.set(true);
    this.api.get<Proyecto[]>('/proyectos', { estadoId: this.estadoFiltro(), nombre: this.buscar().trim() }).subscribe({
      next: (lista) => {
        this.proyectos.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected abrir(id: number) {
    this.api.get<ProyectoDetalle>(`/proyectos/${id}`).subscribe({
      next: (d) => {
        this.detalle.set(d);
        this.nuevoTipoId ??= this.catalogos.tiposParticipacion()[0]?.id ?? null;
      },
      error: (e) => this.toast.error(mensajeError(e)),
    });
    this.api.get<Consumo[]>(`/proyectos/${id}/consumo`).subscribe((c) => this.consumo.set(c));
  }

  protected abrirFormulario(modo: 'nuevo' | 'editar') {
    const actual = this.detalle();
    this.nombre = modo === 'editar' ? (actual?.nombre ?? '') : '';
    this.descripcion = modo === 'editar' ? (actual?.descripcion ?? '') : '';
    this.formulario.set(modo);
  }

  protected guardar() {
    const nombre = this.nombre.trim();

    if (!nombre) {
      this.toast.error('El nombre del proyecto es obligatorio');
      return;
    }

    const editando = this.formulario() === 'editar' ? this.detalle() : null;
    const datos = { nombre, descripcion: this.descripcion.trim() };
    this.guardando.set(true);

    const peticion = editando
      ? this.api.put<Confirmacion<ProyectoDetalle>>(`/proyectos/${editando.id}`, datos)
      : this.api.post<Confirmacion<Proyecto>>('/proyectos', datos);

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

  private aplicar(peticion: Observable<Confirmacion<ProyectoDetalle>>) {
    peticion.subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.detalle.set(r.data);
        this.cargar();
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        const abierto = this.detalle();
        if (abierto) this.abrir(abierto.id);
      },
    });
  }

  /** RF-37 */
  protected cambiarEstado(tipoEstadoId: number) {
    const d = this.detalle();
    if (d) this.aplicar(this.api.patch<Confirmacion<ProyectoDetalle>>(`/proyectos/${d.id}/estado`, { tipoEstadoId }));
  }

  /** RF-31 */
  protected asignar() {
    const d = this.detalle();

    if (!d || !this.nuevoEmpleadoId || !this.nuevoTipoId) {
      this.toast.error('Selecciona el empleado y su tipo de participación');
      return;
    }

    this.aplicar(
      this.api.post<Confirmacion<ProyectoDetalle>>(`/proyectos/${d.id}/empleados`, {
        empleadoId: this.nuevoEmpleadoId,
        tipoParticipacionId: this.nuevoTipoId,
      }),
    );
    this.nuevoEmpleadoId = null;
  }

  /** RF-38 */
  protected reasignar(empleadoId: number, tipoParticipacionId: number) {
    const d = this.detalle();
    if (d) {
      this.aplicar(this.api.put<Confirmacion<ProyectoDetalle>>(`/proyectos/${d.id}/empleados/${empleadoId}`, { tipoParticipacionId }));
    }
  }

  protected retirar(empleadoId: number, nombre: string) {
    const d = this.detalle();

    if (d && confirm(`¿Retirar a ${nombre} del proyecto?`)) {
      this.aplicar(this.api.delete<Confirmacion<ProyectoDetalle>>(`/proyectos/${d.id}/empleados/${empleadoId}`));
    }
  }
}
