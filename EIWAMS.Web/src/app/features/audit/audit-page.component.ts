import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subscription, catchError, of } from 'rxjs';

import { ApiError, Lookups, PagedResult } from '../../core/models/api.models';
import { ReportsService } from '../reports/reports.service';
import { asApiError, cleanParams, endOfDayIso, startOfDayIso } from '../reports/reports.models';
import { AuditDetailDialogComponent, openAuditTimeline } from './audit-dialogs.component';
import { AuditLog, actionTone, utcDate } from './audit.models';
import { AuditService } from './audit.service';

@Component({
  selector: 'eiw-audit-page',
  imports: [
    ReactiveFormsModule, DatePipe, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule,
    MatDatepickerModule, MatPaginatorModule, MatProgressBarModule, MatTooltipModule,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    table.audit { width: 100%; border-collapse: collapse; }
    table.audit th, table.audit td { padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(0, 0, 0, 0.08); text-align: left; vertical-align: top; }
    table.audit th { font-weight: 600; white-space: nowrap; }
    table.audit tbody tr { cursor: pointer; }
    table.audit tbody tr:hover, table.audit tbody tr:focus-visible { background: rgba(63, 106, 216, 0.06); outline: none; }
    .summary { max-width: 420px; }
    .nowrap { white-space: nowrap; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Audit trail</h1>
        <div class="page-actions">
          @if (canTimeline()) {
            <button mat-stroked-button type="button" (click)="openTimeline()" matTooltip="History of the entity in the filters">
              <mat-icon>timeline</mat-icon>Entity timeline
            </button>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="form" (ngSubmit)="search(1)">
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Summary, entity, actor..." />
          <mat-icon matIconSuffix>search</mat-icon>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Entity type</mat-label>
          <input matInput formControlName="entityType" placeholder="e.g. Employee" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-1" subscriptSizing="dynamic">
          <mat-label>Entity ID</mat-label>
          <input matInput formControlName="entityId" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Action</mat-label>
          <input matInput formControlName="action" placeholder="e.g. Update" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>User</mat-label>
          <mat-select formControlName="actorUserId">
            <mat-option [value]="null">Any</mat-option>
            @for (u of users(); track u.id) {
              <mat-option [value]="u.id">{{ u.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-12 col-md-2" subscriptSizing="dynamic">
          <mat-label>Occurred between</mat-label>
          <mat-date-range-input [rangePicker]="picker">
            <input matStartDate formControlName="from" placeholder="From" />
            <input matEndDate formControlName="to" placeholder="To" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
        </mat-form-field>
        <div class="col-12 d-flex gap-2">
          <button mat-flat-button type="submit" [disabled]="loading()"><mat-icon>filter_list</mat-icon>Apply</button>
          <button mat-button type="button" (click)="reset()">Reset</button>
        </div>
      </form>
      @if (rangeInvalid()) {
        <p class="text-danger" role="alert">The end date must be on or after the start date.</p>
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
            <button mat-stroked-button type="button" (click)="search()">Retry</button>
          </div>
        }
        @if (result(); as r) {
          @if (r.items.length) {
            <div class="table-wrap">
              <table class="audit" aria-label="Audit trail">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">User</th>
                    <th scope="col">Action</th>
                    <th scope="col">Entity</th>
                    <th scope="col">Summary</th>
                    <th scope="col">Correlation ID</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of r.items; track l.auditLogId) {
                    <tr tabindex="0" (click)="open(l)" (keydown.enter)="open(l)" [attr.aria-label]="'Open audit entry ' + l.auditLogId">
                      <td class="nowrap">{{ when(l) | date: 'medium' }}</td>
                      <td>{{ l.actorName || 'System' }}</td>
                      <td><span class="status-chip" [class]="'status-chip tone-' + tone(l.action)">{{ l.action }}</span></td>
                      <td class="nowrap">{{ l.entityType || '\u2014' }}{{ l.entityId ? ' #' + l.entityId : '' }}</td>
                      <td class="summary">{{ l.summary || l.reason || '\u2014' }}</td>
                      <td><code class="correlation">{{ l.correlationId || '\u2014' }}</code></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <mat-icon>manage_search</mat-icon>
              <p>No audit entries match the selected filters.</p>
            </div>
          }
          <mat-paginator [length]="r.totalCount" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[20, 50, 100]"
            (page)="onPage($event)" showFirstLastButtons aria-label="Audit pages" />
        }
      </div>
    </section>
  `,
})
export class AuditPageComponent {
  private readonly service = inject(AuditService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lookups = toSignal(inject(ReportsService).lookups().pipe(catchError(() => of(null as Lookups | null))), { initialValue: null });
  readonly users = computed(() => this.lookups()?.users ?? []);

  readonly form = new FormGroup({
    search: new FormControl<string | null>(null),
    entityType: new FormControl<string | null>(null),
    entityId: new FormControl<string | null>(null),
    action: new FormControl<string | null>(null),
    actorUserId: new FormControl<number | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  readonly result = signal<PagedResult<AuditLog> | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly rangeInvalid = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  private readonly applied = signal<{ entityType: string | null; entityId: string | null }>({ entityType: null, entityId: null });
  readonly canTimeline = computed(() => !!this.applied().entityType && !!this.applied().entityId);
  private sub?: Subscription;

  constructor() {
    const q = inject(ActivatedRoute).snapshot.queryParamMap;
    this.form.patchValue({ entityType: q.get('entityType'), entityId: q.get('entityId') });
    this.destroyRef.onDestroy(() => this.sub?.unsubscribe());
    this.search(1);
  }

  when(l: AuditLog): Date | null {
    return utcDate(l.occurredAtUtc);
  }

  tone(action: string): string {
    return actionTone(action);
  }

  reset(): void {
    this.form.reset();
    this.search(1);
  }

  onPage(e: PageEvent): void {
    this.pageSize.set(e.pageSize);
    this.search(e.pageIndex + 1);
  }

  search(page = this.page()): void {
    const f = this.form.getRawValue();
    const ok = !f.from || !f.to || f.from.getTime() <= f.to.getTime();
    this.rangeInvalid.set(!ok);
    if (!ok) return;
    this.page.set(page);
    this.applied.set({ entityType: f.entityType?.trim() || null, entityId: f.entityId?.trim() || null });
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const params = cleanParams({
      page,
      pageSize: this.pageSize(),
      search: f.search,
      entityType: f.entityType,
      entityId: f.entityId,
      action: f.action,
      actorUserId: f.actorUserId,
      from: startOfDayIso(f.from),
      to: endOfDayIso(f.to),
    });
    this.sub = this.service.search(params).subscribe({
      next: (r) => {
        this.result.set(r ?? { items: [], totalCount: 0, page, pageSize: this.pageSize() });
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.result.set(null);
        this.loading.set(false);
      },
    });
  }

  open(log: AuditLog): void {
    this.dialog.open(AuditDetailDialogComponent, { data: { log }, width: '960px', maxWidth: '95vw' });
  }

  openTimeline(): void {
    const { entityType, entityId } = this.applied();
    if (entityType && entityId) openAuditTimeline(this.dialog, entityType, entityId);
  }
}
