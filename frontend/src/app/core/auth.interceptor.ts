import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { API_URL, AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;
  const esLogin = req.url === `${API_URL}/auth/login` || req.url === `${API_URL}/auth/auth0`;

  const peticion =
    token && req.url.startsWith(API_URL)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(peticion).pipe(
    catchError((error: HttpErrorResponse) => {
      // Token vencido o inválido: se cierra la sesión local
      if (error.status === 401 && !esLogin) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
