import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

/** Contact validation per contract §5.5. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 -]{6,19}$/;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export interface ContactValues {
  mobileNumber: string | null;
  address: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
}

export type ContactForm = FormGroup<{
  mobileNumber: FormControl<string>;
  address: FormControl<string>;
  bloodGroup: FormControl<string>;
  emergencyContactName: FormControl<string>;
  emergencyContactNumber: FormControl<string>;
}>;

/** Contact details form. `required` = all five fields mandatory (card request); profile allows blanks. */
export function createContactForm(required: boolean): ContactForm {
  const req = required ? [Validators.required, Validators.pattern(/\S/)] : [];
  return new FormGroup({
    mobileNumber: new FormControl('', { nonNullable: true, validators: [...req, Validators.pattern(PHONE_PATTERN)] }),
    address: new FormControl('', { nonNullable: true, validators: [...req, Validators.maxLength(400)] }),
    bloodGroup: new FormControl('', { nonNullable: true, validators: required ? [Validators.required] : [] }),
    emergencyContactName: new FormControl('', { nonNullable: true, validators: [...req, Validators.maxLength(150)] }),
    emergencyContactNumber: new FormControl('', { nonNullable: true, validators: [...req, Validators.pattern(PHONE_PATTERN)] }),
  });
}

export function patchContactForm(form: ContactForm, v: Partial<ContactValues> | null | undefined): void {
  form.patchValue({
    mobileNumber: v?.mobileNumber ?? '',
    address: v?.address ?? '',
    bloodGroup: v?.bloodGroup ?? '',
    emergencyContactName: v?.emergencyContactName ?? '',
    emergencyContactNumber: v?.emergencyContactNumber ?? '',
  });
}

/** Trimmed values; blanks become null (null clears the field on PUT v1/me/profile). */
export function contactValues(form: ContactForm): ContactValues {
  const v = form.getRawValue();
  const clean = (s: string) => (s ?? '').trim() || null;
  return {
    mobileNumber: clean(v.mobileNumber),
    address: clean(v.address),
    bloodGroup: clean(v.bloodGroup),
    emergencyContactName: clean(v.emergencyContactName),
    emergencyContactNumber: clean(v.emergencyContactNumber),
  };
}

/** The five editable contact fields laid out on the shared 2-column form grid. */
@Component({
  selector: 'app-contact-fields',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form-grid" [formGroup]="form()">
      <mat-form-field>
        <mat-label>Mobile number</mat-label>
        <input matInput formControlName="mobileNumber" type="tel" autocomplete="tel" maxlength="20" [required]="required()" />
        <mat-hint>Digits, spaces or dashes; optional leading +</mat-hint>
        @if (form().controls.mobileNumber.hasError('pattern')) {
          <mat-error>Enter a valid phone number (7-20 digits).</mat-error>
        } @else {
          <mat-error>Mobile number is required.</mat-error>
        }
      </mat-form-field>
      <mat-form-field>
        <mat-label>Blood group</mat-label>
        <mat-select formControlName="bloodGroup" [required]="required()">
          @if (!required()) {
            <mat-option value="">Not specified</mat-option>
          }
          @for (g of bloodGroups(); track g) {
            <mat-option [value]="g">{{ g }}</mat-option>
          }
        </mat-select>
        <mat-error>Blood group is required.</mat-error>
      </mat-form-field>
      <mat-form-field class="span-2">
        <mat-label>Address</mat-label>
        <textarea matInput formControlName="address" rows="2" maxlength="400" autocomplete="street-address" [required]="required()"></textarea>
        <mat-hint align="end">{{ form().controls.address.value.length }} / 400</mat-hint>
        <mat-error>Address is required (max 400 characters).</mat-error>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Emergency contact name</mat-label>
        <input matInput formControlName="emergencyContactName" maxlength="150" [required]="required()" />
        <mat-error>Emergency contact name is required (max 150 characters).</mat-error>
      </mat-form-field>
      <mat-form-field>
        <mat-label>Emergency contact number</mat-label>
        <input matInput formControlName="emergencyContactNumber" type="tel" maxlength="20" [required]="required()" />
        @if (form().controls.emergencyContactNumber.hasError('pattern')) {
          <mat-error>Enter a valid phone number (7-20 digits).</mat-error>
        } @else {
          <mat-error>Emergency contact number is required.</mat-error>
        }
      </mat-form-field>
    </div>
  `,
})
export class ContactFieldsComponent {
  readonly form = input.required<ContactForm>();
  readonly required = input(false);
  readonly bloodGroups = input<readonly string[]>(BLOOD_GROUPS);
}
