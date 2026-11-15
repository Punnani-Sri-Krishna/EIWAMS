import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { AdminConfirmDialogComponent, AdminErrorComponent, AdminLoadingComponent, ConfirmData, asApiError, errorText } from './admin-shared';
import { CODE_PATTERN, Location, READER_DIRECTIONS, Reader, SaveReaderRequest } from './admin.models';
import { AdminService } from './admin.service';
import { buildLocationTree } from './location-tree';

interface ReaderDialogData {
  reader: Reader | null;
  locations: Location[];
}

@Component({
  selector: 'app-reader-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    AdminErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.reader ? 'Edit reader' : 'New reader' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error(); as e) {
          <app-admin-error [error]="e" [retryable]="false" />
        }
        <div class="row g-2">
          <mat-form-field class="col-12 col-sm-5">
            <mat-label>Reader ID</mat-label>
            <input matInput formControlName="readerId" maxlength="80" required />
            @if (data.reader) { <mat-hint>The reader ID cannot be changed.</mat-hint> }
            @if (form.controls.readerId.hasError('required')) { <mat-error>Reader ID is required.</mat-error> }
            @if (form.controls.readerId.hasError('pattern')) { <mat-error>Letters, digits, '-' and '_' only.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-7">
            <mat-label>Name</mat-label>
            <input matInput formControlName="readerName" maxlength="150" required />
            @if (form.controls.readerName.hasError('required')) { <mat-error>Name is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-8">
            <mat-label>Location</mat-label>
            <mat-select formControlName="locationId" required>
              @for (l of locationOptions; track l.locationId) {
                <mat-option [value]="l.locationId">{{ l.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.locationId.hasError('required')) { <mat-error>Location is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-4">
            <mat-label>Direction</mat-label>
            <mat-select formControlName="direction" required>
              @for (d of directions; track d) {
                <mat-option [value]="d">{{ d }}</mat-option>
              }
            </mat-select>
            @if (form.controls.direction.hasError('required')) { <mat-error>Direction is required.</mat-error> }
          </mat-form-field>
          <div class="col-12">
            <mat-slide-toggle formControlName="isActive">Active</mat-slide-toggle>
          </div>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ReaderDialogComponent {
  readonly data = inject<ReaderDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ReaderDialogComponent, Reader>);
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly directions = READER_DIRECTIONS;
  readonly locationOptions = buildLocationTree(this.data.locations)
    .filter((l) => l.isActive || l.locationId === this.data.reader?.locationId)
    .map((l) => ({ locationId: l.locationId, label: `${'\u00A0\u00A0'.repeat(l.depth)}${l.locationName} (${l.locationType})` }));
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    readerId: [
      { value: this.data.reader?.readerId ?? '', disabled: !!this.data.reader },
      [Validators.required, Validators.maxLength(80), Validators.pattern(CODE_PATTERN)],
    ],
    readerName: [this.data.reader?.readerName ?? '', [Validators.required, Validators.maxLength(150)]],
    locationId: [this.data.reader?.locationId ?? (null as number | null), Validators.required],
    direction: [this.data.reader?.direction ?? 'Both', Validators.required],
    isActive: [this.data.reader?.isActive ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body: SaveReaderRequest = {
      readerId: v.readerId.trim(),
      readerName: v.readerName.trim(),
      locationId: v.locationId ?? 0,
      direction: v.direction,
      isActive: v.isActive,
    };
    const req = this.data.reader ? this.admin.updateReader(this.data.reader.readerId, body) : this.admin.createReader(body);
    req.subscribe({
      next: (r) => this.ref.close(r),
      error: (e) => {
        this.saving.set(false);
        this.error.set(asApiError(e));
      },
    });
  }
}

@Component({
  selector: 'app-readers',
  imports: [
    DatePipe,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    AdminErrorComponent,
    AdminLoadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>RFID readers</h1>
        <div class="page-actions">
          @if (canManage) {
            <button mat-flat-button color="primary" type="button" (click)="edit(null)">
              <mat-icon>add</mat-icon> New reader
            </button>
          }
        </div>
      </header>

      <div class="data-card">
        <div class="filter-bar">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Search</mat-label>
            <input matInput (input)="applyFilter($any($event.target).value)" placeholder="ID, name or location" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>

        @if (loading()) {
          <app-admin-loading />
        }
        @if (error(); as e) {
          <app-admin-error [error]="e" (retry)="load()" />
        } @else if (!loading() && dataSource.data.length === 0) {
          <div class="empty-state"><mat-icon>sensors</mat-icon><p>No readers registered yet.</p></div>
        }

        <div class="table-wrap" [hidden]="!dataSource.data.length">
          <table mat-table [dataSource]="dataSource" matSort matSortActive="readerId" matSortDirection="asc">
            <ng-container matColumnDef="readerId">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Reader ID</th>
              <td mat-cell *matCellDef="let r">{{ r.readerId }}</td>
            </ng-container>
            <ng-container matColumnDef="readerName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
              <td mat-cell *matCellDef="let r">{{ r.readerName }}</td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
              <td mat-cell *matCellDef="let r">{{ r.locationName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="direction">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Direction</th>
              <td mat-cell *matCellDef="let r">{{ r.direction }}</td>
            </ng-container>
            <ng-container matColumnDef="lastSeenAtUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Last seen</th>
              <td mat-cell *matCellDef="let r" class="num">{{ r.lastSeenAtUtc ? (r.lastSeenAtUtc | date: 'medium') : 'Never' }}</td>
            </ng-container>
            <ng-container matColumnDef="isActive">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let r">
                <span class="status-chip" [class.tone-success]="r.isActive" [class.tone-neutral]="!r.isActive">
                  <mat-icon aria-hidden="true">{{ r.isActive ? 'check_circle' : 'block' }}</mat-icon>
                  {{ r.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let r">
                @if (canManage) {
                  <button mat-icon-button type="button" (click)="edit(r)" [attr.aria-label]="'Edit ' + r.readerName">
                    <mat-icon>edit</mat-icon>
                  </button>
                  @if (r.isActive) {
                    <button mat-icon-button type="button" (click)="deactivate(r)" [attr.aria-label]="'Deactivate ' + r.readerName">
                      <mat-icon>block</mat-icon>
                    </button>
                  }
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell" [attr.colspan]="columns.length">No readers match the filter.</td>
            </tr>
          </table>
        </div>
      </div>
    </section>
  `,
})
export class ReadersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = inject(SessionService).hasPermission('Reference.Manage');
  readonly columns = ['readerId', 'readerName', 'locationName', 'direction', 'lastSeenAtUtc', 'isActive', 'actions'];
  readonly dataSource = new MatTableDataSource<Reader>([]);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  private locations: Location[] = [];

  @ViewChild(MatSort) set sort(sort: MatSort) {
    this.dataSource.sort = sort;
  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = (r, f) =>
      `${r.readerId} ${r.readerName} ${r.locationName ?? ''}`.toLowerCase().includes(f);
    this.admin
      .locations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (l) => (this.locations = l ?? []), error: () => (this.locations = []) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.admin
      .readers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.dataSource.data = rows ?? [];
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(asApiError(e));
          this.loading.set(false);
        },
      });
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
  }

  edit(reader: Reader | null): void {
    this.dialog
      .open<ReaderDialogComponent, ReaderDialogData, Reader>(ReaderDialogComponent, {
        data: { reader, locations: this.locations },
        width: '640px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open(`Reader ${reader ? 'updated' : 'created'}.`, 'Close', { duration: 3000 });
          this.load();
        }
      });
  }

  deactivate(reader: Reader): void {
    this.dialog
      .open<AdminConfirmDialogComponent, ConfirmData, boolean>(AdminConfirmDialogComponent, {
        data: {
          title: 'Deactivate reader',
          message: `Deactivate reader ${reader.readerId}? It will stop accepting RFID events.`,
          confirmText: 'Deactivate',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        const { readerId, readerName, locationId, direction } = reader;
        this.admin.updateReader(readerId, { readerId, readerName, locationId, direction, isActive: false }).subscribe({
          next: () => {
            this.snack.open('Reader deactivated.', 'Close', { duration: 3000 });
            this.load();
          },
          error: (e) => this.snack.open(errorText(asApiError(e)), 'Close', { duration: 6000 }),
        });
      });
  }
}
