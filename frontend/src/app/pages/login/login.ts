import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { Auth0Login } from '../../core/auth0.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly auth0 = inject(Auth0Login);

  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async ngOnInit() {
    await this.auth0.cargarConfiguracion();

    // Regreso desde Auth0: se completa el ingreso automáticamente
    if (this.auth0.config() && this.auth0.esRegreso()) {
      await this.completarAuth0();
    }
  }

  protected enviar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.cargando.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => this.router.navigateByUrl('/inicio'),
      error: (e: HttpErrorResponse) => this.mostrarError(e),
    });
  }

  protected async ingresarConAuth0() {
    this.cargando.set(true);
    this.error.set(null);

    try {
      await this.auth0.iniciarSesion();
    } catch {
      this.cargando.set(false);
      this.error.set('No se pudo abrir Auth0. Intenta de nuevo.');
    }
  }

  private async completarAuth0() {
    const config = this.auth0.config();
    this.cargando.set(true);

    try {
      const idToken = await this.auth0.completarRegreso();

      if (config) {
        await firstValueFrom(this.auth.loginAuth0(idToken, config));
        await this.router.navigateByUrl('/inicio');
      }
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        this.mostrarError(e);
      } else {
        this.cargando.set(false);
        this.error.set(`No se pudo ingresar con Auth0: ${(e as Error).message}`);
      }
    }
  }

  private mostrarError(e: HttpErrorResponse) {
    this.cargando.set(false);
    this.error.set(
      e.status === 0 ? 'No se pudo conectar con el servidor' : (e.error?.mensaje ?? 'Error al iniciar sesión'),
    );
  }
}
