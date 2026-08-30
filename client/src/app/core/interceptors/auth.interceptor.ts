import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();

  let authReq = req;
  // Inyectar token automáticamente si existe y la petición va a la API del backend
  const isApiRequest = req.url.includes('rc-manager-api.vercel.app') || req.url.includes('localhost:3001') || req.url.startsWith('/api');
  if (token && isApiRequest && !req.headers.has('Authorization')) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Si el servidor responde 401 Unauthorized (token expirado o manipulado)
      // se expulsa la sesión y se limpia el estado automáticamente, salvo en endpoints de login
      if (error.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/register')) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};
