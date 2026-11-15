import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { CurrentUser, MenuItem } from '../models/api.models';
import { ApiService } from './api.service';

/** Holds the signed-in user's profile, permissions and menu (database driven). */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  readonly user = signal<CurrentUser | null>(null);
  readonly menu = signal<MenuItem[]>([]);
  readonly isSignedIn = computed(() => this.user() !== null);
  private readonly permissionSet = computed(() => new Set(this.user()?.permissions ?? []));

  hasPermission(code: string): boolean {
    return this.permissionSet().has(code);
  }

  hasAny(codes: readonly string[]): boolean {
    return codes.length === 0 || codes.some((c) => this.permissionSet().has(c));
  }

  hasRole(role: string): boolean {
    return this.user()?.roles.includes(role) ?? false;
  }

  loadProfile(): Observable<CurrentUser> {
    return this.api.get<CurrentUser>('v1/me').pipe(tap((u) => this.user.set(u)));
  }

  loadMenu(): Observable<MenuItem[]> {
    return this.api.get<MenuItem[]>('v1/me/menu').pipe(tap((m) => this.menu.set(m ?? [])));
  }

  clear(): void {
    this.user.set(null);
    this.menu.set([]);
  }
}
