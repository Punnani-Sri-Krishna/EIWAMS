import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { HistoryTimelineComponent } from '../../shared/components/history-timeline/history-timeline.component';
import { StageStepperComponent } from '../../shared/components/stage-stepper/stage-stepper.component';
import { ApprovalDecision, DECISION_PAST_TENSE } from '../approvals/approvals.models';
import { ApprovalsService } from '../approvals/approvals.service';
import { Notifier, asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS, askReason } from '../approvals/kit/ui.components';
import { PermissionsService } from '../permissions/permissions.service';
import { AccessRequestDetail, accessRequestSteps, accessTimeline, accessTypeLabel, durationLabel, stageLabel } from './access-requests.models';
import { AccessRequestsService } from './access-requests.service';

@Component({
  selector: 'eiw-access-request-detail',
  imports: [
    DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, StageStepperComponent, HistoryTimelineComponent, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .title { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .sticky { position: sticky; top: 88px; }
    .action-stack { display: flex; flex-direction: column; gap: 8px; }
    .action-stack > * { width: 100%; justify-content: flex-start; }
    @media (max-width: 991.98px) { .sticky { position: static; } }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1 class="title">
            Access request {{ request()?.requestNumber }}
            @if (request(); as r) {
              <eiw-status [value]="r.status" kind="access-request" />
            }
          </h1>
          @if (request(); as r) {
            <p class="subtitle">{{ accessTypeLabel(r.accessType) }} · created {{ r.createdAtUtc | date: 'medium' }} by {{ r.requesterName }}</p>
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
          <app-stage-stepper [steps]="steps()" label="Access request progress" />
        </div>

        <div class="row g-3">
          <div class="col-lg-8">
            <div class="data-card">
              <h2 class="section-title"><mat-icon>vpn_key</mat-icon>Request details</h2>
              <dl class="kv-grid">
                <dt>Employee</dt><dd>{{ r.employeeName }} <span class="text-muted">({{ r.employeeNumber }})</span></dd>
                <dt>Access type</dt><dd>{{ accessTypeLabel(r.accessType) }}</dd>
                <dt>Building</dt><dd>{{ r.buildingLocationName || r.locationName || '—' }}</dd>
                @if (r.accessType === 'WingFloor') {
                  <dt>Wing / floor</dt>
                  <dd>
                    {{ r.locationName }} <span class="text-muted">{{ r.locationCode }}</span>
                    @if (r.isRestricted) {
                      <span class="status-chip tone-danger ms-1"><mat-icon aria-hidden="true">lock</mat-icon>Restricted</span>
                    }
                  </dd>
                } @else if (r.isRestricted) {
                  <dt>Restriction</dt><dd><span class="status-chip tone-danger"><mat-icon aria-hidden="true">lock</mat-icon>Restricted</span></dd>
                }
                <dt>Duration</dt><dd>{{ durationLabel(r.durationCode) || '—' }}</dd>
                <dt>Valid</dt>
                <dd>{{ r.validFromUtc | date: 'medium' }} – {{ r.durationCode === 'Permanent' ? 'Permanent' : (r.validToUtc | date: 'medium') }}</dd>
                <dt>Justification</dt><dd class="pre">{{ r.businessJustification }}</dd>
                <dt>Submitted</dt><dd>{{ r.submittedAtUtc ? (r.submittedAtUtc | date: 'medium') : 'Not submitted' }}</dd>
                @if (r.currentStage) {
                  <dt>Waiting on</dt><dd>{{ stageLabel(r.currentStage) }}@if (r.currentApproverNames) { · {{ r.currentApproverNames }} }</dd>
                }
                @if (r.permissionId) {
                  <dt>Permission</dt><dd><eiw-status [value]="r.permissionStatus" /> <span class="text-muted">#{{ r.permissionId }}</span></dd>
                }
              </dl>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="sticky">
              <div class="data-card">
                <h2 class="section-title"><mat-icon>bolt</mat-icon>Actions</h2>
                @if (hasActions(r)) {
                  <div class="action-stack">
                    @if (r.canDecide && canDecide) {
                      <button mat-flat-button type="button" data-action="Approve" [disabled]="busy()" (click)="decide(r, 'Approve')"><mat-icon>check</mat-icon>Approve</button>
                      <button mat-stroked-button type="button" data-action="Return" [disabled]="busy()" (click)="decide(r, 'Return')"><mat-icon>undo</mat-icon>Return for changes</button>
                      <button mat-stroked-button type="button" data-action="Reject" class="danger-action" [disabled]="busy()" (click)="decide(r, 'Reject')"><mat-icon>close</mat-icon>Reject</button>
                    }
                    @if (r.canProvision && canProvision) {
                      <button mat-flat-button type="button" data-action="Provision" [disabled]="busy()" (click)="provision(r)"><mat-icon>key</mat-icon>Provision access</button>
                    }
                    @if (r.canEdit && canCreate) {
                      <a mat-stroked-button data-action="Edit" [routerLink]="['/access-requests', r.accessRequestId, 'edit']"><mat-icon>edit</mat-icon>Edit request</a>
                    }
                    @if (r.canSubmit && canCreate) {
                      <button mat-flat-button type="button" data-action="Submit" [disabled]="busy()" (click)="submit(r)">
                        <mat-icon>send</mat-icon>{{ r.status === 'Returned' ? 'Resubmit' : 'Submit' }}
                      </button>
                    }
                    @if (r.canCancel && canCreate) {
                      <button mat-button type="button" data-action="Cancel" class="danger-action" [disabled]="busy()" (click)="cancel(r)"><mat-icon>cancel</mat-icon>Cancel request</button>
                    }
                  </div>
                } @else {
                  <p class="text-muted mb-0">No actions are available to you at this stage.</p>
                }
              </div>
              <div class="data-card">
                <h2 class="section-title"><mat-icon>history</mat-icon>History</h2>
                <app-history-timeline [entries]="timeline()" label="Access request history" emptyText="No approval activity yet." />
              </div>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class AccessRequestDetailComponent {
  private readonly service = inject(AccessRequestsService);
  private readonly approvals = inject(ApprovalsService);
  private readonly permissions = inject(PermissionsService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly accessTypeLabel = accessTypeLabel;
  readonly durationLabel = durationLabel;
  readonly stageLabel = stageLabel;
  readonly canDecide = this.session.hasPermission('Approvals.Decide');
  readonly canProvision = this.session.hasPermission('Permissions.Provision');
  readonly canCreate = this.session.hasPermission('AccessRequests.Create');

  readonly request = signal<AccessRequestDetail | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly steps = computed(() => {
    const r = this.request();
    return r ? accessRequestSteps(r) : [];
  });
  readonly timeline = computed(() => {
    const r = this.request();
    return r ? accessTimeline(r) : [];
  });

  constructor() {
    this.load();
  }

  hasActions(r: AccessRequestDetail): boolean {
    return (r.canDecide && this.canDecide) || (r.canProvision && this.canProvision) || ((r.canEdit || r.canSubmit || r.canCancel) && this.canCreate);
  }

  back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/my-requests'], { queryParams: { tab: 'access' } });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get(this.id).subscribe({
      next: (r) => {
        this.request.set(r);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  submit(r: AccessRequestDetail): void {
    this.run(this.service.submit(r.accessRequestId, r.version), r.status === 'Returned' ? 'Request resubmitted.' : 'Request submitted for approval.');
  }

  cancel(r: AccessRequestDetail): void {
    askReason(this.dialog, { title: `Cancel ${r.requestNumber}`, label: 'Reason', required: true, maxLength: 500, confirmText: 'Cancel request', danger: true })
      .subscribe((res) => this.run(this.service.cancel(r.accessRequestId, res.text, r.version), 'Request cancelled.'));
  }

  decide(r: AccessRequestDetail, decision: ApprovalDecision): void {
    this.approvals.decideWithPrompt({ ...r, stage: r.currentStage }, decision).subscribe({
      next: () => {
        this.notifier.success(`${r.requestNumber} ${DECISION_PAST_TENSE[decision]}.`);
        this.load();
      },
      error: (err: unknown) => {
        this.notifier.error(err);
        this.load();
      },
    });
  }

  provision(r: AccessRequestDetail): void {
    this.run(this.permissions.provision(r.accessRequestId), 'Access permission provisioned.');
  }

  private run(op: Observable<unknown>, message: string): void {
    this.busy.set(true);
    op.subscribe({
      next: () => {
        this.busy.set(false);
        this.notifier.success(message);
        this.load();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.notifier.error(err);
      },
    });
  }
}
