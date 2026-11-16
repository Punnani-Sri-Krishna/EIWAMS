import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { MeService, PhotoDto } from '../../core/services/me.service';
import { SessionService } from '../../core/services/session.service';
import { HistoryTimelineComponent } from '../../shared/components/history-timeline/history-timeline.component';
import { StageStepperComponent } from '../../shared/components/stage-stepper/stage-stepper.component';
import { toDataUrl } from '../../shared/utils/image-resize';
import { Notifier, asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { CardRequestActionsComponent } from './card-request-actions.component';
import {
  CARD_ACTION_META,
  CARD_STAGE_LABELS,
  CardRequestAction,
  CardRequestDetail,
  REQUEST_TYPE_META,
  CardRequestType,
  cardHistoryTimeline,
  cardReasonText,
  cardRequestSteps,
} from './card-requests.models';
import { CardRequestsService } from './card-requests.service';

const PHOTO_REVIEWER_PERMISSIONS = ['Cards.Process', 'Cards.HrVerify', 'Cards.SecurityReview', 'Cards.ManagerApprove', 'Employees.ViewAll'];

@Component({
  selector: 'eiw-card-request-detail',
  imports: [
    DatePipe, MatButtonModule, MatIconModule, MatProgressBarModule, StageStepperComponent, HistoryTimelineComponent,
    CardRequestActionsComponent, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .summary { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
    .summary .kv-grid { flex: 1; min-width: 260px; }
    .sticky { position: sticky; top: 88px; }
    @media (max-width: 991.98px) { .sticky { position: static; } }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1 class="title">
            ID card request {{ request()?.requestNumber }}
            @if (request(); as r) {
              <eiw-status [value]="r.status" kind="card-request" />
            }
          </h1>
          @if (request(); as r) {
            <p class="subtitle">{{ typeTitle(r.requestType) }} · requested {{ r.requestedAtUtc | date: 'medium' }} by {{ r.requestedByName }}</p>
          }
        </div>
        <div class="page-actions">
          <button mat-button type="button" (click)="back()"><mat-icon>arrow_back</mat-icon>Back</button>
          <button mat-stroked-button type="button" (click)="load()" [disabled]="loading()"><mat-icon>refresh</mat-icon>Refresh</button>
        </div>
      </header>

      @if (loading() || busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <eiw-error-state [error]="error()" (retry)="load()" />

      @if (request(); as r) {
        <div class="data-card">
          <app-stage-stepper [steps]="steps()" label="Card request progress" />
        </div>

        <div class="row g-3">
          <div class="col-lg-8">
            <div class="data-card">
              <h2 class="section-title"><mat-icon>badge</mat-icon>Request details</h2>
              <div class="summary">
                @if (photoUrl(); as src) {
                  <img class="photo-thumb" [src]="src" [alt]="'Photo of ' + r.employeeName" width="120" height="120" />
                } @else {
                  <div class="photo-thumb" role="img" aria-label="No photo available"><mat-icon>person</mat-icon></div>
                }
                <dl class="kv-grid">
                  <dt>Employee</dt><dd>{{ r.employeeName }} <span class="text-muted">({{ r.employeeNumber }})</span></dd>
                  <dt>Designation</dt><dd>{{ r.designation || '—' }}</dd>
                  <dt>Department</dt><dd>{{ r.departmentName || '—' }}</dd>
                  <dt>Manager</dt><dd>{{ r.managerName || '—' }}</dd>
                  <dt>Location</dt><dd>{{ r.locationName || '—' }}</dd>
                  <dt>Work email</dt><dd>{{ r.workEmail || '—' }}</dd>
                  <dt>Request type</dt><dd>{{ typeTitle(r.requestType) }}</dd>
                  @if (reason()) {
                    <dt>Reason</dt><dd class="pre">{{ reason() }}</dd>
                  }
                  @if (r.oldMaskedCardUid) {
                    <dt>Previous card</dt><dd><code>{{ r.oldMaskedCardUid }}</code></dd>
                  }
                  @if (r.newMaskedCardUid) {
                    <dt>New card</dt><dd><code>{{ r.newMaskedCardUid }}</code></dd>
                  }
                  @if (r.currentStage) {
                    <dt>Waiting on</dt><dd>{{ stageLabel(r.currentStage) }}</dd>
                  }
                  @if (r.closedAtUtc) {
                    <dt>Closed</dt><dd>{{ r.closedAtUtc | date: 'medium' }}</dd>
                  }
                </dl>
              </div>
            </div>
            <div class="data-card">
              <h2 class="section-title"><mat-icon>contact_phone</mat-icon>Contact details <span class="section-meta">Snapshot at submission</span></h2>
              <dl class="kv-grid">
                <dt>Mobile</dt><dd>{{ r.mobileNumber || '—' }}</dd>
                <dt>Blood group</dt><dd>{{ r.bloodGroup || '—' }}</dd>
                <dt>Address</dt><dd class="pre">{{ r.address || '—' }}</dd>
                <dt>Emergency contact</dt>
                <dd>{{ r.emergencyContactName || '—' }}@if (r.emergencyContactNumber) { · {{ r.emergencyContactNumber }} }</dd>
              </dl>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="sticky">
              <div class="data-card">
                <h2 class="section-title"><mat-icon>bolt</mat-icon>Actions</h2>
                <eiw-card-request-actions [actions]="r.availableActions" [busy]="busy()" (act)="act(r, $event)" />
              </div>
              <div class="data-card">
                <h2 class="section-title"><mat-icon>history</mat-icon>History</h2>
                <app-history-timeline [entries]="timeline()" label="Card request history" />
              </div>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class CardRequestDetailComponent {
  private readonly service = inject(CardRequestsService);
  private readonly me = inject(MeService);
  private readonly notifier = inject(Notifier);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly request = signal<CardRequestDetail | null>(null);
  readonly photoUrl = signal<string | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly steps = computed(() => {
    const r = this.request();
    return r ? cardRequestSteps(r) : [];
  });
  readonly timeline = computed(() => cardHistoryTimeline(this.request()?.history));
  readonly reason = computed(() => {
    const r = this.request();
    return r ? cardReasonText(r) : '';
  });
  private photoFor: number | null = null;

  constructor() {
    this.load();
  }

  typeTitle(type: string): string {
    return REQUEST_TYPE_META[type as CardRequestType]?.title ?? `${type} card`;
  }

  stageLabel(stage: string): string {
    return CARD_STAGE_LABELS[stage as keyof typeof CARD_STAGE_LABELS] ?? stage;
  }

  back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/my-requests']);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get(this.id).subscribe({
      next: (r) => {
        this.request.set(r);
        this.loading.set(false);
        this.loadPhoto(r);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  act(r: CardRequestDetail, action: CardRequestAction): void {
    this.busy.set(true);
    this.service.decideWithPrompt(r, action).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.notifier.success(`${r.requestNumber} ${CARD_ACTION_META[action].done}.`);
        if (updated && updated.cardRequestId) this.request.set(updated);
        else this.load();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifier.error(err);
        this.load();
      },
      complete: () => this.busy.set(false),
    });
  }

  /** Own request -> v1/me/photo; reviewers -> v1/employees/{id}/photo. Missing photos fall back to a placeholder. */
  private loadPhoto(r: CardRequestDetail): void {
    if (this.photoFor === r.employeeId) return;
    this.photoFor = r.employeeId;
    const own = this.session.user()?.employeeId === r.employeeId;
    let source: Observable<PhotoDto> | null = null;
    if (own) source = this.session.user()?.hasPhoto || r.hasPhoto ? this.me.photo() : null;
    else if (r.hasPhoto && this.session.hasAny(PHOTO_REVIEWER_PERMISSIONS)) source = this.me.employeePhoto(r.employeeId);
    if (!source) {
      this.photoUrl.set(null);
      return;
    }
    source.subscribe({
      next: (p) => this.photoUrl.set(toDataUrl(p.contentType, p.photoBase64)),
      error: () => this.photoUrl.set(null),
    });
  }
}
