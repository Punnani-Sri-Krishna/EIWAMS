import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { ApiError } from '../../core/models/api.models';
import { FeatureLookups, asApiError, toDateOnly } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { DEACTIVATION_STATUSES, EmployeeDetail } from './employees.models';
import { EmployeesService } from './employees.service';

const DIALOG_IMPORTS = [
  ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
  MatButtonModule, MatProgressBarModule, ...KIT_IMPORTS,
];

/** Transfer an employee to another department / manager / location (Employees.Transfer). */
@Component({
  selector: 'eiw-transfer-dialog',
  imports: DIALOG_IMPORTS,
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Transfer {{ data.fullName }}</h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="row g-2">
        <eiw-error-state [error]="error()" [retryable]="false" />
        <mat-form-field class="col-md-6">
          <mat-label>Department</mat-label>
          <mat-select formControlName="departmentId" required>
            @for (d of lk.lookups()?.departments ?? []; track d.id) {
              <mat-option [value]="d.id">{{ d.name }}</mat-option>
            }
          </mat-select>
          <mat-error>Department is required.</mat-error>
        </mat-form-field>
        <mat-form-field class="col-md-6">
          <mat-label>Location</mat-label>
          <mat-select formControlName="locationId" required>
            @for (l of lk.lookups()?.locations ?? []; track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
          <mat-error>Location is required.</mat-error>
        </mat-form-field>
        <mat-form-field class="col-md-6">
          <mat-label>Manager</mat-label>
          <mat-select formControlName="managerEmployeeId">
            <mat-option [value]="null">None</mat-option>
            @for (e of lk.lookups()?.employees ?? []; track e.id) {
              @if (e.id !== data.employeeId) {
                <mat-option [value]="e.id">{{ e.name }}</mat-option>
              }
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-md-6">
          <mat-label>Effective date</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="effectiveDate" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          <mat-error>Effective date is required.</mat-error>
        </mat-form-field>
        <mat-form-field class="col-12">
          <mat-label>Reason</mat-label>
          <textarea matInput rows="3" formControlName="reason" required maxlength="500"></textarea>
          <mat-error>Reason is required (max 500 characters).</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Transfer</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class TransferDialogComponent {
  readonly data = inject<EmployeeDetail>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<TransferDialogComponent, EmployeeDetail>>(MatDialogRef);
  private readonly service = inject(EmployeesService);
  readonly lk = inject(FeatureLookups);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly form = new FormGroup({
    departmentId: new FormControl<number | null>(this.data.departmentId, Validators.required),
    locationId: new FormControl<number | null>(this.data.locationId, Validators.required),
    managerEmployeeId: new FormControl<number | null>(this.data.managerEmployeeId),
    effectiveDate: new FormControl<Date | null>(new Date(), Validators.required),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)] }),
  });

  constructor() {
    this.lk.ensure();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service
      .transfer(this.data.employeeId, {
        departmentId: v.departmentId ?? 0,
        locationId: v.locationId ?? 0,
        managerEmployeeId: v.managerEmployeeId,
        effectiveDate: toDateOnly(v.effectiveDate) ?? '',
        reason: v.reason.trim(),
      })
      .subscribe({
        next: (e) => this.ref.close(e),
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }
}

/** Deactivate (exit / inactivate) an employee (Employees.Deactivate). */
@Component({
  selector: 'eiw-deactivate-dialog',
  imports: DIALOG_IMPORTS,
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Deactivate {{ data.fullName }}</h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <mat-dialog-content class="row g-2">
        <p class="col-12">Active cards and access permissions for this employee will be revoked by the system.</p>
        <eiw-error-state [error]="error()" [retryable]="false" />
        <mat-form-field class="col-md-6">
          <mat-label>New status</mat-label>
          <mat-select formControlName="employmentStatus" required>
            @for (s of statuses; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
          <mat-error>Status is required.</mat-error>
        </mat-form-field>
        <mat-form-field class="col-md-6">
          <mat-label>End date</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="endDate" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          <mat-error>End date is required.</mat-error>
        </mat-form-field>
        <mat-form-field class="col-12">
          <mat-label>Reason</mat-label>
          <textarea matInput rows="3" formControlName="reason" required maxlength="500"></textarea>
          <mat-error>Reason is required (max 500 characters).</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" class="danger-action" [disabled]="saving()">Deactivate</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class DeactivateDialogComponent {
  readonly data = inject<EmployeeDetail>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<DeactivateDialogComponent, EmployeeDetail>>(MatDialogRef);
  private readonly service = inject(EmployeesService);
  readonly statuses = DEACTIVATION_STATUSES;
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly form = new FormGroup({
    employmentStatus: new FormControl('Exited', { nonNullable: true, validators: Validators.required }),
    endDate: new FormControl<Date | null>(new Date(), Validators.required),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)] }),
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service
      .deactivate(this.data.employeeId, { employmentStatus: v.employmentStatus, endDate: toDateOnly(v.endDate) ?? '', reason: v.reason.trim() })
      .subscribe({
        next: (e) => this.ref.close(e),
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }
}
