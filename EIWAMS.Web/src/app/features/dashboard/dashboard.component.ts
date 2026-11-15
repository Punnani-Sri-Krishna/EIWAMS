import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { catchError, forkJoin, of } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { statusIcon, statusTone } from '../../shared/utils/status-tone';
import { eventsTrendChart, hasData, kpiTiles, labelCountBar, labelCountDoughnut } from './dashboard-charts';
import { ActivityItem, DashboardSummary, EventsTrendPoint, LabelCount, MyWorkItem, OccupancyItem } from './dashboard.models';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly summary = signal<DashboardSummary | null>(null);
  protected readonly trend = signal<EventsTrendPoint[]>([]);
  protected readonly requests = signal<LabelCount[]>([]);
  protected readonly violations = signal<LabelCount[]>([]);
  protected readonly occupancy = signal<OccupancyItem[]>([]);
  protected readonly myWork = signal<MyWorkItem[]>([]);
  protected readonly activity = signal<ActivityItem[]>([]);

  protected readonly tiles = computed(() => {
    const s = this.summary();
    return s ? kpiTiles(s) : [];
  });
  protected readonly hasTrend = computed(() => hasData(this.trend()));
  protected readonly hasRequests = computed(() => hasData(this.requests()));
  protected readonly hasViolations = computed(() => hasData(this.violations()));
  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  });

  protected readonly statusTone = statusTone;
  protected readonly statusIcon = statusIcon;

  private readonly trendCanvas = viewChild<ElementRef<HTMLCanvasElement>>('trendCanvas');
  private readonly requestsCanvas = viewChild<ElementRef<HTMLCanvasElement>>('requestsCanvas');
  private readonly violationsCanvas = viewChild<ElementRef<HTMLCanvasElement>>('violationsCanvas');
  private readonly charts = new Map<string, Chart>();

  constructor() {
    this.bindChart('trend', this.trendCanvas, () => eventsTrendChart(this.trend()));
    this.bindChart('requests', this.requestsCanvas, () => labelCountDoughnut(this.requests()));
    this.bindChart('violations', this.violationsCanvas, () => labelCountBar(this.violations(), 'Violations'));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const optional = <T>(path: string, params?: Record<string, number>) =>
      this.api.get<T[]>(path, params).pipe(catchError(() => of([] as T[])));
    forkJoin({
      summary: this.api.get<DashboardSummary>('v1/dashboard/summary'),
      trend: optional<EventsTrendPoint>('v1/dashboard/events-trend', { days: 14 }),
      requests: optional<LabelCount>('v1/dashboard/requests-by-status'),
      violations: optional<LabelCount>('v1/dashboard/violations-by-type'),
      occupancy: optional<OccupancyItem>('v1/dashboard/occupancy'),
      myWork: optional<MyWorkItem>('v1/dashboard/my-work'),
      activity: optional<ActivityItem>('v1/dashboard/activity', { top: 10 }),
    }).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.trend.set(r.trend ?? []);
        this.requests.set(r.requests ?? []);
        this.violations.set(r.violations ?? []);
        this.occupancy.set(r.occupancy ?? []);
        this.myWork.set(r.myWork ?? []);
        this.activity.set(r.activity ?? []);
        this.loading.set(false);
      },
      error: (err: ApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.charts.forEach((c) => c.destroy());
    this.charts.clear();
  }

  private bindChart(
    key: string,
    canvas: () => ElementRef<HTMLCanvasElement> | undefined,
    config: () => ChartConfiguration,
  ): void {
    effect(() => {
      const el = canvas()?.nativeElement;
      const cfg = config();
      this.charts.get(key)?.destroy();
      this.charts.delete(key);
      if (el) {
        this.charts.set(key, new Chart(el, cfg));
      }
    });
  }
}
