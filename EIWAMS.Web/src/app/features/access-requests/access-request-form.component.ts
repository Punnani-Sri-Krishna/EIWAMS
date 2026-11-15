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
import { Observable, switchMap } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, asApiError, endOfDayIso, startOfDayIso } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { AccessRequestDetail } from './access-requests.models';
import { AccessRequestsService } from './access-requests.service';

function validRange(group: AbstractControl): ValidationErrors | null {
  const from = group.get('validFrom')?.value as Date | null;
  const to = group.get('validTo')?.value as Date | null;
  return from && to && to < from ? { rangeInvalid: true } : null;
}

/** Create (Draft or submit) and edit Draft / Returned access requests. */
@Component({
  selector: 'eiw-access-request-form',
  imports: [
    ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatButtonModule,
    MatIconModule, MatProgressBarModule, ...KIT_IMPORTS,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ id ? 'Edit access request ' + (request()?.requestNumber ?? '') : 'New access request' }}</h1>
        <div class="page-actions">
          <a mat-button [routerLink]="id ? ['/access-requests', id] : ['/access-requests']"><mat-icon>arrow_back</mat-icon>Back</a>
        </div>
      </header>
      <div class="data-card">
        @if (loading() || saving()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="loadError()" (retry)="loadRequest()" />
        <eiw-error-state [error]="saveError()" [retryable]="false" />
        @if (request()?.status === 'Returned') {
          <div class="alert alert-warning m-3" role="status">This request was returned by an approver. Update it and resubmit.</div>
        }
        <form class="row g-3 p-3" [formGroup]="form" novalidate>
          <mat-form-field class="col-md-6">
            <mat-label>Employee</mat-label>
            <mat-select formControlName="employeeId" required>
              @for (e of lk.lookups()?.employees ?? []; track e.id) {
                <mat-option [value]="e.id">{{ e.name }} ({{ e.employeeNumber }})</mat-option>
              }
            </mat-select>
            <mat-error>Employee is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Location / zone</mat-label>
            <mat-select formControlName="locationId" required>
              @for (l of lk.lookups()?.locations ?? []; track l.id) {
                <mat-option [value]="l.id">{{ l.name }} ({{ l.locationType }}){{ l.isRestricted ? ' — restricted' : '' }}</mat-option>
              }
            </mat-select>
            <mat-hint>Restricted zones need Facility Admin approval in addition to Manager and Security.</mat-hint>
            <mat-error>Location is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-3">
            <mat-label>Valid from</mat-label>
            <input matInput [matDatepicker]="fromPicker" formControlName="validFrom" required />
            <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
            <mat-datepicker #fromPicker />
            <mat-error>Valid from is required.</mat-error>
          </mat-form-field>
          <mat-form-field class="col-md-3">
            <mat-label>Valid to</mat-label>
            <input matInput [matDatepicker]="toPicker" [min]="form.controls.validFrom.value" formControlName="validTo" required />
            <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
            <mat-datepicker #toPicker />
            <mat-error>Valid to is required.</mat-error>
          </mat-form-field>
          @if (form.hasError('rangeInvalid')) {
            <div class="col-md-6 text-danger small align-self-center" role="alert">Valid to must be on or after valid from.</div>
          }
          <mat-form-field class="col-12">
            <mat-label>Business justification</mat-label>
            <textarea matInput rows="4" formControlName="businessJustification" required maxlength="1000"></textarea>
            <mat-hint align="end">{{ form.controls.businessJustification.value.length }} / 1000</mat-hint>
            @if (form.controls.businessJustification.hasError('minlength')) {
              <mat-error>Justification must be at least 10 characters.</mat-error>
            } @else {
              <mat-error>Business justification is required.</mat-error>
            }
          </mat-form-field>
          <div class="col-12 d-flex gap-2 justify-content-end">
            <a mat-button [routerLink]="id ? ['/access-requests', id] : ['/access-requests']">Cancel</a>
            <button mat-stroked-button type="button" [disabled]="saving() || loading()" (click)="save(false)"><mat-icon>save</mat-icon>Save draft</button>
            <button mat-flat-button type="button" [disabled]="saving() || loading()" (click)="save(true)">
              <mat-icon>send</mat-icon>{{ request()?.status === 'Returned' ? 'Save & resubmit' : 'Save & submit' }}
            </button>
          </div>
        </form>
      </div>
    </section>
  `,
})
export class AccessRequestFormComponent {
  private readonly service = inject(AccessRequestsService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  readonly lk = inject(FeatureLookups);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;
  readonly request = signal<AccessRequestDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly saveError = signal<ApiError | null>(null);

  readonly form = new FormGroup(
    {
      employeeId: new FormControl<number | null>(inject(SessionService).user()?.employeeId ?? null, Validators.required),
      locationId: new FormControl<number | null>(null, Validators.required),
      validFrom: new FormControl<Date | null>(new Date(), Validators.required),
      validTo: new FormControl<Date | null>(null, Validators.required),
      businessJustification: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.minLength(10), Validators.maxLength(1000)],
      }),
    },
    { validators: validRange },
  );

  constructor() {
    this.lk.ensure();
    if (this.id) {
      this.form.controls.employeeId.disable();
      this.loadRequest();
    }
  }

  loadRequest(): void {
    if (!this.id) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.service.get(this.id).subscribe({
      next: (r) => {
        this.request.set(r);
        this.form.patchValue({
          employeeId: r.employeeId,
          locationId: r.locationId,
          validFrom: new Date(r.validFromUtc),
          validTo: new Date(r.validToUtc),
          businessJustification: r.businessJustification,
        });
        if (!r.canEdit) {
          this.form.disable();
          this.loadError.set({ status: 409, message: `Request ${r.requestNumber} is ${r.status} and can no longer be edited.`, errors: [], correlationId: null });
        }
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.loadError.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  save(submit: boolean): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const validFromUtc = startOfDayIso(v.validFrom) ?? '';
    const validToUtc = endOfDayIso(v.validTo) ?? '';
    const justification = v.businessJustification.trim();
    let op: Observable<AccessRequestDetail>;
    if (this.id) {
      const update = this.service.update(this.id, {
        locationId: v.locationId ?? 0,
        businessJustification: justification,
        validFromUtc,
        validToUtc,
        version: this.request()?.version ?? null,
      });
      op = submit ? update.pipe(switchMap((r) => this.service.submit(r.accessRequestId, r.version))) : update;
    } else {
      op = this.service.create({ employeeId: v.employeeId ?? 0, locationId: v.locationId ?? 0, businessJustification: justification, validFromUtc, validToUtc, submit });
    }
    this.saving.set(true);
    this.saveError.set(null);
    op.subscribe({
      next: (r) => {
        this.saving.set(false);
        this.notifier.success(submit ? `Request ${r.requestNumber} submitted for approval.` : `Draft ${r.requestNumber} saved.`);
        void this.router.navigate(['/access-requests', r.accessRequestId]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(asApiError(err));
      },
    });
  }
}
