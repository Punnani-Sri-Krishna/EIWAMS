import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, map, startWith, switchMap } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import {
  ACCESS_TYPES,
  ACCESS_TYPE_META,
  AccessRequestDetail,
  AccessType,
  CreateAccessRequestBody,
  DURATION_CODES,
  DurationCode,
  buildingsOf,
  computeValidTo,
  customRangeError,
  descendantsOf,
  durationLabel,
  stageLabel,
  stagesFor,
  toAccessRequestPayload,
} from './access-requests.models';
import { AccessRequestsService } from './access-requests.service';

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 0);
  return r;
}

/** Effective instants for a Custom range: today starts "now"; later dates start at midnight; end = end of day. */
export function customInstants(from: Date | null, to: Date | null, now = new Date()): { from: Date | null; to: Date | null } {
  const f = from ? (startOfDay(from).getTime() <= startOfDay(now).getTime() ? now : startOfDay(from)) : null;
  return { from: f, to: to ? endOfDay(to) : null };
}

function targetValidator(group: AbstractControl): ValidationErrors | null {
  const type = group.get('accessType')?.value as AccessType;
  return type === 'WingFloor' && !group.get('locationId')?.value ? { targetRequired: true } : null;
}

function durationValidator(group: AbstractControl): ValidationErrors | null {
  if (group.get('durationCode')?.value !== 'Custom') return null;
  const { from, to } = customInstants(group.get('validFrom')?.value as Date | null, group.get('validTo')?.value as Date | null);
  const err = customRangeError(from, to);
  return err ? { customRange: err } : null;
}

/** Raise (or edit a Draft / Returned) access request: type -> building -> wing/floor -> duration -> justification -> review. */
@Component({
  selector: 'eiw-access-request-form',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatStepperModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatDatepickerModule, MatButtonModule, MatIconModule, MatProgressBarModule, ...KIT_IMPORTS,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .step-body { padding-top: 8px; }
    .chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; padding: 0; list-style: none; font-size: 0.85rem; }
    .chain li { display: inline-flex; align-items: center; gap: 6px; }
    .chain .mat-icon { font-size: 16px; width: 16px; height: 16px; color: var(--lab-muted); }
    .presets { flex-wrap: wrap; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>{{ id ? 'Edit access request ' + (request()?.requestNumber ?? '') : 'Raise access request' }}</h1>
          <p class="subtitle">Request access to a building or to a specific wing, floor or zone.</p>
        </div>
        <div class="page-actions">
          <a mat-button [routerLink]="id ? ['/access-requests', id] : ['/my-requests']" [queryParams]="id ? null : { tab: 'access' }">
            <mat-icon>arrow_back</mat-icon>{{ id ? 'Back to request' : 'My requests' }}
          </a>
        </div>
      </header>

      <div class="data-card">
        @if (loading() || saving() || (!lk.lookups() && !lk.error())) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="lk.error()" (retry)="lk.ensure()" />
        <eiw-error-state [error]="loadError()" (retry)="loadRequest()" />
        @if (request()?.status === 'Returned') {
          <div class="notice warning"><mat-icon>undo</mat-icon><span>This request was returned by an approver. Update it and resubmit.</span></div>
        }

        @if (!id && !hasEmployeeProfile()) {
          <div class="notice warning" role="alert">
            <mat-icon>info</mat-icon><span>Your account is not linked to an employee record, so you cannot raise an access request.</span>
          </div>
        } @else {
        <mat-stepper linear [orientation]="narrow() ? 'vertical' : 'horizontal'" labelPosition="bottom" aria-label="Access request steps">
          <!-- 1. Where -->
          <mat-step [stepControl]="whereForm" label="Location">
            <form class="step-body" [formGroup]="whereForm" novalidate>
              <h2 class="section-title"><mat-icon>place</mat-icon>Access type</h2>
              <div class="choice-grid" role="radiogroup" aria-label="Access type">
                @for (t of accessTypes; track t) {
                  <button type="button" class="choice-card" role="radio" [attr.aria-checked]="accessType() === t"
                          [class.selected]="accessType() === t" (click)="setType(t)" [disabled]="whereForm.disabled">
                    <mat-icon aria-hidden="true">{{ typeMeta[t].icon }}</mat-icon>
                    <span><strong>{{ typeMeta[t].title }}</strong><small>{{ typeMeta[t].description }}</small></span>
                  </button>
                }
              </div>
              <div class="form-grid">
                <mat-form-field>
                  <mat-label>Building</mat-label>
                  <mat-select formControlName="buildingLocationId" required>
                    @for (b of buildings(); track b.id) {
                      <mat-option [value]="b.id">{{ b.name }}{{ b.isRestricted ? ' (restricted)' : '' }}</mat-option>
                    }
                  </mat-select>
                  @if (!buildings().length && lk.lookups()) {
                    <mat-hint>No buildings are configured.</mat-hint>
                  }
                  <mat-error>Select a building.</mat-error>
                </mat-form-field>
                @if (accessType() === 'WingFloor') {
                  <mat-form-field>
                    <mat-label>Wing / floor / zone</mat-label>
                    <mat-select formControlName="locationId" required>
                      @for (l of targets(); track l.id) {
                        <mat-option [value]="l.id">{{ l.pathLabel }} · {{ l.locationType }}{{ l.isRestricted ? ' (restricted)' : '' }}</mat-option>
                      }
                    </mat-select>
                    @if (!whereForm.value.buildingLocationId) {
                      <mat-hint>Select a building first.</mat-hint>
                    } @else if (!targets().length) {
                      <mat-hint>This building has no wings, floors or zones.</mat-hint>
                    }
                    <mat-error>Select a wing, floor or zone.</mat-error>
                  </mat-form-field>
                }
              </div>
              <div class="notice">
                <mat-icon>route</mat-icon>
                <span>Approval chain:
                  <ol class="chain d-inline-flex">
                    @for (s of chain(); track s; let last = $last) {
                      <li>{{ stageLabel(s) }}@if (!last) {<mat-icon aria-hidden="true">chevron_right</mat-icon>}</li>
                    }
                  </ol>
                </span>
              </div>
              <div class="form-actions">
                <a mat-button [routerLink]="id ? ['/access-requests', id] : ['/my-requests']">Cancel</a>
                <button mat-flat-button matStepperNext type="button" (click)="whereForm.markAllAsTouched()">Next<mat-icon iconPositionEnd>arrow_forward</mat-icon></button>
              </div>
            </form>
          </mat-step>

          <!-- 2. Duration & justification -->
          <mat-step [stepControl]="whenForm" label="Duration & reason">
            <form class="step-body" [formGroup]="whenForm" novalidate>
              <h2 class="section-title"><mat-icon>event</mat-icon>Duration</h2>
              <mat-button-toggle-group class="presets mb-3" formControlName="durationCode" aria-label="Duration" hideSingleSelectionIndicator>
                @for (d of durations(); track d) {
                  <mat-button-toggle [value]="d">{{ durationLabel(d) }}</mat-button-toggle>
                }
              </mat-button-toggle-group>
              @if (durationCode() === 'Custom') {
                <div class="form-grid">
                  <mat-form-field>
                    <mat-label>From</mat-label>
                    <input matInput [matDatepicker]="fromPicker" [min]="today" formControlName="validFrom" required />
                    <mat-datepicker-toggle matIconSuffix [for]="fromPicker" />
                    <mat-datepicker #fromPicker />
                    <mat-hint>Today starts immediately</mat-hint>
                    <mat-error>Choose a start date (today or later).</mat-error>
                  </mat-form-field>
                  <mat-form-field>
                    <mat-label>To</mat-label>
                    <input matInput [matDatepicker]="toPicker" [min]="whenForm.value.validFrom ?? today" formControlName="validTo" required />
                    <mat-datepicker-toggle matIconSuffix [for]="toPicker" />
                    <mat-datepicker #toPicker />
                    <mat-hint>Up to one year</mat-hint>
                    <mat-error>Choose an end date.</mat-error>
                  </mat-form-field>
                </div>
                @if (whenForm.errors?.['customRange']; as msg) {
                  @if (whenForm.touched || whenForm.value.validTo) {
                    <p class="text-danger small" role="alert">{{ msg }}</p>
                  }
                }
              } @else if (preview(); as p) {
                <p class="text-muted small mb-3">
                  Valid from submission until about <strong>{{ durationCode() === 'Permanent' ? 'revoked (permanent)' : (p | date: 'mediumDate') }}</strong>.
                </p>
              }
              <h2 class="section-title mt-2"><mat-icon>notes</mat-icon>Business justification</h2>
              <mat-form-field class="w-100">
                <mat-label>Why do you need this access?</mat-label>
                <textarea matInput rows="4" formControlName="justification" required maxlength="1000"></textarea>
                <mat-hint>10-1000 characters</mat-hint>
                <mat-hint align="end">{{ whenForm.value.justification?.length ?? 0 }} / 1000</mat-hint>
                @if (whenForm.controls.justification.hasError('minlength')) {
                  <mat-error>Justification must be at least 10 characters.</mat-error>
                } @else {
                  <mat-error>Justification is required.</mat-error>
                }
              </mat-form-field>
              <div class="form-actions">
                <button mat-button matStepperPrevious type="button"><mat-icon>arrow_back</mat-icon>Back</button>
                <button mat-flat-button matStepperNext type="button" (click)="whenForm.markAllAsTouched()">Next<mat-icon iconPositionEnd>arrow_forward</mat-icon></button>
              </div>
            </form>
          </mat-step>

          <!-- 3. Review -->
          <mat-step label="Review & submit">
            <div class="step-body">
              <h2 class="section-title"><mat-icon>checklist</mat-icon>Review your request</h2>
              <dl class="kv-grid">
                <dt>Employee</dt><dd>{{ request()?.employeeName ?? session.user()?.displayName }}</dd>
                <dt>Access type</dt><dd>{{ typeMeta[accessType()].title }}</dd>
                <dt>Building</dt><dd>{{ buildingName() || '—' }}</dd>
                @if (accessType() === 'WingFloor') {
                  <dt>Wing / floor / zone</dt><dd>{{ targetName() || '—' }}</dd>
                }
                <dt>Duration</dt>
                <dd>{{ durationLabel(durationCode()) }}
                  @if (durationCode() === 'Custom') {
                    <span class="text-muted">({{ whenForm.value.validFrom | date: 'mediumDate' }} – {{ whenForm.value.validTo | date: 'mediumDate' }})</span>
                  }
                </dd>
                <dt>Approvals</dt><dd>{{ chainText() }}</dd>
                <dt>Justification</dt><dd class="pre">{{ whenForm.value.justification }}</dd>
              </dl>
              <eiw-error-state class="d-block mt-3" [error]="saveError()" [retryable]="false" />
              <div class="form-actions">
                <button mat-button matStepperPrevious type="button" [disabled]="saving()"><mat-icon>arrow_back</mat-icon>Back</button>
                @if (id) {
                  <button mat-stroked-button type="button" [disabled]="saving() || loading()" (click)="save(false)"><mat-icon>save</mat-icon>Save changes</button>
                }
                <button mat-flat-button type="button" [disabled]="saving() || loading()" (click)="save(true)">
                  <mat-icon>send</mat-icon>{{ request()?.status === 'Returned' ? 'Resubmit' : 'Submit request' }}
                </button>
              </div>
            </div>
          </mat-step>
        </mat-stepper>
        }
      </div>
    </section>
  `,
})
export class AccessRequestFormComponent {
  private readonly service = inject(AccessRequestsService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id')) || null;
  readonly hasEmployeeProfile = computed(() => typeof this.session.user()?.employeeId === 'number');
  readonly narrow = toSignal(inject(BreakpointObserver).observe('(max-width: 767.98px)').pipe(map((s) => s.matches)), { initialValue: false });

  readonly typeMeta = ACCESS_TYPE_META;
  readonly durationLabel = durationLabel;
  readonly stageLabel = stageLabel;
  readonly today = startOfDay(new Date());

  readonly request = signal<AccessRequestDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly saveError = signal<ApiError | null>(null);

  readonly whereForm = new FormGroup(
    {
      accessType: new FormControl<AccessType>('Building', { nonNullable: true }),
      buildingLocationId: new FormControl<number | null>(null, Validators.required),
      locationId: new FormControl<number | null>(null),
    },
    { validators: targetValidator },
  );
  readonly whenForm = new FormGroup(
    {
      durationCode: new FormControl<DurationCode>('OneMonth', { nonNullable: true }),
      validFrom: new FormControl<Date | null>(this.today),
      validTo: new FormControl<Date | null>(null),
      justification: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/\S/), Validators.minLength(10), Validators.maxLength(1000)],
      }),
    },
    { validators: durationValidator },
  );

  private readonly whereValue = toSignal(this.whereForm.valueChanges.pipe(startWith(null), map(() => this.whereForm.getRawValue())), {
    requireSync: true,
  });
  private readonly whenValue = toSignal(this.whenForm.valueChanges.pipe(startWith(null), map(() => this.whenForm.getRawValue())), {
    requireSync: true,
  });
  readonly accessType = computed(() => this.whereValue().accessType);
  readonly durationCode = computed(() => this.whenValue().durationCode);
  readonly accessTypes = ACCESS_TYPES;
  readonly durations = computed(() => (this.lk.lookups()?.durationCodes ?? DURATION_CODES) as DurationCode[]);
  readonly buildings = computed(() => buildingsOf(this.lk.lookups()?.locations));
  readonly targets = computed(() => descendantsOf(this.lk.lookups()?.locations, this.whereValue().buildingLocationId));
  readonly chain = computed(() => stagesFor(this.accessType()));
  readonly chainText = computed(() => this.chain().map(stageLabel).join(' → '));
  readonly buildingName = computed(() => this.buildings().find((b) => b.id === this.whereValue().buildingLocationId)?.name ?? '');
  readonly targetName = computed(() => this.targets().find((t) => t.id === this.whereValue().locationId)?.pathLabel ?? '');
  readonly preview = computed(() => computeValidTo(this.durationCode(), new Date()));

  constructor() {
    this.lk.ensure();
    // Changing the building invalidates the selected wing/floor.
    this.whereForm.controls.buildingLocationId.valueChanges.subscribe((buildingId) => {
      const target = this.whereForm.controls.locationId.value;
      if (target && this.lk.lookups() && !descendantsOf(this.lk.lookups()?.locations, buildingId).some((t) => t.id === target)) {
        this.whereForm.controls.locationId.setValue(null);
      }
    });
    if (this.id) this.loadRequest();
  }

  setType(t: AccessType): void {
    this.whereForm.controls.accessType.setValue(t);
    if (t === 'Building') this.whereForm.controls.locationId.setValue(null);
  }

  loadRequest(): void {
    if (!this.id) return;
    this.loading.set(true);
    this.loadError.set(null);
    this.service.get(this.id).subscribe({
      next: (r) => {
        this.request.set(r);
        const type: AccessType = r.accessType === 'WingFloor' ? 'WingFloor' : 'Building';
        this.whereForm.setValue({
          accessType: type,
          buildingLocationId: r.buildingLocationId ?? (type === 'Building' ? r.locationId : null),
          locationId: type === 'WingFloor' ? r.locationId : null,
        });
        const code = (DURATION_CODES as string[]).includes(r.durationCode ?? '') ? (r.durationCode as DurationCode) : 'Custom';
        this.whenForm.setValue({
          durationCode: code,
          validFrom: r.validFromUtc ? new Date(r.validFromUtc) : this.today,
          validTo: r.validToUtc ? new Date(r.validToUtc) : null,
          justification: r.businessJustification ?? '',
        });
        if (!r.canEdit) {
          this.whereForm.disable();
          this.whenForm.disable();
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

  private body(): CreateAccessRequestBody {
    const w = this.whereForm.getRawValue();
    const v = this.whenForm.getRawValue();
    let validFromUtc: string | undefined;
    let validToUtc: string | undefined;
    if (v.durationCode === 'Custom') {
      const { from, to } = customInstants(v.validFrom, v.validTo);
      validFromUtc = from?.toISOString();
      validToUtc = to?.toISOString();
    }
    return toAccessRequestPayload({
      accessType: w.accessType,
      buildingLocationId: w.buildingLocationId ?? 0,
      locationId: (w.accessType === 'WingFloor' ? w.locationId : w.buildingLocationId) ?? 0,
      durationCode: v.durationCode,
      justification: v.justification.trim(),
      validFromUtc,
      validToUtc,
    });
  }

  save(submit: boolean): void {
    if (!this.id && !this.hasEmployeeProfile()) {
      this.saveError.set({ status: 403, message: 'Your account is not linked to an employee record, so you cannot raise an access request.', errors: [], correlationId: null });
      return;
    }
    this.whereForm.markAllAsTouched();
    this.whenForm.markAllAsTouched();
    if (this.whereForm.invalid || this.whenForm.invalid) {
      this.saveError.set({ status: 400, message: 'Complete the highlighted steps before saving.', errors: [], correlationId: null });
      return;
    }
    const body = this.body();
    let op: Observable<AccessRequestDetail>;
    if (this.id) {
      const update = this.service.update(this.id, { ...body, version: this.request()?.version ?? null });
      op = submit ? update.pipe(switchMap((r) => this.service.submit(r.accessRequestId, r.version))) : update;
    } else {
      op = this.service.create(body);
    }
    this.saving.set(true);
    this.saveError.set(null);
    op.subscribe({
      next: (r) => {
        this.saving.set(false);
        this.notifier.success(submit || !this.id ? `Request ${r.requestNumber} submitted for approval.` : `Changes to ${r.requestNumber} saved.`);
        void this.router.navigate(['/access-requests', r.accessRequestId]);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.saveError.set(asApiError(err));
      },
    });
  }
}
