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

import { ApiError, IdName } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { AdminErrorComponent, AdminLoadingComponent, asApiError } from './admin-shared';
import { CODE_PATTERN, Department } from './admin.models';
import { AdminService } from './admin.service';

interface DepartmentDialogData {
  department: Department | null;
  users: IdName[];
}

@Component({
  selector: 'app-department-dialog',
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
    <h2 mat-dialog-title>{{ data.department ? 'Edit department' : 'New department' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error(); as e) {
          <app-admin-error [error]="e" [retryable]="false" />
        }
        <div class="row g-2">
          <mat-form-field class="col-12 col-sm-5">
            <mat-label>Code</mat-label>
            <input matInput formControlName="departmentCode" maxlength="20" required />
            @if (form.controls.departmentCode.hasError('required')) { <mat-error>Code is required.</mat-error> }
            @if (form.controls.departmentCode.hasError('pattern')) { <mat-error>Letters, digits, '-' and '_' only.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-7">
            <mat-label>Name</mat-label>
            <input matInput formControlName="departmentName" maxlength="150" required />
            @if (form.controls.departmentName.hasError('required')) { <mat-error>Name is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12">
            <mat-label>Department head</mat-label>
            <mat-select formControlName="headUserId">
              <mat-option [value]="null">— None —</mat-option>
              @for (u of data.users; track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
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
export class DepartmentDialogComponent {
  readonly data = inject<DepartmentDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DepartmentDialogComponent, Department>);
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = this.fb.group({
    departmentCode: [this.data.department?.departmentCode ?? '', [Validators.required, Validators.maxLength(20), Validators.pattern(CODE_PATTERN)]],
    departmentName: [this.data.department?.departmentName ?? '', [Validators.required, Validators.maxLength(150)]],
    headUserId: [this.data.department?.headUserId ?? (null as number | null)],
    isActive: [this.data.department?.isActive ?? true],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.admin
      .saveDepartment(this.data.department?.departmentId ?? null, {
        ...v,
        departmentCode: v.departmentCode.trim(),
        departmentName: v.departmentName.trim(),
      })
      .subscribe({
        next: (d) => this.ref.close(d),
        error: (e) => {
          this.saving.set(false);
          this.error.set(asApiError(e));
        },
      });
  }
}

@Component({
  selector: 'app-departments',
  imports: [
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
        <h1>Departments</h1>
        <div class="page-actions">
          @if (canManage) {
            <button mat-flat-button color="primary" type="button" (click)="edit(null)">
              <mat-icon>add</mat-icon> New department
            </button>
          }
        </div>
      </header>

      <div class="data-card">
        <div class="filter-bar">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Search</mat-label>
            <input matInput (input)="applyFilter($any($event.target).value)" placeholder="Code or name" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>

        @if (loading()) {
          <app-admin-loading />
        }
        @if (error(); as e) {
          <app-admin-error [error]="e" (retry)="load()" />
        } @else if (!loading() && dataSource.data.length === 0) {
          <div class="empty-state"><mat-icon>apartment</mat-icon><p>No departments yet.</p></div>
        }

        <div class="table-wrap" [hidden]="!dataSource.data.length">
          <table mat-table [dataSource]="dataSource" matSort matSortActive="departmentName" matSortDirection="asc">
            <ng-container matColumnDef="departmentCode">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Code</th>
              <td mat-cell *matCellDef="let d">{{ d.departmentCode }}</td>
            </ng-container>
            <ng-container matColumnDef="departmentName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
              <td mat-cell *matCellDef="let d">{{ d.departmentName }}</td>
            </ng-container>
            <ng-container matColumnDef="headUserName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Head</th>
              <td mat-cell *matCellDef="let d">{{ d.headUserName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="employeeCount">
              <th mat-header-cell *matHeaderCellDef mat-sort-header class="num">Employees</th>
              <td mat-cell *matCellDef="let d" class="num">{{ d.employeeCount }}</td>
            </ng-container>
            <ng-container matColumnDef="isActive">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let d">
                <span class="status-chip" [class]="d.isActive ? 'status-chip tone-success' : 'status-chip tone-neutral'">
                  <mat-icon aria-hidden="true">{{ d.isActive ? 'check_circle' : 'block' }}</mat-icon>
                  {{ d.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let d">
                @if (canManage) {
                  <button mat-icon-button type="button" (click)="edit(d)" [attr.aria-label]="'Edit ' + d.departmentName">
                    <mat-icon>edit</mat-icon>
                  </button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
            <tr class="mat-row" *matNoDataRow>
              <td class="mat-cell" [attr.colspan]="columns.length">No departments match the filter.</td>
            </tr>
          </table>
        </div>
      </div>
    </section>
  `,
})
export class DepartmentsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = inject(SessionService).hasPermission('Reference.Manage');
  readonly columns = ['departmentCode', 'departmentName', 'headUserName', 'employeeCount', 'isActive', 'actions'];
  readonly dataSource = new MatTableDataSource<Department>([]);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  private users: IdName[] = [];

  @ViewChild(MatSort) set sort(sort: MatSort) {
    this.dataSource.sort = sort;
  }

  ngOnInit(): void {
    this.dataSource.filterPredicate = (d, f) => `${d.departmentCode} ${d.departmentName}`.toLowerCase().includes(f);
    this.admin
      .lookups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (l) => (this.users = l.users ?? []), error: () => (this.users = []) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.admin
      .departments()
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

  edit(department: Department | null): void {
    this.dialog
      .open<DepartmentDialogComponent, DepartmentDialogData, Department>(DepartmentDialogComponent, {
        data: { department, users: this.users },
        width: '560px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open(`Department ${department ? 'updated' : 'created'}.`, 'Close', { duration: 3000 });
          this.load();
        }
      });
  }
}
