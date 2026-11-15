import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiError, ApiResponse, PagedResult, QueryParams } from '../models/api.models';

/**
 * Thin client over the EIWAMS API. Paths are relative to `environment.apiBaseUrl`
 * (for example `v1/employees`). Responses are unwrapped from the envelope; failures
 * are rethrown as `ApiError`.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.unwrap(this.http.get<ApiResponse<T>>(this.url(path), { params: toParams(params) }));
  }

  getPaged<T>(path: string, params?: QueryParams): Observable<PagedResult<T>> {
    return this.get<PagedResult<T>>(path, params);
  }

  post<T>(path: string, body: unknown = {}): Observable<T> {
    return this.unwrap(this.http.post<ApiResponse<T>>(this.url(path), body));
  }

  put<T>(path: string, body: unknown = {}): Observable<T> {
    return this.unwrap(this.http.put<ApiResponse<T>>(this.url(path), body));
  }

  patch<T>(path: string, body: unknown = {}): Observable<T> {
    return this.unwrap(this.http.patch<ApiResponse<T>>(this.url(path), body));
  }

  delete<T>(path: string): Observable<T> {
    return this.unwrap(this.http.delete<ApiResponse<T>>(this.url(path)));
  }

  /** Downloads a file (for example a CSV export) and saves it in the browser. */
  download(path: string, params: QueryParams | undefined, fallbackName: string): Observable<void> {
    return this.http
      .get(this.url(path), { params: toParams(params), observe: 'response', responseType: 'blob' })
      .pipe(
        map((res: HttpResponse<Blob>) => saveBlob(res, fallbackName)),
        catchError((err: HttpErrorResponse) => throwError(() => toApiError(err))),
      );
  }

  private url(path: string): string {
    const base = environment.apiBaseUrl.replace(/\/+$/, '');
    return `${base}/${path.replace(/^\/+/, '')}`;
  }

  private unwrap<T>(source: Observable<ApiResponse<T>>): Observable<T> {
    return source.pipe(
      map((res) => {
        if (res && res.success === false) {
          throw { status: 200, message: res.message, errors: flattenErrors(res.errors), correlationId: res.correlationId } satisfies ApiError;
        }
        return res?.data as T;
      }),
      catchError((err: unknown) =>
        throwError(() => (err instanceof HttpErrorResponse ? toApiError(err) : (err as ApiError))),
      ),
    );
  }
}

export function toParams(params?: QueryParams): HttpParams {
  let httpParams = new HttpParams();
  if (!params) {
    return httpParams;
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}

export function toApiError(err: HttpErrorResponse): ApiError {
  const body = err.error as Partial<ApiResponse<unknown>> | null;
  const correlationId = body?.correlationId ?? err.headers?.get('X-Correlation-Id') ?? null;
  const fallback =
    err.status === 0
      ? 'The service is unreachable. Check your connection and try again.'
      : err.status === 403
        ? 'You do not have permission to perform this action.'
        : err.status === 404
          ? 'The requested item was not found.'
          : 'Something went wrong. Please try again.';
  return {
    status: err.status,
    message: (body && typeof body === 'object' && body.message) || fallback,
    errors: flattenErrors(body?.errors),
    correlationId,
  };
}

function flattenErrors(errors: ApiResponse<unknown>['errors']): string[] {
  if (!errors) {
    return [];
  }
  return Array.isArray(errors) ? errors : Object.values(errors).flat();
}

function saveBlob(res: HttpResponse<Blob>, fallbackName: string): void {
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(res.body ?? new Blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
