import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { approvalTabs } from '../../core/navigation/nav';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { WorkCountsService } from '../../core/services/work-counts.service';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { HomeDashboardDto, HomeWorkItem, waitingCards, waitingTotal } from './dashboard.models';

/** Home (SIMPLIFY-SPEC §D): who I am, what I can request, my recent requests and what is waiting for me. */
@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly api = inject(ApiService);
  private readonly work = inject(WorkCountsService);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly home = signal<HomeDashboardDto | null>(null);

  protected readonly user = this.session.user;
  protected readonly hasEmployee = computed(() => typeof this.user()?.employeeId === 'number');
  protected readonly canRequestCard = computed(() => this.hasEmployee() && this.session.hasPermission('Cards.Request'));
  protected readonly canRequestAccess = computed(() => this.hasEmployee() && this.session.hasPermission('AccessRequests.Create'));
  protected readonly canSeeMyRequests = computed(() => this.session.hasAny(['Cards.View', 'AccessRequests.View']));
  protected readonly initials = computed(() =>
    (this.user()?.displayName ?? '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
  );
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });

  protected readonly recent = computed(() => this.home()?.myRequests?.recent ?? []);
  protected readonly waiting = computed(() => {
    const u = this.user();
    const hasAccessTab = approvalTabs({ has: (p) => this.session.hasPermission(p), roles: u?.roles ?? [] }).some((t) => t.key === 'access');
    return waitingCards(this.home(), hasAccessTab);
  });
  protected readonly waitingTotal = computed(() => waitingTotal(this.waiting()));

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<HomeDashboardDto>('v1/dashboard/home').subscribe({
      next: (home) => {
        this.home.set(home);
        this.work.set(home);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  protected statusKind(item: HomeWorkItem): 'card-request' | 'access-request' {
    return item.requestKind === 'Card' ? 'card-request' : 'access-request';
  }
}
