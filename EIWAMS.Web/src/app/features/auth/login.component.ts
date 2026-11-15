import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';

import { AuthConfigService } from '../../core/auth/auth-config.service';
import { AuthService } from '../../core/auth/auth.service';
import { ApiService } from '../../core/services/api.service';

interface DevUser {
  userId: number;
  displayName: string;
  email: string;
  roles: string[];
}

@Component({
  selector: 'app-login',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login-bg">
      <section class="login-card">
        <header class="login-brand">
          <span class="brand-mark"><mat-icon>verified_user</mat-icon></span>
          <div>
            <h1>EIWAMS</h1>
            <p>Workplace Access Management</p>
          </div>
        </header>

        @if (loading()) {
          <div class="center"><mat-spinner diameter="36" /></div>
        } @else if (mode() === 'EntraId') {
          <p class="hint">Sign in with your organization account to continue.</p>
          <button mat-flat-button class="full" (click)="signInMicrosoft()">
            <mat-icon>login</mat-icon> Sign in with Microsoft
          </button>
        } @else {
          <p class="hint">Development mode — choose a user to sign in as.</p>
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <ul class="user-list">
            @for (u of users(); track u.userId) {
              <li>
                <button type="button" class="user" (click)="pick(u)">
                  <span class="avatar">{{ initials(u.displayName) }}</span>
                  <span class="info">
                    <strong>{{ u.displayName }}</strong>
                    <small>{{ u.email }}</small>
                    <span class="chips">
                      @for (r of u.roles; track r) {
                        <span class="chip">{{ r }}</span>
                      }
                    </span>
                  </span>
                  <mat-icon>chevron_right</mat-icon>
                </button>
              </li>
            } @empty {
              <li class="hint">No users available.</li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: `
    .login-bg { min-height: 100vh; display: grid; place-items: center; padding: 24px;
      background: linear-gradient(135deg, #0B3C5D 0%, #0E6E83 55%, #0FA3B1 100%); }
    .login-card { width: min(480px, 100%); background: #fff; border-radius: 16px; padding: 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, .25); }
    .login-brand { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
    .login-brand h1 { margin: 0; font-size: 1.6rem; color: #0B3C5D; letter-spacing: .04em; }
    .login-brand p { margin: 0; color: #5b6b7a; font-size: .85rem; }
    .brand-mark { width: 48px; height: 48px; border-radius: 12px; display: grid; place-items: center; color: #fff;
      background: linear-gradient(135deg, #0E6E83, #0FA3B1); }
    .hint { color: #5b6b7a; font-size: .9rem; }
    .error { color: #b3261e; }
    .center { display: grid; place-items: center; padding: 24px; }
    .full { width: 100%; }
    .user-list { list-style: none; margin: 0; padding: 0; max-height: 55vh; overflow: auto; display: grid; gap: 8px; }
    .user { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; text-align: left;
      border: 1px solid #e1e7ec; border-radius: 10px; background: #fff; cursor: pointer; font: inherit; }
    .user:hover, .user:focus-visible { border-color: #0FA3B1; background: #f2fbfc; outline: none; }
    .avatar { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; flex: none;
      background: #0B3C5D; color: #fff; font-weight: 600; font-size: .85rem; }
    .info { flex: 1; display: grid; gap: 2px; min-width: 0; }
    .info small { color: #5b6b7a; overflow: hidden; text-overflow: ellipsis; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .chip { font-size: .7rem; padding: 1px 8px; border-radius: 999px; background: #e0f4f6; color: #0E6E83; }
  `,
})
export class LoginComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly config = inject(AuthConfigService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly mode = signal<'DevHeader' | 'EntraId'>('DevHeader');
  readonly users = signal<DevUser[]>([]);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const cfg = await firstValueFrom(this.config.load());
    this.mode.set(cfg.mode);
    if (cfg.mode === 'EntraId') {
      await this.auth.init();
      if (this.auth.isSignedIn()) {
        await this.router.navigateByUrl('/dashboard');
        return;
      }
      this.loading.set(false);
      return;
    }
    this.api.get<DevUser[]>('v1/dev/users').subscribe({
      next: (u) => {
        this.users.set(u ?? []);
        this.loading.set(false);
      },
      error: (e: { message?: string }) => {
        this.error.set(e?.message ?? 'Unable to load users.');
        this.loading.set(false);
      },
    });
  }

  pick(user: DevUser): void {
    this.auth.signInAsDevUser(user.userId);
    void this.router.navigateByUrl('/dashboard');
  }

  signInMicrosoft(): void {
    void this.auth.signInWithMicrosoft();
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  }
}
