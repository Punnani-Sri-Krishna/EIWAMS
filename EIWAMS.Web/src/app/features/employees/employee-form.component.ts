import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { FeatureLookups, Notifier, asApiError, fromDateOnly, toDateOnly } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { EmployeeDetail, SaveEmployeeRequest } from './employees.models';
import { EmployeesService } from './employees.service';

function endAfterJoin(group: AbstractControl): ValidationErrors | null {
  const join = group.get('joinDate')?.value as Date | null;
  const end = group.get('endDate')?.value as Date | null;
  return join && end && end < join ? { endBeforeJoin: true } : null;
}

@Component({
  selector: 'eiw-employee-form',
  imports: [
    ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatButtonModule, MatIconModule, MatProgressBarModule, ...KIT_IMPORTS,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ id ? 'Edit employee' : 'New employee' }}</h1>
        <div class="page-actions">
          <a mat-button [routerLink]="id ? ['/employees', id] : ['/employees']"><mat-icon>arrow_back</mat-icon>Back</a>
        </div>
      </header>
      <div class="data-card">
        @if (loading() || saving()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="loadError()" (retry)="loadEmployee()" />
        <eiw-error-state [error]="saveError()" [retryable]="false" />
        <form class="row g-3 p-3" [formGroup]="form" (ngSubmit)="save()" novalidate>
          @if (!id) {
            <mat-form-field class="col-md-4">
              <mat-label>Employee number</mat-label>
              <input matInput formControlName="employeeNumber" required maxlength="30" />
              @if (form.controls.employeeNumber.hasError('required')) {
                <mat-error>Employee number is required.</mat-error>
              }
            </mat-form-field>
          }
          <mat-form-field class="col-md-4">
            <mat-label>First name</mat-label>
            <input matInput formControlName="firstName" required maxlength="100" />
            <mat-error>First name is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-4">
            <mat-label>Last name</mat-label>
            <input matInput formControlName="lastName" required maxlength="100" />
            <mat-error>Last name is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Work email</mat-label>
            <input matInput type="email" formControlName="workEmail" required maxlength="256" />
            @if (form.controls.workEmail.hasError('email')) {
              <mat-error>Enter a valid email address.</mat-error>
            } @else {
              <mat-error>Work email is required.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-3">
            <mat-label>Employee type</mat-label>
            <mat-select formControlName="employeeType" required>
              @for (t of lk.lookups()?.employeeTypes ?? []; track t) {
                <mat-option [value]="t">{{ t }}</mat-option>
              }
            </mat-select>
            <mat-error>Employee type is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-3">
            <mat-label>Department</mat-label>
            <mat-select formControlName="departmentId" required>
              @for (d of lk.lookups()?.departments ?? []; track d.id) {
                <mat-option [value]="d.id">{{ d.name }}</mat-option>
              }
            </mat-select>
            <mat-error>Department is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-4">
            <mat-label>Manager</mat-label>
            <mat-select formControlName="managerEmployeeId">
              <mat-option [value]="null">None</mat-option>
              @for (e of lk.lookups()?.employees ?? []; track e.id) {
                @if (e.id !== id) {
                  <mat-option [value]="e.id">{{ e.name }} ({{ e.employeeNumber }})</mat-option>
                }
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="col-md-4">
            <mat-label>Location</mat-label>
            <mat-select formControlName="locationId" required>
              @for (l of lk.lookups()?.locations ?? []; track l.id) {
                <mat-option [value]="l.id">{{ l.name }}</mat-option>
              }
            </mat-select>
            <mat-error>Location is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-2">
            <mat-label>Join date</mat-label>
            <input matInput [matDatepicker]="joinPicker" formControlName="joinDate" required />
            <mat-datepicker-toggle matIconSuffix [for]="joinPicker" />
            <mat-datepicker #joinPicker />
            <mat-error>Join date is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-2">
            <mat-label>End date</mat-label>
            <input matInput [matDatepicker]="endPicker" formControlName="endDate" />
            <mat-datepicker-toggle matIconSuffix [for]="endPicker" />
            <mat-datepicker #endPicker />
          </mat-form-field>
          @if (form.hasError('endBeforeJoin') && form.controls.endDate.touched) {
            <div class="col-12 text-danger small" role="alert">End date must be on or after the join date.</div>
          }
          <div class="col-12 d-flex gap-2 justify-content-end">
            <a mat-button [routerLink]="id ? ['/employees', id] : ['/employees']">Cancel</a>
            <button mat-flat-button type="submit" [disabled]="saving() || loading()"><mat-icon>save</mat-icon>Save</button>
          </div>
        </form>
      </div>
    </section>
  `,
})
export class EmployeeFormComponent {
  private readonly service = inject(EmployeesService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  readonly lk = inject(FeatureLookups);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly saveError = signal<ApiError | null>(null);
  private version: string | null = null;
  private userId: number | null = null;

  readonly form = new FormGroup(
    {
      employeeNumber: new FormControl('', { nonNullable: true, validators: this.id ? [] : [Validators.required, Validators.maxLength(30)] }),
      firstName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
      lastName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
      workEmail: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(256)] }),
      employeeType: new FormControl<string | null>(null, Validators.required),
      departmentId: new FormControl<number | null>(null, Validators.required),
      managerEmployeeId: new FormControl<number | null>(null),
      locationId: new FormControl<number | null>(null, Validators.required),
      joinDate: new FormControl<Date | null>(new Date(), Validators.required),
      endDate: new FormControl<Date | null>(null),
    },
    { validators: endAfterJoin },
  );

  constructor() {
    this.lk.ensure();
    if (this.id) this.loadEmployee();
  }

  loadEmployee(): void {
    if (!this.id) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.service.get(this.id).subscribe({
      next: (e) => {
        this.patch(e);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  private patch(e: EmployeeDetail): void {
    this.version = e.version;
    this.userId = e.userId;
    this.form.patchValue({
      employeeNumber: e.employeeNumber,
      firstName: e.firstName,
      lastName: e.lastName,
      workEmail: e.workEmail,
      employeeType: e.employeeType,
      departmentId: e.departmentId,
      managerEmployeeId: e.managerEmployeeId,
      locationId: e.locationId,
      joinDate: fromDateOnly(e.joinDate),
      endDate: fromDateOnly(e.endDate),
    });
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const body: SaveEmployeeRequest = {
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      workEmail: v.workEmail.trim(),
      employeeType: v.employeeType ?? '',
      departmentId: v.departmentId ?? 0,
      managerEmployeeId: v.managerEmployeeId,
      locationId: v.locationId ?? 0,
      joinDate: toDateOnly(v.joinDate) ?? '',
      endDate: toDateOnly(v.endDate) ?? null,
    };
    const request = this.id
      ? this.service.update(this.id, { ...body, userId: this.userId, version: this.version })
      : this.service.create({ ...body, employeeNumber: v.employeeNumber.trim() });
    this.saving.set(true);
    this.saveError.set(null);
    request.subscribe({
      next: (e) => {
        this.saving.set(false);
        this.notifier.success(this.id ? 'Employee updated.' : 'Employee created.');
        void this.router.navigate(['/employees', e?.employeeId ?? this.id]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(asApiError(err));
      },
    });
  }
}
