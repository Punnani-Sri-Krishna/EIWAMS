import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, switchMap } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AccessRequestDetail } from '../access-requests/access-requests.models';
import { ApprovalDecision, PendingApproval, buildDecisionBody, commentsRequired } from './approvals.models';
import { askReason } from './kit/ui.components';

@Injectable({ providedIn: 'root' })
export class ApprovalsService {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);

  pending(query: QueryParams): Observable<PagedResult<PendingApproval>> {
    return this.api.getPaged<PendingApproval>('v1/approvals/pending', query);
  }

  decide(accessRequestId: number, decision: ApprovalDecision, comments: string | null, version: string | null): Observable<AccessRequestDetail> {
    return this.api.post<AccessRequestDetail>(`v1/approvals/${accessRequestId}/decision`, buildDecisionBody(decision, comments, version));
  }

  /** Prompts for comments (required for Return / Reject) and then posts the decision. */
  decideWithPrompt(
    target: { accessRequestId: number; requestNumber: string; employeeName: string | null; locationName: string | null; version: string | null },
    decision: ApprovalDecision,
  ): Observable<AccessRequestDetail> {
    const required = commentsRequired(decision);
    return askReason(this.dialog, {
      title: `${decision} ${target.requestNumber}`,
      message: `${target.employeeName ?? ''} → ${target.locationName ?? ''}`,
      label: required ? 'Comments (required)' : 'Comments (optional)',
      required,
      maxLength: 1000,
      confirmText: decision,
      danger: decision === 'Reject',
    }).pipe(switchMap((r) => this.decide(target.accessRequestId, decision, r.text, target.version)));
  }
}
