import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { filter } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { PagedResult } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { MenuSection, groupMenu } from './menu-grouping';

export interface ShellNotification {
  notificationId: number;
  type: string;
  title: string;
  message: string;
  route: string | null;
  createdAtUtc: string;
  readAtUtc: string | null;
}

const POLL_MS = 60_000;

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, DatePipe,
    MatBadgeModule, MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatTooltipModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly session = inject(SessionService);

  readonly sections = computed(() => groupMenu(this.session.menu()));
  readonly user = this.session.user;
  readonly initials = computed(() =>
    (this.user()?.displayName ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join(''),
  );
  readonly mobileOpen = signal(false);
  readonly currentUrl = signal(this.router.url);
  readonly unread = signal(0);
  readonly notifications = signal<ShellNotification[]>([]);

  ngOnInit(): void {
    this.refreshUnread();
    const timer = setInterval(() => this.refreshUnread(), POLL_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe((e) => {
        this.currentUrl.set((e as NavigationEnd).urlAfterRedirects);
        this.mobileOpen.set(false);
      });
  }

  sectionActive(s: MenuSection): boolean {
    const url = this.currentUrl().split(/[?#]/)[0];
    return s.items.some((i) => {
      const target = this.link(i.route);
      return url === target || url.startsWith(target + '/');
    });
  }

  link(route: string): string {
    return '/' + (route ?? '').replace(/^\/+/, '');
  }

  toggleMobile(): void {
    this.mobileOpen.update((v) => !v);
  }

  refreshUnread(): void {
    this.api.get<{ count: number }>('v1/notifications/unread-count').subscribe({
      next: (r) => this.unread.set(r?.count ?? 0),
      error: () => undefined,
    });
  }

  loadLatest(): void {
    this.api.getPaged<ShellNotification>('v1/notifications', { page: 1, pageSize: 5 }).subscribe({
      next: (r: PagedResult<ShellNotification>) => this.notifications.set(r?.items ?? []),
      error: () => this.notifications.set([]),
    });
  }

  open(n: ShellNotification): void {
    if (!n.readAtUtc) {
      this.api.post(`v1/notifications/${n.notificationId}/read`).subscribe({ next: () => this.refreshUnread(), error: () => undefined });
    }
    if (n.route) {
      void this.router.navigateByUrl(n.route);
    }
  }

  markAllRead(): void {
    this.api.post('v1/notifications/read-all').subscribe({
      next: () => {
        this.unread.set(0);
        const now = new Date().toISOString();
        this.notifications.update((list) => list.map((n) => ({ ...n, readAtUtc: n.readAtUtc ?? now })));
      },
      error: () => undefined,
    });
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
