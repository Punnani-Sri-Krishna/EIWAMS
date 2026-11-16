import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { CurrentUser } from '../models/api.models';
import { toDataUrl } from '../../shared/utils/image-resize';
import { ApiService } from './api.service';

/** Holds the signed-in user's profile and permissions (the top navigation is derived from them). */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  readonly user = signal<CurrentUser | null>(null);
  /** `data:` URL of the user's photo for the app bar avatar (null = show initials). */
  readonly photoUrl = signal<string | null>(null);
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
    return this.api.get<CurrentUser>('v1/me').pipe(
      tap((u) => {
        this.user.set(u);
        this.refreshPhoto();
      }),
    );
  }

  /** Loads the avatar photo (v1/me/photo) when the user has one; failures fall back to initials. */
  refreshPhoto(): void {
    if (!this.user()?.hasPhoto) {
      this.photoUrl.set(null);
      return;
    }
    this.api.get<{ contentType: string; photoBase64: string }>('v1/me/photo').subscribe({
      next: (p) => this.photoUrl.set(toDataUrl(p?.contentType, p?.photoBase64)),
      error: () => this.photoUrl.set(null),
    });
  }

  /** Updates the cached avatar after a successful upload. */
  setPhoto(dataUrl: string | null): void {
    this.photoUrl.set(dataUrl);
    const u = this.user();
    if (u && dataUrl) this.user.set({ ...u, hasPhoto: true });
  }

  clear(): void {
    this.user.set(null);
    this.photoUrl.set(null);
  }
}
