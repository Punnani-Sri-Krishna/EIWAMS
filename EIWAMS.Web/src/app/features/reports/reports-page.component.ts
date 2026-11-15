import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, catchError, of } from 'rxjs';

import { ApiError, Lookups } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { statusIcon, statusTone } from '../../shared/utils/status-tone';
import { ReportChartComponent } from './report-chart.component';
import {
  REPORTS, REPORT_EXPORT_ROW_CAP, asApiError, buildReportParams, countBy, findReport, formatReportCell, humanize, summaryColumnIndex,
} from './reports.models';
import { ReportsService } from './reports.service';

@Component({
  selector: 'eiw-reports-page',
  imports: [
    ReactiveFormsModule, DecimalPipe, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatDatepickerModule, MatPaginatorModule, MatProgressBarModule, ReportChartComponent,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    table.report { width: 100%; border-collapse: collapse; }
    table.report th, table.report td { padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(0, 0, 0, 0.08); text-align: left; white-space: nowrap; }
    table.report th { position: sticky; top: 0; background: var(--mat-sys-surface, #fff); font-weight: 600; }
    table.report td.num { text-align: right; }
    .hint { color: rgba(0, 0, 0, 0.6); margin: 0.5rem 0 1rem; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Reports</h1>
        <div class="page-actions">
          @if (canExport()) {
            <button mat-flat-button type="button" [disabled]="exporting() || loading() || !result()?.totalCount" (click)="exportCsv()">
              <mat-icon>download</mat-icon>{{ exporting() ? 'Exporting...' : 'Export CSV' }}
            </button>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="form" (ngSubmit)="run(1)">
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Report</mat-label>
          <mat-select formControlName="report" (selectionChange)="onReportChange()">
            @for (r of reports; track r.name) {
              <mat-option [value]="r.name">{{ r.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>{{ definition().dateLabel }} between</mat-label>
          <mat-date-range-input [rangePicker]="picker">
            <input matStartDate formControlName="from" placeholder="From" />
            <input matEndDate formControlName="to" placeholder="To" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
        </mat-form-field>
        @if (definition().orgFilters) {
          <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
            <mat-label>Department</mat-label>
            <mat-select formControlName="departmentId">
              <mat-option [value]="null">All</mat-option>
              @for (d of lookups()?.departments ?? []; track d.id) {
                <mat-option [value]="d.id">{{ d.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
            <mat-label>Location</mat-label>
            <mat-select formControlName="locationId">
              <mat-option [value]="null">All</mat-option>
              @for (l of lookups()?.locations ?? []; track l.id) {
                <mat-option [value]="l.id">{{ l.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>{{ definition().statusLabel }}</mat-label>
          @if (statusOptions(); as opts) {
            <mat-select formControlName="status">
              <mat-option [value]="null">All</mat-option>
              @for (s of opts; track s) {
                <mat-option [value]="s">{{ humanize(s) }}</mat-option>
              }
            </mat-select>
          } @else {
            <input matInput formControlName="status" />
          }
        </mat-form-field>
        <div class="col-12 col-md-auto d-flex gap-2">
          <button mat-flat-button type="submit" [disabled]="loading()"><mat-icon>play_arrow</mat-icon>Run</button>
          <button mat-button type="button" (click)="reset()">Reset</button>
        </div>
      </form>
      @if (rangeInvalid()) {
        <p class="text-danger" role="alert">The end date must be on or after the start date.</p>
      }

      <p class="hint">
        {{ definition().description }}
        @if (canExport()) {
          CSV export includes all matching rows (capped at {{ exportCap | number }} rows).
        }
      </p>

      @if (chartData().length > 1) {
        <div class="data-card mb-3">
          <h2 class="h6 mb-2">{{ chartTitle() }} (current page)</h2>
          <eiw-report-chart [data]="chartData()" [title]="chartTitle()" />
        </div>
      }

      <div class="data-card">
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        @if (error(); as e) {
          <div class="error-state" role="alert">
            <mat-icon>error</mat-icon>
            <p>{{ e.message }}</p>
            @for (m of e.errors; track $index) {
              <p>{{ m }}</p>
            }
            @if (e.correlationId) {
              <p class="correlation">Reference: {{ e.correlationId }}</p>
            }
            <button mat-stroked-button type="button" (click)="run()">Retry</button>
          </div>
        }
        @if (result(); as r) {
          @if (r.rows.length) {
            <div class="table-wrap">
              <table class="report" [attr.aria-label]="definition().label">
                <thead>
                  <tr>
                    @for (c of r.columns; track $index) {
                      <th scope="col">{{ humanize(c) }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of r.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index; let ci = $index) {
                        @if (statusColumns().has(ci) && cell) {
                          <td>
                            <span class="status-chip" [class]="'status-chip tone-' + tone(cell)"><mat-icon>{{ icon(cell) }}</mat-icon>{{ humanize('' + cell) }}</span>
                          </td>
                        } @else {
                          <td [class.num]="isNumber(cell)">{{ format(cell) }}</td>
                        }
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <mat-icon>summarize</mat-icon>
              <p>No rows match the selected filters.</p>
            </div>
          }
          <mat-paginator [length]="r.totalCount" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[20, 50, 100]"
            (page)="onPage($event)" showFirstLastButtons aria-label="Report pages" />
        }
      </div>
    </section>
  `,
})
export class ReportsPageComponent {
  private readonly service = inject(ReportsService);
  private readonly snack = inject(MatSnackBar);
  private readonly session = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly reports = REPORTS;
  readonly exportCap = REPORT_EXPORT_ROW_CAP;
  readonly humanize = humanize;
  readonly format = formatReportCell;
  readonly canExport = computed(() => this.session.hasPermission('Reports.Export'));
  readonly lookups = toSignal(this.service.lookups().pipe(catchError(() => of(null as Lookups | null))), { initialValue: null });

  readonly form = new FormGroup({
    report: new FormControl(REPORTS[0].name, { nonNullable: true }),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    departmentId: new FormControl<number | null>(null),
    locationId: new FormControl<number | null>(null),
    status: new FormControl<string | null>(null),
  });

  readonly selected = signal(REPORTS[0].name);
  readonly definition = computed(() => findReport(this.selected()));
  readonly statusOptions = computed(() => this.definition().statusOptions?.(this.lookups()) ?? null);
  readonly result = signal<{ columns: string[]; rows: unknown[][]; totalCount: number } | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly rangeInvalid = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(20);

  readonly statusColumns = computed(() => {
    const cols = this.result()?.columns ?? [];
    return new Set(cols.map((c, i) => (/status$|decision$|severity$/i.test(c) ? i : -1)).filter((i) => i >= 0));
  });
  private readonly chartIndex = computed(() => summaryColumnIndex(this.result()?.columns ?? []));
  readonly chartTitle = computed(() => `Rows by ${humanize(this.result()?.columns[this.chartIndex()] ?? '').toLowerCase()}`);
  readonly chartData = computed(() => countBy(this.result()?.rows ?? [], this.chartIndex()));

  private sub?: Subscription;

  constructor() {
    this.destroyRef.onDestroy(() => this.sub?.unsubscribe());
    this.run(1);
  }

  isNumber(v: unknown): boolean {
    return typeof v === 'number';
  }

  tone(v: unknown): string {
    return statusTone(String(v));
  }

  icon(v: unknown): string {
    return statusIcon(String(v));
  }

  onReportChange(): void {
    this.selected.set(this.form.controls.report.value);
    this.form.patchValue({ status: null, departmentId: null, locationId: null });
    this.result.set(null);
    this.run(1);
  }

  reset(): void {
    this.form.patchValue({ from: null, to: null, departmentId: null, locationId: null, status: null });
    this.run(1);
  }

  onPage(e: PageEvent): void {
    this.pageSize.set(e.pageSize);
    this.run(e.pageIndex + 1);
  }

  run(page = this.page()): void {
    if (!this.validRange()) return;
    this.page.set(page);
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const params = buildReportParams(this.definition(), this.form.getRawValue(), { page, pageSize: this.pageSize() });
    this.sub = this.service.run(this.selected(), params).subscribe({
      next: (r) => {
        this.result.set({ columns: r?.columns ?? [], rows: r?.rows ?? [], totalCount: r?.totalCount ?? 0 });
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.result.set(null);
        this.loading.set(false);
      },
    });
  }

  exportCsv(): void {
    if (!this.canExport() || !this.validRange()) return;
    this.exporting.set(true);
    const total = this.result()?.totalCount ?? 0;
    this.service
      .exportCsv(this.selected(), buildReportParams(this.definition(), this.form.getRawValue()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.exporting.set(false);
          const msg = total > this.exportCap
            ? `Export downloaded (first ${this.exportCap.toLocaleString()} of ${total.toLocaleString()} rows).`
            : 'Export downloaded.';
          this.snack.open(msg, 'Dismiss', { duration: 4000 });
        },
        error: (err: unknown) => {
          this.exporting.set(false);
          const e = asApiError(err);
          this.snack.open(e.correlationId ? `${e.message} (Ref: ${e.correlationId})` : e.message, 'Dismiss', { duration: 8000 });
        },
      });
  }

  private validRange(): boolean {
    const { from, to } = this.form.getRawValue();
    const ok = !from || !to || from.getTime() <= to.getTime();
    this.rangeInvalid.set(!ok);
    return ok;
  }
}
