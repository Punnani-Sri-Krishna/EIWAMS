import { Injectable, computed, inject, signal } from '@angular/core';

import { WorkCountKey } from '../navigation/nav';
import { ApiService } from './api.service';

interface QueueCount {
  count: number;
}

/** Subset of `GET v1/dashboard/home` used for the pending-work badges. */
export interface HomeCounts {
  pendingManager: QueueCount | null;
  pendingHr: QueueCount | null;
  pendingSecurity: QueueCount | null;
  pendingIdCard: QueueCount | null;
  pendingAccessReview: QueueCount | null;
  pendingProvisioning: QueueCount | null;
  teamRequests: QueueCount | null;
}

export type WorkCounts = Record<WorkCountKey, number>;

export function toWorkCounts(home: Partial<HomeCounts> | null | undefined): WorkCounts {
  const n = (q: QueueCount | null | undefined) => q?.count ?? 0;
  return {
    manager: n(home?.pendingManager),
    hr: n(home?.pendingHr),
    security: n(home?.pendingSecurity),
    access: n(home?.pendingAccessReview),
    idCard: n(home?.pendingIdCard),
    provisioning: n(home?.pendingProvisioning),
    team: n(home?.teamRequests),
  };
}

/** Pending-work counters for the nav and approval tab badges (polled; no push channel). */
@Injectable({ providedIn: 'root' })
export class WorkCountsService {
  private readonly api = inject(ApiService);
  private readonly home = signal<Partial<HomeCounts> | null>(null);
  readonly counts = computed(() => toWorkCounts(this.home()));

  total(keys: readonly WorkCountKey[] | null | undefined): number {
    const c = this.counts();
    return (keys ?? []).reduce((sum, k) => sum + (c[k] ?? 0), 0);
  }

  /** Called by the dashboard after it loaded `v1/dashboard/home`, avoiding a second request. */
  set(home: Partial<HomeCounts> | null): void {
    this.home.set(home);
  }

  refresh(): void {
    this.api.get<HomeCounts>('v1/dashboard/home').subscribe({
      next: (h) => this.home.set(h),
      error: () => undefined,
    });
  }

  clear(): void {
    this.home.set(null);
  }
}
