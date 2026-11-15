import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { ApprovalDecision, DECISION_PAST_TENSE } from '../approvals/approvals.models';
import { ApprovalsService } from '../approvals/approvals.service';
import { Notifier, asApiError, humanize } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS, askReason } from '../approvals/kit/ui.components';
import { PermissionsService } from '../permissions/permissions.service';
import { AccessRequestDetail, buildTimeline } from './access-requests.models';
import { AccessRequestsService } from './access-requests.service';

const STEP_ICON: Record<string, string> = {
  done: 'check_circle',
  current: 'hourglass_top',
  pending: 'radio_button_unchecked',
  returned: 'undo',
  rejected: 'cancel',
  skipped: 'remove_circle_outline',
};
const STEP_TONE: Record<string, string> = {
  done: 'success',
  current: 'warning',
  pending: 'neutral',
  returned: 'warning',
  rejected: 'danger',
  skipped: 'neutral',
};

@Component({
  selector: 'eiw-access-request-detail',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .timeline { list-style: none; padding: 0; margin: 0; }
    .timeline li { display: flex; gap: 0.75rem; padding: 0.75rem 0; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
    .timeline li:last-child { border-bottom: 0; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>
          Access request {{ request()?.requestNumber }}
          @if (request(); as r) {
            <eiw-status [value]="r.status" />
          }
        </h1>
        <div class="page-actions">
          <a mat-button routerLink="/access-requests"><mat-icon>arrow_back</mat-icon>Requests</a>
          @if (request(); as r) {
            @if (r.canEdit && session.hasPermission('AccessRequests.Create')) {
              <a mat-stroked-button [routerLink]="['/access-requests', r.accessRequestId, 'edit']"><mat-icon>edit</mat-icon>Edit</a>
            }
            @if (r.canSubmit && session.hasPermission('AccessRequests.Create')) {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="submit(r)">
                <mat-icon>send</mat-icon>{{ r.status === 'Returned' ? 'Resubmit' : 'Submit' }}
              </button>
            }
            @if (r.canCancel && session.hasPermission('AccessRequests.Create')) {
              <button mat-button type="button" class="danger-action" [disabled]="busy()" (click)="cancel(r)"><mat-icon>cancel</mat-icon>Cancel request</button>
            }
            @if (r.canDecide && session.hasPermission('Approvals.Decide')) {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="decide(r, 'Approve')"><mat-icon>check</mat-icon>Approve</button>
              <button mat-stroked-button type="button" [disabled]="busy()" (click)="decide(r, 'Return')"><mat-icon>undo</mat-icon>Return</button>
              <button mat-stroked-button type="button" class="danger-action" [disabled]="busy()" (click)="decide(r, 'Reject')"><mat-icon>close</mat-icon>Reject</button>
            }
            @if (r.canProvision && session.hasPermission('Permissions.Provision')) {
              <button mat-flat-button type="button" [disabled]="busy()" (click)="provision(r)"><mat-icon>key</mat-icon>Provision access</button>
            }
          }
        </div>
      </header>

      @if (loading() || busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <eiw-error-state [error]="error()" (retry)="load()" />

      @if (request(); as r) {
        <div class="row g-3">
          <div class="col-lg-7">
            <div class="data-card p-3">
              <h2 class="h5">Request</h2>
              <dl class="row mb-0">
                <dt class="col-sm-4">Employee</dt><dd class="col-sm-8">{{ r.employeeName }} ({{ r.employeeNumber }})</dd>
                <dt class="col-sm-4">Location</dt>
                <dd class="col-sm-8">
                  {{ r.locationName }} <span class="text-muted">{{ r.locationCode }}</span>
                  @if (r.isRestricted) {
                    <span class="status-chip tone-danger"><mat-icon aria-hidden="true">lock</mat-icon>Restricted</span>
                  }
                </dd>
                <dt class="col-sm-4">Validity</dt><dd class="col-sm-8">{{ r.validFromUtc | date: 'medium' }} – {{ r.validToUtc | date: 'medium' }}</dd>
                <dt class="col-sm-4">Justification</dt><dd class="col-sm-8" style="white-space: pre-line">{{ r.businessJustification }}</dd>
                <dt class="col-sm-4">Requested by</dt><dd class="col-sm-8">{{ r.requesterName }} on {{ r.createdAtUtc | date: 'medium' }}</dd>
                <dt class="col-sm-4">Submitted</dt><dd class="col-sm-8">{{ r.submittedAtUtc ? (r.submittedAtUtc | date: 'medium') : 'Not submitted' }}</dd>
                @if (r.currentStage) {
                  <dt class="col-sm-4">Waiting on</dt><dd class="col-sm-8">{{ humanize(r.currentStage) }} — {{ r.currentApproverNames }}</dd>
                }
                @if (r.permissionId) {
                  <dt class="col-sm-4">Permission</dt><dd class="col-sm-8"><eiw-status [value]="r.permissionStatus" /> #{{ r.permissionId }}</dd>
                }
              </dl>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="data-card p-3">
              <h2 class="h5">Approval progress</h2>
              <ol class="timeline" aria-label="Approval stages">
                @for (step of timeline(); track step.stage) {
                  <li>
                    <span [class]="'status-chip tone-' + stepTone[step.state]"><mat-icon aria-hidden="true">{{ stepIcon[step.state] }}</mat-icon>{{ humanize(step.stage) }}</span>
                    <div>
                      <div>{{ humanize(step.state === 'done' ? 'Approved' : step.state) }}</div>
                      @if (step.approval?.decidedByName) {
                        <div class="text-muted small">{{ step.approval?.decidedByName }} · {{ step.approval?.decidedAtUtc | date: 'medium' }}</div>
                      } @else if (step.approval?.assignedToNames) {
                        <div class="text-muted small">Assigned to {{ step.approval?.assignedToNames }}</div>
                      }
                      @if (step.approval?.comments) {
                        <div class="small fst-italic">“{{ step.approval?.comments }}”</div>
                      }
                    </div>
                  </li>
                }
              </ol>
              @if (r.approvals.length) {
                <h3 class="h6 mt-3">Full history</h3>
                <ol class="timeline small">
                  @for (a of history(); track a.approvalId) {
                    <li>
                      <eiw-status [value]="a.decision" />
                      <div>
                        <strong>{{ humanize(a.stage) }}</strong>
                        <span class="text-muted"> {{ a.decidedByName ?? a.assignedToNames }}</span>
                        @if (a.decidedAtUtc) {
                          <span class="text-muted"> · {{ a.decidedAtUtc | date: 'medium' }}</span>
                        }
                        @if (a.comments) {
                          <div class="fst-italic">“{{ a.comments }}”</div>
                        }
                      </div>
                    </li>
                  }
                </ol>
              } @else {
                <eiw-empty-state message="No approval activity yet." icon="pending_actions" />
              }
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
  readonly session = inject(SessionService);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly humanize = humanize;
  readonly stepIcon = STEP_ICON;
  readonly stepTone = STEP_TONE;

  readonly request = signal<AccessRequestDetail | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly timeline = computed(() => {
    const r = this.request();
    return r ? buildTimeline(r) : [];
  });
  readonly history = computed(() => [...(this.request()?.approvals ?? [])].sort((a, b) => a.approvalId - b.approvalId));

  constructor() {
    this.load();
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
    this.approvals.decideWithPrompt(r, decision).subscribe({
      next: () => {
        this.notifier.success(`${r.requestNumber} ${DECISION_PAST_TENSE[decision]}.`);
        this.load();
      },
      error: (err: unknown) => this.notifier.error(err),
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
