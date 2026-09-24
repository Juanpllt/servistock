import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? true : inject(Router).createUrlTree(['/login']);
};

export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.autenticado() ? inject(Router).createUrlTree(['/inicio']) : true;
};

/** Pantallas exclusivas del Administrador (RN-11). El backend valida de nuevo cada operación. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.esAdmin() ? true : inject(Router).createUrlTree(['/inicio']);
};
