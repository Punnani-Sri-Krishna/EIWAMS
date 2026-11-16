import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { MeService, MyProfile } from '../../core/services/me.service';
import { SessionService } from '../../core/services/session.service';
import {
  BLOOD_GROUPS,
  ContactFieldsComponent,
  contactValues,
  createContactForm,
  patchContactForm,
} from '../../shared/components/contact-fields/contact-fields.component';
import { PhotoPickerComponent } from '../../shared/components/photo-picker/photo-picker.component';
import { ProcessedPhoto, toDataUrl } from '../../shared/utils/image-resize';
import { FeatureLookups, Notifier, asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import {
  CARD_REQUEST_TYPES_OFFERED,
  CardRequestType,
  DAMAGED_REASONS,
  REQUEST_TYPE_META,
  damagedReasonLabel,
} from './card-requests.models';
import { CardRequestsService } from './card-requests.service';

/** Reason rules: New optional <= 500; Lost required 5..500; Damaged one of damagedReasons. */
function reasonValidator(group: AbstractControl): ValidationErrors | null {
  const type = group.get('requestType')?.value as CardRequestType | null;
  const reason = ((group.get('reason')?.value as string) ?? '').trim();
  const damaged = group.get('damagedReason')?.value as string;
  if (type === 'Lost' && reason.length < 5) return { lostReason: true };
  if (type === 'Damaged' && !damaged) return { damagedReason: true };
  if (reason.length > 500) return { reasonTooLong: true };
  return null;
}

/** Why a type cannot be requested given the employee's current card (mirrors the API's 409/422 rules). */
export function typeBlockedReason(type: CardRequestType, card: MyProfile['activeCard'] | null | undefined): string | null {
  const status = card?.status ?? null;
  if (type === 'New' && status === 'Active') return 'You already have an active card.';
  if (type === 'Lost' && status !== 'Active' && status !== 'Blocked') return 'You have no active or blocked card to report.';
  if (type === 'Damaged' && status !== 'Active') return 'You have no active card to replace.';
  return null;
}

@Component({
  selector: 'eiw-card-request-new',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatStepperModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatIconModule, MatProgressBarModule, ContactFieldsComponent, PhotoPickerComponent, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .step-body { padding: 8px 0 0; }
    .photo-row { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; }
    .review-photo { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
    .review-photo .kv-grid { flex: 1; min-width: 240px; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Raise ID card request</h1>
          <p class="subtitle">New, lost or damaged card. Requests go through your manager, HR and the ID card team.</p>
        </div>
        <div class="page-actions">
          <a mat-button routerLink="/my-requests"><mat-icon>arrow_back</mat-icon>My requests</a>
        </div>
      </header>

      <div class="data-card">
        @if (loading() || saving()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="loadError()" (retry)="load()" />

        @if (profile(); as p) {
          <mat-stepper linear [orientation]="narrow() ? 'vertical' : 'horizontal'" labelPosition="bottom" #stepper aria-label="Card request steps">
            <!-- 1. Type & reason -->
            <mat-step [stepControl]="typeForm" label="Type & reason">
              <form class="step-body" [formGroup]="typeForm" novalidate>
                <h2 class="section-title"><mat-icon>category</mat-icon>What do you need?</h2>
                <div class="choice-grid" role="radiogroup" aria-label="Request type">
                  @for (t of types(); track t) {
                    <button type="button" class="choice-card" role="radio" [attr.aria-checked]="typeForm.value.requestType === t"
                            [class.selected]="typeForm.value.requestType === t" [disabled]="!!blocked(t)" (click)="selectType(t)">
                      <mat-icon aria-hidden="true">{{ meta[t].icon }}</mat-icon>
                      <span>
                        <strong>{{ meta[t].title }}</strong>
                        <small>{{ blocked(t) ?? meta[t].description }}</small>
                      </span>
                    </button>
                  }
                </div>
                @if (p.activeCard; as c) {
                  <div class="notice"><mat-icon>contactless</mat-icon>
                    <span>Current card <strong>{{ c.maskedUid }}</strong> · <eiw-status [value]="c.status" />
                      @if (c.expiresAtUtc) { · expires {{ c.expiresAtUtc | date: 'mediumDate' }} }</span>
                  </div>
                }
                @switch (typeForm.value.requestType) {
                  @case ('Damaged') {
                    <div class="form-grid">
                      <mat-form-field>
                        <mat-label>Damage reason</mat-label>
                        <mat-select formControlName="damagedReason" required>
                          @for (r of damagedReasons(); track r) {
                            <mat-option [value]="r">{{ reasonLabel(r) }}</mat-option>
                          }
                        </mat-select>
                        <mat-error>Select a reason.</mat-error>
                      </mat-form-field>
                    </div>
                    @if (typeForm.touched && typeForm.hasError('damagedReason')) {
                      <p class="text-danger small" role="alert">Select why the card is damaged.</p>
                    }
                  }
                  @case ('Lost') {
                    <div class="notice warning"><mat-icon>warning</mat-icon>
                      <span>Submitting blocks your current card immediately. A security review is required before a replacement is printed.</span>
                    </div>
                    <mat-form-field class="w-100">
                      <mat-label>What happened?</mat-label>
                      <textarea matInput rows="3" formControlName="reason" maxlength="500" required></textarea>
                      <mat-hint>Where and when the card was lost (5-500 characters).</mat-hint>
                      <mat-hint align="end">{{ typeForm.value.reason?.length ?? 0 }} / 500</mat-hint>
                    </mat-form-field>
                    @if (typeForm.touched && typeForm.hasError('lostReason')) {
                      <p class="text-danger small" role="alert">Describe what happened (at least 5 characters).</p>
                    }
                  }
                  @case ('New') {
                    <mat-form-field class="w-100">
                      <mat-label>Notes (optional)</mat-label>
                      <textarea matInput rows="2" formControlName="reason" maxlength="500"></textarea>
                      <mat-hint align="end">{{ typeForm.value.reason?.length ?? 0 }} / 500</mat-hint>
                    </mat-form-field>
                  }
                }
                @if (typeForm.touched && typeForm.controls.requestType.invalid) {
                  <p class="text-danger small" role="alert">Choose a request type.</p>
                }
                <div class="form-actions">
                  <a mat-button routerLink="/my-requests">Cancel</a>
                  <button mat-flat-button matStepperNext type="button" (click)="typeForm.markAllAsTouched()">Next<mat-icon iconPositionEnd>arrow_forward</mat-icon></button>
                </div>
              </form>
            </mat-step>

            <!-- 2. Details -->
            <mat-step [stepControl]="contact" label="Details">
              <div class="step-body">
                <h2 class="section-title"><mat-icon>badge</mat-icon>Employee details <span class="section-meta">From HR records</span></h2>
                <dl class="kv-grid mb-4">
                  <dt>Name</dt><dd>{{ p.fullName }} <span class="text-muted">({{ p.employeeNumber }})</span></dd>
                  <dt>Designation</dt><dd>{{ p.designation || '—' }}</dd>
                  <dt>Department</dt><dd>{{ p.departmentName || '—' }}</dd>
                  <dt>Manager</dt><dd>{{ p.managerName || '—' }}</dd>
                  <dt>Work email</dt><dd>{{ p.workEmail || '—' }}</dd>
                </dl>
                <h2 class="section-title"><mat-icon>contact_phone</mat-icon>Contact details <span class="section-meta">Saved to your profile on submit</span></h2>
                <app-contact-fields [form]="contact" [required]="true" [bloodGroups]="bloodGroups()" />
                <div class="form-actions">
                  <button mat-button matStepperPrevious type="button"><mat-icon>arrow_back</mat-icon>Back</button>
                  <button mat-flat-button matStepperNext type="button" (click)="contact.markAllAsTouched()">Next<mat-icon iconPositionEnd>arrow_forward</mat-icon></button>
                </div>
              </div>
            </mat-step>

            <!-- 3. Photo -->
            <mat-step [stepControl]="photoCtrl" label="Photo">
              <div class="step-body">
                <h2 class="section-title"><mat-icon>photo_camera_front</mat-icon>Card photo</h2>
                @if (photoRequired()) {
                  <div class="notice warning"><mat-icon>info</mat-icon><span>A photo is required for a new ID card.</span></div>
                } @else {
                  <p class="text-muted small">Your current photo is used unless you choose a new one.</p>
                }
                <app-photo-picker [currentUrl]="currentPhotoUrl()" (photoChange)="onPhoto($event)" alt="Card photo preview" />
                @if (photoCtrl.touched && photoCtrl.invalid) {
                  <p class="text-danger small mt-2" role="alert">Choose a photo to continue.</p>
                }
                <div class="form-actions">
                  <button mat-button matStepperPrevious type="button"><mat-icon>arrow_back</mat-icon>Back</button>
                  <button mat-flat-button matStepperNext type="button" (click)="photoCtrl.markAsTouched()">Next<mat-icon iconPositionEnd>arrow_forward</mat-icon></button>
                </div>
              </div>
            </mat-step>

            <!-- 4. Review -->
            <mat-step label="Review & submit">
              <div class="step-body">
                <h2 class="section-title"><mat-icon>checklist</mat-icon>Review your request</h2>
                <div class="review-photo">
                  @if (reviewPhotoUrl(); as src) {
                    <img class="photo-thumb" [src]="src" alt="Photo to be printed" width="120" height="120" />
                  } @else {
                    <div class="photo-thumb" aria-label="No photo"><mat-icon>person</mat-icon></div>
                  }
                  <dl class="kv-grid">
                    <dt>Request type</dt><dd>{{ meta[typeForm.value.requestType!]?.title }}</dd>
                    @if (reviewReason()) {
                      <dt>Reason</dt><dd class="pre">{{ reviewReason() }}</dd>
                    }
                    <dt>Employee</dt><dd>{{ p.fullName }} ({{ p.employeeNumber }})</dd>
                    <dt>Mobile</dt><dd>{{ contact.value.mobileNumber }}</dd>
                    <dt>Blood group</dt><dd>{{ contact.value.bloodGroup }}</dd>
                    <dt>Address</dt><dd class="pre">{{ contact.value.address }}</dd>
                    <dt>Emergency contact</dt><dd>{{ contact.value.emergencyContactName }} · {{ contact.value.emergencyContactNumber }}</dd>
                    <dt>Photo</dt><dd>{{ photo() ? 'New photo (' + photo()!.width + ' × ' + photo()!.height + ')' : (p.hasPhoto ? 'Existing photo' : 'None') }}</dd>
                  </dl>
                </div>
                <eiw-error-state class="d-block mt-3" [error]="saveError()" [retryable]="false" />
                <div class="form-actions">
                  <button mat-button matStepperPrevious type="button" [disabled]="saving()"><mat-icon>arrow_back</mat-icon>Back</button>
                  <button mat-flat-button type="button" [disabled]="saving()" (click)="submit()"><mat-icon>send</mat-icon>Submit request</button>
                </div>
              </div>
            </mat-step>
          </mat-stepper>
        }
      </div>
    </section>
  `,
})
export class CardRequestNewComponent {
  private readonly me = inject(MeService);
  private readonly service = inject(CardRequestsService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(SessionService);
  private readonly lk = inject(FeatureLookups);

  readonly meta = REQUEST_TYPE_META;
  readonly reasonLabel = damagedReasonLabel;
  readonly narrow = toSignal(inject(BreakpointObserver).observe('(max-width: 767.98px)').pipe(map((s) => s.matches)), { initialValue: false });

  readonly profile = signal<MyProfile | null>(null);
  readonly currentPhotoUrl = signal<string | null>(null);
  readonly photo = signal<ProcessedPhoto | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly saveError = signal<ApiError | null>(null);

  readonly types = computed(() => {
    const offered = this.lk.lookups()?.cardRequestTypesOffered ?? CARD_REQUEST_TYPES_OFFERED;
    return offered.filter((t): t is CardRequestType => t in REQUEST_TYPE_META);
  });
  readonly damagedReasons = computed(() => this.lk.lookups()?.damagedReasons ?? DAMAGED_REASONS);
  readonly bloodGroups = computed(() => this.lk.lookups()?.bloodGroups ?? BLOOD_GROUPS);

  readonly typeForm = new FormGroup(
    {
      requestType: new FormControl<CardRequestType | null>(null, Validators.required),
      reason: new FormControl('', { nonNullable: true }),
      damagedReason: new FormControl('', { nonNullable: true }),
    },
    { validators: reasonValidator },
  );
  readonly contact = createContactForm(true);
  private readonly requestType = toSignal(this.typeForm.controls.requestType.valueChanges, { initialValue: null });
  readonly photoRequired = computed(() => this.requestType() === 'New' && !this.profile()?.hasPhoto);
  /** Valid when a photo is not required or one has been chosen. */
  readonly photoCtrl = new FormControl<ProcessedPhoto | null>(null, (c) =>
    this.photoRequired() && !c.value ? { required: true } : null,
  );
  readonly reviewPhotoUrl = computed(() => this.photo()?.dataUrl ?? this.currentPhotoUrl());
  private readonly reviewSignal = signal(0);
  readonly reviewReason = computed(() => {
    this.reviewSignal();
    const v = this.typeForm.getRawValue();
    return v.requestType === 'Damaged' ? damagedReasonLabel(v.damagedReason) : v.reason.trim();
  });

  constructor() {
    this.lk.ensure();
    this.typeForm.valueChanges.subscribe(() => this.reviewSignal.update((n) => n + 1));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.me.profile().subscribe({
      next: (p) => {
        this.profile.set(p);
        patchContactForm(this.contact, p);
        this.photoCtrl.updateValueAndValidity();
        this.loading.set(false);
        if (p.hasPhoto) {
          this.me.photo().subscribe({ next: (ph) => this.currentPhotoUrl.set(toDataUrl(ph.contentType, ph.photoBase64)), error: () => undefined });
        }
      },
      error: (err: unknown) => {
        const e = asApiError(err);
        this.loadError.set(
          e.status === 404 ? { ...e, message: 'Your account is not linked to an employee record, so you cannot raise an ID card request.' } : e,
        );
        this.loading.set(false);
      },
    });
  }

  blocked(type: CardRequestType): string | null {
    const p = this.profile();
    return p ? typeBlockedReason(type, p.activeCard) : null;
  }

  selectType(type: CardRequestType): void {
    this.typeForm.controls.requestType.setValue(type);
    this.photoCtrl.updateValueAndValidity();
  }

  onPhoto(photo: ProcessedPhoto | null): void {
    this.photo.set(photo);
    this.photoCtrl.setValue(photo);
    this.photoCtrl.markAsTouched();
  }

  submit(): void {
    this.typeForm.markAllAsTouched();
    this.contact.markAllAsTouched();
    this.photoCtrl.updateValueAndValidity();
    if (this.typeForm.invalid || this.contact.invalid || this.photoCtrl.invalid) {
      this.saveError.set({ status: 400, message: 'Complete the highlighted steps before submitting.', errors: [], correlationId: null });
      return;
    }
    const t = this.typeForm.getRawValue();
    const c = contactValues(this.contact);
    const photo = this.photo();
    const reason = t.requestType === 'Damaged' ? t.damagedReason : t.reason.trim() || null;
    this.saving.set(true);
    this.saveError.set(null);
    this.service
      .create({
        requestType: t.requestType!,
        reason,
        mobileNumber: c.mobileNumber ?? '',
        address: c.address ?? '',
        bloodGroup: c.bloodGroup ?? '',
        emergencyContactName: c.emergencyContactName ?? '',
        emergencyContactNumber: c.emergencyContactNumber ?? '',
        photoBase64: photo?.photoBase64 ?? null,
        photoContentType: photo?.photoContentType ?? null,
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          if (photo) this.session.setPhoto(photo.dataUrl);
          this.notifier.success(`Request ${r.requestNumber} submitted.`);
          void this.router.navigate(['/cards/requests', r.cardRequestId]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.saveError.set(asApiError(err));
        },
      });
  }
}
