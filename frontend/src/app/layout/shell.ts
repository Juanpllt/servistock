import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { Catalogos } from '../core/catalogos.service';
import { NotificacionesStore } from '../core/notificaciones.service';
import { Realtime } from '../core/realtime.service';

interface Enlace {
  ruta: string;
  texto: string;
  soloAdmin?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  protected readonly realtime = inject(Realtime);
  protected readonly notificaciones = inject(NotificacionesStore);
  private readonly catalogos = inject(Catalogos);
  private readonly router = inject(Router);

  protected readonly menuAbierto = signal(false);

  protected readonly enlaces: Enlace[] = [
    { ruta: '/inicio', texto: 'Inicio' },
    { ruta: '/productos', texto: 'Productos' },
    { ruta: '/pedidos', texto: 'Pedidos' },
    { ruta: '/entradas', texto: 'Entradas' },
    { ruta: '/salidas', texto: 'Salidas' },
    { ruta: '/proyectos', texto: 'Proyectos' },
    { ruta: '/historial', texto: 'Historial' },
    { ruta: '/exportaciones', texto: 'Exportar a Excel' },
    { ruta: '/catalogos', texto: 'Catálogos' },
    { ruta: '/empleados', texto: 'Empleados', soloAdmin: true },
  ];

  private readonly suscripcion = this.router.events
    .pipe(filter((e) => e instanceof NavigationEnd))
    .subscribe(() => this.menuAbierto.set(false));

  ngOnInit() {
    const token = this.auth.token;

    if (token) {
      this.realtime.conectar(token);
    }

    this.catalogos.cargarTodo();
    this.notificaciones.iniciar();
  }

  ngOnDestroy() {
    this.suscripcion.unsubscribe();
    this.realtime.desconectar();
  }

  protected visible(enlace: Enlace) {
    return !enlace.soloAdmin || this.auth.esAdmin();
  }
}
