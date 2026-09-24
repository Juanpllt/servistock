import { Routes } from '@angular/router';
import { adminGuard, authGuard, invitadoGuard } from './core/auth.guard';
import { Shell } from './layout/shell';
import { Login } from './pages/login/login';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [invitadoGuard] },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: 'inicio', loadComponent: () => import('./pages/inicio/inicio').then((m) => m.Inicio) },
      { path: 'productos', loadComponent: () => import('./pages/productos/productos').then((m) => m.Productos) },
      { path: 'pedidos', loadComponent: () => import('./pages/pedidos/pedidos').then((m) => m.Pedidos) },
      { path: 'entradas', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.Entradas) },
      { path: 'salidas', loadComponent: () => import('./pages/salidas/salidas').then((m) => m.Salidas) },
      { path: 'proyectos', loadComponent: () => import('./pages/proyectos/proyectos').then((m) => m.Proyectos) },
      { path: 'historial', loadComponent: () => import('./pages/historial/historial').then((m) => m.Historial) },
      { path: 'exportaciones', loadComponent: () => import('./pages/exportaciones/exportaciones').then((m) => m.Exportaciones) },
      { path: 'notificaciones', loadComponent: () => import('./pages/notificaciones/notificaciones').then((m) => m.Notificaciones) },
      { path: 'catalogos', loadComponent: () => import('./pages/catalogos/catalogos').then((m) => m.Catalogos) },
      { path: 'cuenta', loadComponent: () => import('./pages/cuenta/cuenta').then((m) => m.Cuenta) },
      {
        path: 'empleados',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/empleados/empleados').then((m) => m.Empleados),
      },
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
    ],
  },
  { path: '**', redirectTo: '' },
];
