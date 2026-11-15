import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, PagedList, asApiError, endOfDayIso, humanize, startOfDayIso } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { Violation, violationReviewOptions } from './violations.models';
import { ViolationsService } from './violations.service';

@Component({
  selector: 'eiw-violation-review-dialog',
  imports: [ReactiveFormsModule, DatePipe, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Review violation #{{ v.violationId }}</h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <p class="mb-3">
          {{ humanize(v.violationType) }} · {{ v.employeeName ?? 'Unknown person' }} at {{ v.locationName ?? '—' }} ·
          {{ v.detectedAtUtc | date: 'medium' }} <eiw-status [value]="v.status" />
        </p>
        <eiw-error-state [error]="error()" [retryable]="false" />
        <mat-form-field class="w-100">
          <mat-label>New status</mat-label>
          <mat-select formControlName="status" required>
            @for (s of options; track s) {
              <mat-option [value]="s">{{ humanize(s) }}{{ s === v.status ? ' (no change)' : '' }}</mat-option>
            }
          </mat-select>
          @if (form.controls.status.hasError('required')) {
            <mat-error>Select a status.</mat-error>
          }
        </mat-form-field>
        <mat-form-field class="w-100">
          <mat-label>Review notes</mat-label>
          <textarea matInput formControlName="reviewNotes" rows="4" maxlength="2000" required></textarea>
          <mat-hint align="end">{{ form.controls.reviewNotes.value.length }}/2000</mat-hint>
          @if (form.controls.reviewNotes.hasError('required')) {
            <mat-error>Review notes are required.</mat-error>
          }
        </mat-form-field>
        @if (canCreateIncident) {
          <mat-checkbox formControlName="createIncident">Open a security incident for this violation</mat-checkbox>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Save review</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ViolationReviewDialogComponent {
  readonly v = inject<Violation>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ViolationReviewDialogComponent, Violation>>(MatDialogRef);
  private readonly service = inject(ViolationsService);
  readonly humanize = humanize;
  readonly options = violationReviewOptions(this.v.status);
  readonly canCreateIncident = !this.v.incidentId && inject(SessionService).hasPermission('Incidents.Manage');
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = new FormGroup({
    status: new FormControl<string>(this.options[0] ?? '', { nonNullable: true, validators: [Validators.required] }),
    reviewNotes: new FormControl<string>(this.v.reviewNotes ?? '', { nonNullable: true, validators: [Validators.required, Validators.maxLength(2000)] }),
    createIncident: new FormControl<boolean>(false, { nonNullable: true }),
  });

  save(): void {
    const notes = this.form.controls.reviewNotes.value.trim();
    if (!notes) this.form.controls.reviewNotes.setValue('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service.review(this.v.violationId, { status: value.status, reviewNotes: notes, createIncident: this.canCreateIncident && value.createIncident }).subscribe({
      next: (res) => this.ref.close(res ?? this.v),
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(asApiError(err));
      },
    });
  }
}

@Component({
  selector: 'eiw-violation-list',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatDatepickerModule, ...KIT_IMPORTS,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Access violations</h1>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-2" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.violationStatuses ?? []; track s) {
              <mat-option [value]="s">{{ humanize(s) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Type</mat-label>
          <mat-select formControlName="violationType">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.violationTypes ?? []; track s) {
              <mat-option [value]="s">{{ humanize(s) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-1" subscriptSizing="dynamic">
          <mat-label>Severity</mat-label>
          <mat-select formControlName="severity">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.severities ?? []; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Location</mat-label>
          <mat-select formControlName="locationId">
            <mat-option [value]="null">All</mat-option>
            @for (l of lk.lookups()?.locations ?? []; track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Detected</mat-label>
          <mat-date-range-input [rangePicker]="picker">
            <input matStartDate formControlName="from" placeholder="From" />
            <input matEndDate formControlName="to" placeholder="To" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
        </mat-form-field>
        <div class="col-12 col-md-1 d-flex gap-1">
          <button mat-flat-button type="submit">Apply</button>
          <button mat-button type="button" (click)="filters.reset(); list.search()">Reset</button>
        </div>
      </form>

      <div class="data-card">
        @if (list.loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="list.error()" (retry)="list.load()" />
        <div class="table-wrap">
          <table mat-table [dataSource]="list.items()" matSort matSortActive="detectedAtUtc" matSortDirection="desc" (matSortChange)="list.onSort($event)">
            <ng-container matColumnDef="detectedAtUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Detected</th>
              <td mat-cell *matCellDef="let v">{{ v.detectedAtUtc | date: 'medium' }}</td>
            </ng-container>
            <ng-container matColumnDef="violationType">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Type</th>
              <td mat-cell *matCellDef="let v">{{ humanize(v.violationType) }}</td>
            </ng-container>
            <ng-container matColumnDef="severity">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Severity</th>
              <td mat-cell *matCellDef="let v"><eiw-status [value]="v.severity" /></td>
            </ng-container>
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Person</th>
              <td mat-cell *matCellDef="let v">{{ v.employeeName ?? 'Unknown' }}</td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
              <td mat-cell *matCellDef="let v">{{ v.locationName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let v">
                <eiw-status [value]="v.status" />
                @if (v.reviewedByName) {
                  <div class="text-muted small" [title]="v.reviewNotes ?? ''">{{ v.reviewedByName }} · {{ v.reviewedAtUtc | date: 'short' }}</div>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="incident">
              <th mat-header-cell *matHeaderCellDef>Incident</th>
              <td mat-cell *matCellDef="let v">
                @if (v.incidentId) {
                  <a [routerLink]="['/incidents', v.incidentId]">#{{ v.incidentId }}</a>
                } @else {
                  —
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let v">
                @if (canReview(v)) {
                  <button mat-button type="button" (click)="review(v)"><mat-icon>rate_review</mat-icon>Review</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No violations match the current filters." icon="verified_user" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class ViolationListComponent {
  private readonly service = inject(ViolationsService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;
  readonly columns = ['detectedAtUtc', 'violationType', 'severity', 'employeeName', 'locationName', 'status', 'incident', 'actions'];

  readonly filters = new FormGroup({
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    violationType: new FormControl<string | null>(null),
    severity: new FormControl<string | null>(null),
    locationId: new FormControl<number | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  readonly list = new PagedList<Violation>(
    (q) => this.service.search(q),
    () => {
      const f = this.filters.getRawValue();
      return { ...f, from: startOfDayIso(f.from), to: endOfDayIso(f.to) };
    },
    { sortBy: 'detectedAtUtc', sortDir: 'desc' },
  );

  constructor() {
    this.lk.ensure();
    this.list.load();
  }

  canReview(v: Violation): boolean {
    return this.session.hasPermission('Violations.Review') && violationReviewOptions(v.status).length > 0;
  }

  review(v: Violation): void {
    this.dialog
      .open<ViolationReviewDialogComponent, Violation, Violation>(ViolationReviewDialogComponent, { data: v, width: '560px' })
      .afterClosed()
      .pipe(filter((r): r is Violation => !!r))
      .subscribe((r) => {
        this.notifier.success(r.incidentId && !v.incidentId ? `Violation reviewed and incident #${r.incidentId} opened.` : 'Violation review saved.');
        this.list.load();
      });
  }
}
