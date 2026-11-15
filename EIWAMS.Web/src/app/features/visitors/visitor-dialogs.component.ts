import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { ApiError } from '../../core/models/api.models';
import { FeatureLookups, asApiError, localInputToIso, toLocalInput } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { Visitor, VisitorPass } from './visitors.models';
import { VisitorsService } from './visitors.service';

@Component({
  selector: 'eiw-register-visitor-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Register visitor</h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <eiw-error-state [error]="error()" [retryable]="false" />
        <div class="row g-2">
          <mat-form-field class="col-md-6">
            <mat-label>Full name</mat-label>
            <input matInput formControlName="displayName" maxlength="150" required />
            @if (form.controls.displayName.hasError('required')) {
              <mat-error>Name is required.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Organization</mat-label>
            <input matInput formControlName="organization" maxlength="150" />
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Contact reference</mat-label>
            <input matInput formControlName="contactReference" maxlength="150" placeholder="Phone or email" />
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Sponsor</mat-label>
            <mat-select formControlName="sponsorUserId">
              <mat-option [value]="null">Me</mat-option>
              @for (u of lk.lookups()?.users ?? []; track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="col-12">
            <mat-label>Purpose of visit</mat-label>
            <textarea matInput formControlName="visitPurpose" rows="3" maxlength="500" required></textarea>
            @if (form.controls.visitPurpose.hasError('required')) {
              <mat-error>Purpose is required.</mat-error>
            }
          </mat-form-field>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Register</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class RegisterVisitorDialogComponent {
  private readonly ref = inject<MatDialogRef<RegisterVisitorDialogComponent, Visitor>>(MatDialogRef);
  private readonly service = inject(VisitorsService);
  readonly lk = inject(FeatureLookups);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly form = new FormGroup({
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    organization: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(150)] }),
    contactReference: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(150)] }),
    visitPurpose: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(500)] }),
    sponsorUserId: new FormControl<number | null>(null),
  });

  constructor() {
    this.lk.ensure();
  }

  save(): void {
    for (const key of ['displayName', 'visitPurpose'] as const) {
      if (!this.form.controls[key].value.trim()) this.form.controls[key].setValue('');
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service
      .createVisitor({
        displayName: v.displayName.trim(),
        organization: v.organization.trim() || null,
        contactReference: v.contactReference.trim() || null,
        visitPurpose: v.visitPurpose.trim(),
        sponsorUserId: v.sponsorUserId,
      })
      .subscribe({
        next: (res) => this.ref.close(res),
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }
}

function validityOrder(group: AbstractControl): ValidationErrors | null {
  const from = localInputToIso(group.get('validFrom')?.value as string);
  const to = localInputToIso(group.get('validTo')?.value as string);
  return from && to && to <= from ? { order: true } : null;
}

export interface NewPassDialogData {
  visitor?: Visitor | null;
}

@Component({
  selector: 'eiw-new-pass-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>New visitor pass</h2>
    @if (saving() || visitorsLoading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <eiw-error-state [error]="error()" [retryable]="false" />
        <div class="row g-2">
          <mat-form-field class="col-12">
            <mat-label>Visitor</mat-label>
            <mat-select formControlName="visitorId" required>
              @for (v of visitors(); track v.visitorId) {
                <mat-option [value]="v.visitorId" [disabled]="v.isBlacklisted">
                  {{ v.displayName }}{{ v.organization ? ' — ' + v.organization : '' }}{{ v.isBlacklisted ? ' (blacklisted)' : '' }}
                </mat-option>
              }
            </mat-select>
            @if (form.controls.visitorId.hasError('required')) {
              <mat-error>Select a visitor.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Location</mat-label>
            <mat-select formControlName="locationId" required>
              @for (l of lk.lookups()?.locations ?? []; track l.id) {
                <mat-option [value]="l.id">{{ l.name }}{{ l.isRestricted ? ' (restricted)' : '' }}</mat-option>
              }
            </mat-select>
            @if (form.controls.locationId.hasError('required')) {
              <mat-error>Select a location.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Sponsor</mat-label>
            <mat-select formControlName="sponsorUserId">
              <mat-option [value]="null">Visitor's sponsor / me</mat-option>
              @for (u of lk.lookups()?.users ?? []; track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Valid from</mat-label>
            <input matInput type="datetime-local" formControlName="validFrom" required />
            @if (form.controls.validFrom.hasError('required')) {
              <mat-error>Required.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Valid to</mat-label>
            <input matInput type="datetime-local" formControlName="validTo" required />
            @if (form.controls.validTo.hasError('required')) {
              <mat-error>Required.</mat-error>
            }
          </mat-form-field>
          @if (form.hasError('order')) {
            <div class="col-12 text-danger small" role="alert">"Valid to" must be later than "Valid from".</div>
          }
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Create pass</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class NewPassDialogComponent {
  private readonly data = inject<NewPassDialogData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly ref = inject<MatDialogRef<NewPassDialogComponent, VisitorPass>>(MatDialogRef);
  private readonly service = inject(VisitorsService);
  readonly lk = inject(FeatureLookups);
  readonly saving = signal(false);
  readonly visitorsLoading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly visitors = signal<Visitor[]>(this.data?.visitor ? [this.data.visitor] : []);

  readonly form = new FormGroup(
    {
      visitorId: new FormControl<number | null>(this.data?.visitor?.visitorId ?? null, [Validators.required]),
      locationId: new FormControl<number | null>(null, [Validators.required]),
      sponsorUserId: new FormControl<number | null>(null),
      validFrom: new FormControl(toLocalInput(new Date()), { nonNullable: true, validators: [Validators.required] }),
      validTo: new FormControl(toLocalInput(new Date(Date.now() + 8 * 3600 * 1000)), { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: validityOrder },
  );

  constructor() {
    this.lk.ensure();
    if (!this.data?.visitor) {
      this.visitorsLoading.set(true);
      this.service.visitors({ page: 1, pageSize: 100, sortBy: 'displayName', sortDir: 'asc' }).subscribe({
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

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service
      .createPass({
        visitorId: v.visitorId!,
        locationId: v.locationId!,
        sponsorUserId: v.sponsorUserId,
        validFromUtc: localInputToIso(v.validFrom)!,
        validToUtc: localInputToIso(v.validTo)!,
      })
      .subscribe({
        next: (res) => this.ref.close(res),
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }
}
