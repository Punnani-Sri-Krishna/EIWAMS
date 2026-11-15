import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { NotifyService } from '../../shared/services/notify.service';

export interface NotificationItem {
  notificationId: number;
  type: string;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  route: string | null;
  createdAtUtc: string;
  readAtUtc: string | null;
}

@Component({
  selector: 'app-notifications',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatPaginatorModule, MatProgressBarModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss',
})
export class NotificationsComponent {
  private readonly api = inject(ApiService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly items = signal<NotificationItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly unreadOnly = signal(false);
  protected readonly busy = signal(false);
  protected readonly hasUnread = computed(() => this.items().some((n) => !n.readAtUtc));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .getPaged<NotificationItem>('v1/notifications', {
        page: this.page(),
        pageSize: this.pageSize(),
        unreadOnly: this.unreadOnly() || null,
      })
      .subscribe({
        next: (res) => {
          this.items.set(res?.items ?? []);
          this.total.set(res?.totalCount ?? 0);
          this.loading.set(false);
        },
        error: (err: ApiError) => {
          this.error.set(err);
          this.loading.set(false);
        },
      });
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  toggleUnread(value: boolean): void {
    this.unreadOnly.set(value);
    this.page.set(1);
    this.load();
  }

  markRead(n: NotificationItem): void {
    if (n.readAtUtc) {
      return;
    }
    this.api.post<boolean>(`v1/notifications/${n.notificationId}/read`).subscribe({
      next: () => this.applyRead(n.notificationId),
      error: (err: ApiError) => this.notify.error(err),
    });
  }

  markAllRead(): void {
    this.busy.set(true);
    this.api.post<{ count: number }>('v1/notifications/read-all').subscribe({
      next: (res) => {
        this.busy.set(false);
        this.notify.success(`${res?.count ?? 0} notification(s) marked as read.`);
        if (this.unreadOnly()) {
          this.load();
        } else {
          const now = new Date().toISOString();
          this.items.update((list) => list.map((x) => (x.readAtUtc ? x : { ...x, readAtUtc: now })));
        }
      },
      error: (err: ApiError) => {
        this.busy.set(false);
        this.notify.error(err);
      },
    });
  }

  open(n: NotificationItem): void {
    this.markRead(n);
    if (n.route) {
      void this.router.navigateByUrl(n.route);
    }
  }

  private applyRead(id: number): void {
    const now = new Date().toISOString();
    this.items.update((list) => list.map((x) => (x.notificationId === id ? { ...x, readAtUtc: now } : x)));
  }
}
