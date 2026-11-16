import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';

import { ApiError } from '../../core/models/api.models';
import { FeatureLookups, asApiError, endOfDayIso } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { CARD_UID_PATTERN, Card } from './cards.models';
import { CardsService } from './cards.service';

const DIALOG_IMPORTS = [
  ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
  MatButtonModule, MatProgressBarModule, ...KIT_IMPORTS,
];

function temporaryNeedsExpiry(group: AbstractControl): ValidationErrors | null {
  const type = group.get('cardType')?.value ?? group.get('requestType')?.value;
  const expiry = group.get('expires')?.value;
  return type === 'Temporary' && !expiry ? { expiryRequired: true } : null;
}

/** Manual issue (Cards.Issue). v2 card requests get their card through the workflow (MarkPrinted -> Issue). */
export interface IssueCardDialogData {
  employeeId?: number | null;
}

/** Issue (encode) a card, optionally fulfilling an approved card request (Cards.Issue). */
@Component({
  selector: 'eiw-issue-card-dialog',
  imports: DIALOG_IMPORTS,
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Issue card</h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate autocomplete="off">
      <mat-dialog-content class="row g-2">
        <eiw-error-state [error]="error()" [retryable]="false" />
        <mat-form-field class="col-md-7">
          <mat-label>Employee</mat-label>
          <mat-select formControlName="employeeId" required>
            @for (e of lk.lookups()?.employees ?? []; track e.id) {
              <mat-option [value]="e.id">{{ e.name }} ({{ e.employeeNumber }})</mat-option>
            }
          </mat-select>
          <mat-error>Employee is required.</mat-error>
        </mat-form-field>
        <mat-form-field class="col-md-5">
          <mat-label>Card type</mat-label>
          <mat-select formControlName="cardType" required>
            @for (t of lk.lookups()?.cardTypes ?? []; track t) {
              <mat-option [value]="t">{{ t }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-md-7">
          <mat-label>Card UID (scan or type)</mat-label>
          <input matInput type="password" formControlName="cardUid" required maxlength="32" autocomplete="off" />
          <mat-hint>4–32 hexadecimal characters. Stored encrypted; only a masked value is displayed.</mat-hint>
          @if (form.controls.cardUid.hasError('pattern')) {
            <mat-error>Card UID must be 4–32 hexadecimal characters.</mat-error>
          } @else {
            <mat-error>Card UID is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field class="col-md-5">
          <mat-label>Expires</mat-label>
          <input matInput [matDatepicker]="picker" [min]="today" formControlName="expires" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>
        @if (form.hasError('expiryRequired') && form.touched) {
          <div class="col-12 text-danger small" role="alert">An expiry date is required for temporary cards.</div>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Issue card</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class IssueCardDialogComponent {
  readonly data = inject<IssueCardDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<IssueCardDialogComponent, Card>>(MatDialogRef);
  private readonly service = inject(CardsService);
  readonly lk = inject(FeatureLookups);
  readonly today = new Date();
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly form = new FormGroup(
    {
      employeeId: new FormControl<number | null>(this.data?.employeeId ?? null, Validators.required),
      cardType: new FormControl('Permanent', { nonNullable: true, validators: Validators.required }),
      cardUid: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CARD_UID_PATTERN)] }),
      expires: new FormControl<Date | null>(null),
    },
    { validators: temporaryNeedsExpiry },
  );

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
      .issue({
        employeeId: v.employeeId ?? 0,
        cardUid: v.cardUid.trim().toUpperCase(),
        cardType: v.cardType,
        expiresAtUtc: endOfDayIso(v.expires) ?? null,
      })
      .subscribe({
        next: (c) => this.ref.close(c),
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }
}

/** Replace a card with a newly encoded one (Cards.Issue). */
@Component({
  selector: 'eiw-replace-card-dialog',
  imports: DIALOG_IMPORTS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Replace card {{ card.maskedCardUid }}</h2>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate autocomplete="off">
      <mat-dialog-content class="row g-2">
        <p class="col-12">{{ card.employeeName }} — the current card will be deactivated.</p>
        <eiw-error-state [error]="error()" [retryable]="false" />
        <mat-form-field class="col-12">
          <mat-label>New card UID</mat-label>
          <input matInput type="password" formControlName="newCardUid" required maxlength="32" autocomplete="off" />
          @if (form.controls.newCardUid.hasError('pattern')) {
            <mat-error>Card UID must be 4–32 hexadecimal characters.</mat-error>
          } @else {
            <mat-error>New card UID is required.</mat-error>
          }
        </mat-form-field>
        <mat-form-field class="col-12">
          <mat-label>Reason</mat-label>
          <textarea matInput rows="3" formControlName="reason" required maxlength="500"></textarea>
          <mat-error>Reason is required (max 500 characters).</mat-error>
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit" [disabled]="saving()">Replace</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class ReplaceCardDialogComponent {
  readonly card = inject<Card>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ReplaceCardDialogComponent, Card>>(MatDialogRef);
  private readonly service = inject(CardsService);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly form = new FormGroup({
    newCardUid: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CARD_UID_PATTERN)] }),
    reason: new FormControl(this.card.status === 'Active' ? '' : `Card ${this.card.status.toLowerCase()}`, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(500)],
    }),
  });

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service.replace(this.card, v.newCardUid.trim().toUpperCase(), v.reason.trim()).subscribe({
      next: (c) => this.ref.close(c),
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(asApiError(err));
      },
    });
  }
}
