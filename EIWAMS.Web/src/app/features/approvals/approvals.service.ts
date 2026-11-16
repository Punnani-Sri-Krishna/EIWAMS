import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, switchMap } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { SessionService } from '../../core/services/session.service';
import { AccessRequestDetail, stageLabel } from '../access-requests/access-requests.models';
import {
  ApprovalDecision,
  PendingApproval,
  TeamRequestItem,
  buildDecisionBody,
  canOfferProvisionNow,
  commentsRequired,
} from './approvals.models';
import { askReason } from './kit/ui.components';

export interface DecisionTarget {
  accessRequestId: number;
  requestNumber: string;
  employeeName: string | null;
  locationName: string | null;
  version: string | null;
  /** Stage being decided (PendingApproval.stage or AccessRequestDetail.currentStage). */
  stage?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApprovalsService {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);
  private readonly session = inject(SessionService);

  pending(query: QueryParams): Observable<PagedResult<PendingApproval>> {
    return this.api.getPaged<PendingApproval>('v1/approvals/pending', query);
  }

  team(query: QueryParams): Observable<PagedResult<TeamRequestItem>> {
    return this.api.getPaged<TeamRequestItem>('v1/approvals/team', query);
  }

  decide(
    accessRequestId: number,
    decision: ApprovalDecision,
    comments: string | null,
    version: string | null,
    provisionNow = false,
  ): Observable<AccessRequestDetail> {
    return this.api.post<AccessRequestDetail>(
      `v1/approvals/${accessRequestId}/decision`,
      buildDecisionBody(decision, comments, version, provisionNow),
    );
  }

  /** Prompts for comments (required for Return / Reject; optional "Provision now" at AccessControl) then posts. */
  decideWithPrompt(target: DecisionTarget, decision: ApprovalDecision): Observable<AccessRequestDetail> {
    const required = commentsRequired(decision);
    const offerProvision = canOfferProvisionNow(target.stage, decision, this.session.hasPermission('Permissions.Provision'));
    const stage = target.stage ? ` · ${stageLabel(target.stage)} stage` : '';
    return askReason(this.dialog, {
      title: `${decision} ${target.requestNumber}`,
      message: `${target.employeeName ?? ''} → ${target.locationName ?? ''}${stage}`,
      label: required ? 'Comments (required)' : 'Comments (optional)',
      required,
      maxLength: 1000,
      confirmText: decision,
      danger: decision === 'Reject',
      checkbox: offerProvision
        ? { label: 'Provision now', hint: 'Approve and create the access permission in one step.', value: true }
        : undefined,
    }).pipe(switchMap((r) => this.decide(target.accessRequestId, decision, r.text, target.version, offerProvision && !!r.checked)));
  }
}
