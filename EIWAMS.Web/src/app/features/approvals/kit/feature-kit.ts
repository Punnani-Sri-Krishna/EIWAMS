import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Sort } from '@angular/material/sort';
import { Observable, Subscription, catchError, shareReplay, tap, throwError } from 'rxjs';

import { ApiError, Lookups, PagedResult, QueryParams } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { SessionService } from '../../../core/services/session.service';
import { CanActivateFn, Router } from '@angular/router';

/** Normalises anything thrown by ApiService (or elsewhere) into an ApiError. */
export function asApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as Partial<ApiError>;
    return {
      status: e.status ?? 0,
      message: e.message || 'Something went wrong. Please try again.',
      errors: Array.isArray(e.errors) ? e.errors : [],
      correlationId: e.correlationId ?? null,
    };
  }
  return { status: 0, message: 'Something went wrong. Please try again.', errors: [], correlationId: null };
}

export interface PagedListOptions {
  pageSize?: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * Server-paged list state (page/pageSize/sortBy/sortDir + feature filters) with loading,
 * empty and error signals. Must be created in an injection context (field initialiser).
 */
export class PagedList<T> {
  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly sortBy = signal<string | undefined>(undefined);
  readonly sortDir = signal<'asc' | 'desc' | undefined>(undefined);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly loaded = signal(false);
  readonly empty = computed(() => this.loaded() && !this.loading() && !this.error() && this.items().length === 0);
  readonly pageSizeOptions = [10, 20, 50, 100];
  private sub?: Subscription;

  constructor(
    private readonly fetch: (query: QueryParams) => Observable<PagedResult<T>>,
    private readonly filters: () => QueryParams = () => ({}),
    options: PagedListOptions = {},
    destroyRef: DestroyRef | null = inject(DestroyRef, { optional: true }),
  ) {
    if (options.pageSize) this.pageSize.set(options.pageSize);
    this.sortBy.set(options.sortBy);
    this.sortDir.set(options.sortDir);
    destroyRef?.onDestroy(() => this.sub?.unsubscribe());
  }

  query(): QueryParams {
    return cleanParams({
      ...this.filters(),
      page: this.page(),
      pageSize: this.pageSize(),
      sortBy: this.sortBy(),
      sortDir: this.sortBy() ? this.sortDir() : undefined,
    });
  }

  /** Loads the current page; `silent` keeps the progress bar hidden (used by polling). */
  load(silent = false): void {
    this.sub?.unsubscribe();
    if (!silent) this.loading.set(true);
    this.sub = this.fetch(this.query()).subscribe({
      next: (res) => {
        this.items.set(res?.items ?? []);
        this.total.set(res?.totalCount ?? 0);
        this.error.set(null);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.loading.set(false);
        this.loaded.set(true);
      },
    });
  }

  search(): void {
    this.page.set(1);
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  onSort(s: Sort): void {
    this.sortBy.set(s.direction ? s.active : undefined);
    this.sortDir.set(s.direction ? (s.direction as 'asc' | 'desc') : undefined);
    this.page.set(1);
    this.load();
  }
}

/** Cached reference data from GET v1/lookups. */
@Injectable({ providedIn: 'root' })
export class FeatureLookups {
  private readonly api = inject(ApiService);
  private cache$?: Observable<Lookups>;
  readonly lookups = signal<Lookups | null>(null);
  readonly error = signal<ApiError | null>(null);

  load(): Observable<Lookups> {
    if (!this.cache$) {
      this.cache$ = this.api.get<Lookups>('v1/lookups').pipe(
        tap((l) => {
          this.lookups.set(l);
          this.error.set(null);
        }),
        catchError((err: unknown) => {
          this.cache$ = undefined;
          this.error.set(asApiError(err));
          return throwError(() => err);
        }),
        shareReplay(1),
      );
    }
    return this.cache$;
  }

  /** Fire-and-forget load; failures are exposed through `error`. */
  ensure(): void {
    this.load().subscribe({ error: () => undefined });
  }
}

/** Success / failure snackbars. Failures include the correlation id for support. */
@Injectable({ providedIn: 'root' })
export class Notifier {
  private readonly snack = inject(MatSnackBar);

  success(message: string): void {
    this.snack.open(message, 'Close', { duration: 4000, panelClass: 'snack-success' });
  }

  error(err: unknown): void {
    this.snack.open(describeError(err), 'Close', { duration: 10000, panelClass: 'snack-error' });
  }
}

export function describeError(err: unknown): string {
  const e = asApiError(err);
  const details = e.errors.length ? ` ${e.errors.join(' ')}` : '';
  const ref = e.correlationId ? ` (Correlation ID: ${e.correlationId})` : '';
  return `${e.message}${details}${ref}`;
}

/** "PendingApproval" -> "Pending Approval". */
export function humanize(value: string | null | undefined): string {
  return (value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date -> 'yyyy-MM-dd' (for DateOnly API fields). */
export function toDateOnly(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'yyyy-MM-dd' (DateOnly from API) -> local Date. */
export function fromDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.substring(0, 10).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export function startOfDayIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function endOfDayIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/** Date -> value for <input type="datetime-local">. */
export function toLocalInput(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO UTC string. */
export function localInputToIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Strips empty values so they are not sent as query params. */
export function cleanParams(params: QueryParams): QueryParams {
  const out: QueryParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

/** Route guard for sub-pages that need a specific action permission (e.g. create forms). */
export function requirePermission(code: string, fallback: string): CanActivateFn {
  return () => inject(SessionService).hasPermission(code) || inject(Router).parseUrl(fallback);
}
