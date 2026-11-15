import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, shareReplay, tap } from 'rxjs';

import { ApiService } from '../services/api.service';

export type AuthMode = 'DevHeader' | 'EntraId';

export interface AuthConfig {
  mode: AuthMode;
  tenantId: string | null;
  spaClientId: string | null;
  apiScope: string | null;
  authority: string | null;
}

const DEV_CONFIG: AuthConfig = { mode: 'DevHeader', tenantId: null, spaClientId: null, apiScope: null, authority: null };

/** Loads the public authentication configuration (`auth/config`) once and caches it. */
@Injectable({ providedIn: 'root' })
export class AuthConfigService {
  private readonly api = inject(ApiService);
  private request$?: Observable<AuthConfig>;

  readonly config = signal<AuthConfig | null>(null);

  load(): Observable<AuthConfig> {
    this.request$ ??= this.api.get<AuthConfig>('auth/config').pipe(
      catchError(() => of(DEV_CONFIG)),
      tap((c) => this.config.set({ ...DEV_CONFIG, ...c })),
      shareReplay(1),
    );
    return this.request$;
  }

  get mode(): AuthMode {
    return this.config()?.mode ?? 'DevHeader';
  }
}
