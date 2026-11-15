import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

function isApiUrl(url: string): boolean {
  const base = environment.apiBaseUrl.replace(/\/+$/, '');
  return url === base || url.startsWith(base + '/') || url.includes('/api/');
}

function newCorrelationId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Adds correlation and identity headers to API calls and redirects to login on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) {
    return next(req);
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  const headers: Record<string, string> = { 'X-Correlation-Id': newCorrelationId() };
  const isConfigCall = /\/auth\/config(\?|$)/.test(req.url);

  const send = (request: HttpRequest<unknown>) =>
    next(request).pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401 && !isConfigCall) {
          auth.clearLocal();
          void router.navigate(['/login']);
        }
        return throwError(() => err);
      }),
    );

  if (auth.mode === 'DevHeader') {
    const userId = auth.devUserId;
    if (userId) {
      headers['X-User-Id'] = userId;
    }
    return send(req.clone({ setHeaders: headers }));
  }
  if (isConfigCall) {
    return send(req.clone({ setHeaders: headers }));
  }
  return from(auth.getAccessToken()).pipe(
    switchMap((token) => {
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return send(req.clone({ setHeaders: headers }));
    }),
  );
};
