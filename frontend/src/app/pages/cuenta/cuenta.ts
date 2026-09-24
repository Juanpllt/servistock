import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Confirmacion, Empleado } from '../../core/modelos';
import { Toast } from '../../core/toast.service';

/** RF-05: cada empleado puede editar su propia cuenta (el tipo de empleado no se cambia aquí). */
@Component({
  selector: 'app-cuenta',
  imports: [FormsModule],
  templateUrl: './cuenta.html',
})
export class Cuenta {
  private readonly api = inject(Api);
  private readonly toast = inject(Toast);
  protected readonly auth = inject(AuthService);

  protected readonly guardando = signal(false);
  protected nombre = this.auth.usuario()?.nombre ?? '';
  protected email = this.auth.usuario()?.email ?? '';
  protected password = '';

  protected guardar() {
    const usuario = this.auth.usuario();

    if (!usuario) return;
    if (!this.nombre.trim()) return this.toast.error('El nombre es obligatorio');
    if (!this.email.trim()) return this.toast.error('El usuario (correo) es obligatorio');
    if (this.password && this.password.length < 6) {
      return this.toast.error('La contraseña debe tener al menos 6 caracteres');
    }

    this.guardando.set(true);
    this.api
      .put<Confirmacion<Empleado>>(`/empleados/${usuario.id}`, {
        nombre: this.nombre.trim(),
        email: this.email.trim(),
        password: this.password,
      })
      .subscribe({
        next: (r) => {
          this.toast.exito(r.mensaje);
          this.auth.actualizarUsuario({ ...usuario, nombre: r.data.nombre, email: r.data.email });
          this.password = '';
          this.guardando.set(false);
        },
        error: (e) => {
          this.toast.error(mensajeError(e));
          this.guardando.set(false);
        },
      });
  }
}
