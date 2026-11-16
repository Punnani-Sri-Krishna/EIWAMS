export interface PendingApproval {
  accessRequestId: number;
  requestNumber: string;
  employeeName: string | null;
  employeeNumber: string | null;
  accessType: string | null;
  buildingLocationName: string | null;
  locationName: string | null;
  isRestricted: boolean;
  durationCode: string | null;
  stage: string;
  businessJustification: string | null;
  validFromUtc: string;
  validToUtc: string;
  submittedAtUtc: string | null;
  ageHours: number;
  version: string | null;
}

/** `TeamRequestItem` (v1/approvals/team). */
export interface TeamRequestItem {
  requestKind: 'Card' | 'Access';
  requestId: number;
  requestNumber: string;
  requestType: string;
  employeeId: number;
  employeeName: string | null;
  employeeNumber: string | null;
  status: string;
  currentStage: string | null;
  submittedAtUtc: string | null;
  route: string;
}

export type ApprovalDecision = 'Approve' | 'Return' | 'Reject';

export interface ApprovalDecisionBody {
  decision: ApprovalDecision;
  comments: string | null;
  version: string | null;
  provisionNow?: boolean;
}

/** Return and Reject require comments (API validation rule). */
export function commentsRequired(decision: ApprovalDecision): boolean {
  return decision === 'Return' || decision === 'Reject';
}

export function buildDecisionBody(
  decision: ApprovalDecision,
  comments: string | null | undefined,
  version: string | null,
  provisionNow = false,
): ApprovalDecisionBody {
  const trimmed = (comments ?? '').trim();
  if (commentsRequired(decision) && !trimmed) {
    throw new Error(`Comments are required to ${decision.toLowerCase()} a request.`);
  }
  const body: ApprovalDecisionBody = { decision, comments: trimmed || null, version };
  if (provisionNow && decision === 'Approve') body.provisionNow = true;
  return body;
}

/** `provisionNow` is offered only when approving at the AccessControl stage with Permissions.Provision. */
export function canOfferProvisionNow(stage: string | null | undefined, decision: ApprovalDecision, hasProvision: boolean): boolean {
  return decision === 'Approve' && stage === 'AccessControl' && hasProvision;
}

export const DECISION_PAST_TENSE: Record<ApprovalDecision, string> = {
  Approve: 'approved',
  Return: 'returned to the requester',
  Reject: 'rejected',
};
