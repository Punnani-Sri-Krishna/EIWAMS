import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { filter } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, PagedList, asApiError, fromDateOnly, toDateOnly } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS, askReason } from '../approvals/kit/ui.components';
import { Visitor } from '../visitors/visitors.models';
import { VisitorsService } from '../visitors/visitors.service';
import { BLACKLIST_SUBJECT_TYPES, BlacklistEntry } from './blacklist.models';
import { BlacklistService } from './blacklist.service';

@Component({
  selector: 'eiw-blacklist-add-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatProgressBarModule, ...KIT_IMPORTS],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Add blacklist entry</h2>
    @if (saving() || visitorsLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <eiw-error-state [error]="error()" [retryable]="false" />
        <div class="row g-2">
          <mat-form-field class="col-md-4">
            <mat-label>Subject type</mat-label>
            <mat-select formControlName="subjectType" required>
              @for (t of subjectTypes; track t) {
                <mat-option [value]="t">{{ t }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          @switch (form.controls.subjectType.value) {
            @case ('Employee') {
              <mat-form-field class="col-md-8">
                <mat-label>Employee</mat-label>
                <mat-select formControlName="subjectId" required>
                  @for (e of lk.lookups()?.employees ?? []; track e.id) {
                    <mat-option [value]="e.id">{{ e.name }} ({{ e.employeeNumber }})</mat-option>
                  }
                </mat-select>
                @if (form.controls.subjectId.hasError('required')) {
                  <mat-error>Select an employee.</mat-error>
                }
              </mat-form-field>
            }
            @case ('Visitor') {
              <mat-form-field class="col-md-8">
                <mat-label>Visitor</mat-label>
                <mat-select formControlName="subjectId" required>
                  @for (v of visitors(); track v.visitorId) {
                    <mat-option [value]="v.visitorId">{{ v.displayName }}{{ v.organization ? ' — ' + v.organization : '' }}</mat-option>
                  }
                </mat-select>
                @if (form.controls.subjectId.hasError('required')) {
                  <mat-error>Select a visitor.</mat-error>
                }
              </mat-form-field>
            }
            @default {
              <mat-form-field class="col-md-8">
                <mat-label>Card ID</mat-label>
                <input matInput type="number" min="1" formControlName="subjectId" required />
                <mat-hint>Internal card id (see Cards screen).</mat-hint>
                @if (form.controls.subjectId.invalid) {
                  <mat-error>Enter a valid card id.</mat-error>
                }
              </mat-form-field>
            }
          }
          <mat-form-field class="col-12">
            <mat-label>Reason</mat-label>
            <textarea matInput formControlName="reason" rows="3" maxlength="1000" required></textarea>
            @if (form.controls.reason.hasError('required')) {
              <mat-error>A reason is required.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Review date</mat-label>
            <input matInput [matDatepicker]="picker" formControlName="reviewDate" [min]="today" />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" class="danger-action" [disabled]="saving()">Add to blacklist</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class BlacklistAddDialogComponent {
  private readonly ref = inject<MatDialogRef<BlacklistAddDialogComponent, BlacklistEntry>>(MatDialogRef);
  private readonly service = inject(BlacklistService);
  private readonly visitorsService = inject(VisitorsService);
  readonly lk = inject(FeatureLookups);
  readonly subjectTypes = BLACKLIST_SUBJECT_TYPES;
  readonly today = new Date();
  readonly saving = signal(false);
  readonly visitorsLoading = signal(false);
  readonly visitors = signal<Visitor[]>([]);
  readonly error = signal<ApiError | null>(null);

  readonly form = new FormGroup({
    subjectType: new FormControl<string>('Employee', { nonNullable: true, validators: [Validators.required] }),
    subjectId: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(1000)] }),
    reviewDate: new FormControl<Date | null>(null),
  });

  constructor() {
    this.lk.ensure();
    this.form.controls.subjectType.valueChanges.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((t) => {
      this.form.controls.subjectId.reset();
      if (t === 'Visitor' && !this.visitors().length) this.loadVisitors();
    });
  }

  save(): void {
    if (!this.form.controls.reason.value.trim()) this.form.controls.reason.setValue('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service
      .create({ subjectType: v.subjectType, subjectId: Number(v.subjectId), reason: v.reason.trim(), reviewDate: toDateOnly(v.reviewDate) ?? null })
      .subscribe({
        next: (res) => this.ref.close(res),
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }

  private loadVisitors(): void {
    this.visitorsLoading.set(true);
    this.visitorsService.visitors({ page: 1, pageSize: 100, sortBy: 'displayName', sortDir: 'asc' }).subscribe({
      next: (res) => {
        this.visitors.set(res.items ?? []);
        this.visitorsLoading.set(false);
      },
      error: (err: unknown) => {
        this.visitorsLoading.set(false);
        this.error.set(asApiError(err));
      },
    });
  }
}

@Component({
  selector: 'eiw-blacklist-list',
  imports: [
    ReactiveFormsModule, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Blacklist</h1>
        <div class="page-actions">
          @if (canManage) {
            <button mat-flat-button type="button" (click)="add()"><mat-icon>person_off</mat-icon>Add entry</button>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-4" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Name or reason" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Subject type</mat-label>
          <mat-select formControlName="subjectType">
            <mat-option [value]="null">All</mat-option>
            @for (t of subjectTypes; track t) {
              <mat-option [value]="t">{{ t }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>State</mat-label>
          <mat-select formControlName="isActive">
            <mat-option [value]="null">All</mat-option>
            <mat-option [value]="true">Active</mat-option>
            <mat-option [value]="false">Lifted</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="col-12 col-md-2 d-flex gap-1">
          <button mat-flat-button type="submit">Apply</button>
          <button mat-button type="button" (click)="filters.reset({ search: null, subjectType: null, isActive: true }); list.search()">Reset</button>
        </div>
      </form>

      <div class="data-card">
        @if (list.loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="list.error()" (retry)="list.load()" />
        <div class="table-wrap">
          <table mat-table [dataSource]="list.items()" matSort (matSortChange)="list.onSort($event)">
            <ng-container matColumnDef="subjectName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Subject</th>
              <td mat-cell *matCellDef="let b">{{ b.subjectName ?? '#' + b.subjectId }}<div class="text-muted small">{{ b.subjectType }}</div></td>
            </ng-container>
            <ng-container matColumnDef="reason">
              <th mat-header-cell *matHeaderCellDef>Reason</th>
              <td mat-cell *matCellDef="let b">{{ b.reason }}</td>
            </ng-container>
            <ng-container matColumnDef="reviewDate">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Review date</th>
              <td mat-cell *matCellDef="let b">{{ b.reviewDate ? (asDate(b.reviewDate) | date: 'mediumDate') : '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="createdAtUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Added</th>
              <td mat-cell *matCellDef="let b">{{ b.createdAtUtc | date: 'mediumDate' }}<div class="text-muted small">{{ b.createdByName }}</div></td>
            </ng-container>
            <ng-container matColumnDef="isActive">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>State</th>
              <td mat-cell *matCellDef="let b">
                <eiw-status [value]="b.isActive ? 'Active' : 'Lifted'" />
                @if (!b.isActive && b.liftedAtUtc) {
                  <div class="text-muted small" [title]="b.liftReason ?? ''">{{ b.liftedByName }} · {{ b.liftedAtUtc | date: 'mediumDate' }}</div>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let b">
                @if (b.isActive && canManage) {
                  <button mat-button type="button" (click)="lift(b)"><mat-icon>lock_open</mat-icon>Lift</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No blacklist entries match the current filters." icon="verified" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class BlacklistListComponent {
  private readonly service = inject(BlacklistService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  readonly canManage = inject(SessionService).hasPermission('Blacklist.Manage');
  readonly subjectTypes = BLACKLIST_SUBJECT_TYPES;
  readonly columns = ['subjectName', 'reason', 'reviewDate', 'createdAtUtc', 'isActive', 'actions'];
  readonly asDate = fromDateOnly;

  readonly filters = new FormGroup({
    search: new FormControl<string | null>(null),
    subjectType: new FormControl<string | null>(null),
    isActive: new FormControl<boolean | null>(true),
  });

  readonly list = new PagedList<BlacklistEntry>((q) => this.service.search(q), () => this.filters.getRawValue());

  constructor() {
    this.list.load();
  }

  add(): void {
    this.dialog
      .open<BlacklistAddDialogComponent, void, BlacklistEntry>(BlacklistAddDialogComponent, { width: '640px' })
      .afterClosed()
      .pipe(filter((b): b is BlacklistEntry => !!b))
      .subscribe((b) => {
        this.notifier.success(`${b.subjectName ?? b.subjectType} added to the blacklist.`);
        this.list.load();
      });
  }

  lift(b: BlacklistEntry): void {
    askReason(this.dialog, {
      title: 'Lift blacklist entry',
      message: `${b.subjectName ?? b.subjectType} will be allowed access again (subject to permissions).`,
      label: 'Reason',
      required: true,
      maxLength: 1000,
      confirmText: 'Lift',
    }).subscribe((r) => {
      this.list.loading.set(true);
      this.service.lift(b.blacklistId, r.text).subscribe({
        next: () => {
          this.notifier.success('Blacklist entry lifted.');
          this.list.load();
        },
        error: (err: unknown) => {
          this.list.loading.set(false);
          this.notifier.error(err);
        },
      });
    });
  }
}
