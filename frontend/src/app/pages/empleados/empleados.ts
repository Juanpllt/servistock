import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Catalogos } from '../../core/catalogos.service';
import { Confirmacion, Empleado } from '../../core/modelos';
import { Toast } from '../../core/toast.service';
import { Modal } from '../../shared/modal';

/** Gestión de empleados: crear y eliminar son exclusivos del Administrador (RN-11). */
@Component({
  selector: 'app-empleados',
  imports: [FormsModule, Modal],
  templateUrl: './empleados.html',
})
export class Empleados implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  protected readonly auth = inject(AuthService);
  protected readonly catalogos = inject(Catalogos);

  protected readonly empleados = signal<Empleado[]>([]);
  protected readonly cargando = signal(true);
  protected readonly formulario = signal<'nuevo' | Empleado | null>(null);
  protected readonly guardando = signal(false);

  protected nombre = '';
  protected email = '';
  protected password = '';
  protected rolId: number | null = null;

  ngOnInit() {
    this.cargar();
  }

  protected cargar() {
    this.api.get<Empleado[]>('/empleados').subscribe({
      next: (lista) => {
        this.empleados.set(lista);
        this.cargando.set(false);
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.cargando.set(false);
      },
    });
  }

  protected abrirFormulario(empleado?: Empleado) {
    this.formulario.set(empleado ?? 'nuevo');
    this.nombre = empleado?.nombre ?? '';
    this.email = empleado?.email ?? '';
    this.password = '';
    this.rolId = empleado?.rolId ?? this.catalogos.tiposEmpleado().find((t) => t.nombre === 'Empleado')?.id ?? null;
  }

  protected guardar() {
    const editando = this.formulario();
    const nombre = this.nombre.trim();
    const email = this.email.trim();

    if (!nombre) return this.toast.error('El nombre es obligatorio');
    if (!email) return this.toast.error('El usuario (correo) es obligatorio');

    const nuevo = editando === 'nuevo';

    if (nuevo && this.password.length < 6) {
      return this.toast.error('La contraseña debe tener al menos 6 caracteres');
    }

    this.guardando.set(true);
    const peticion =
      editando && editando !== 'nuevo'
        ? this.api.put<Confirmacion<Empleado>>(`/empleados/${editando.id}`, { nombre, email, password: this.password })
        : this.api.post<Confirmacion<Empleado>>('/empleados', { nombre, email, password: this.password, rolId: this.rolId });

    peticion.subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.formulario.set(null);
        this.guardando.set(false);
        this.cargar();
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.guardando.set(false);
      },
    });
  }

  /** ADR-012: el tipo de empleado se cambia por un caso de uso aparte, solo para el Administrador. */
  protected cambiarTipo(empleado: Empleado, rolId: number) {
    this.api.patch<Confirmacion<Empleado>>(`/empleados/${empleado.id}/tipo`, { rolId }).subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.cargar();
      },
      error: (e) => {
        this.toast.error(mensajeError(e));
        this.cargar();
      },
    });
  }

  protected eliminar(empleado: Empleado) {
    if (!confirm(`¿Eliminar definitivamente a ${empleado.nombre}?`)) {
      return;
    }

    this.api.delete<{ mensaje: string }>(`/empleados/${empleado.id}`).subscribe({
      next: (r) => {
        this.toast.exito(r.mensaje);
        this.cargar();
      },
      error: (e) => this.toast.error(mensajeError(e)),
    });
  }
}
