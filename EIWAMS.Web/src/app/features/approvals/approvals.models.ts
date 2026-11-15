export interface PendingApproval {
  accessRequestId: number;
  requestNumber: string;
  employeeName: string | null;
  employeeNumber: string | null;
  locationName: string | null;
  isRestricted: boolean;
  stage: string;
  businessJustification: string | null;
  validFromUtc: string;
  validToUtc: string;
  submittedAtUtc: string | null;
  ageHours: number;
  version: string | null;
}

export type ApprovalDecision = 'Approve' | 'Return' | 'Reject';

export interface ApprovalDecisionBody {
  decision: ApprovalDecision;
  comments: string | null;
  version: string | null;
}

/** Return and Reject require comments (API validation rule). */
export function commentsRequired(decision: ApprovalDecision): boolean {
  return decision === 'Return' || decision === 'Reject';
}

export function buildDecisionBody(decision: ApprovalDecision, comments: string | null | undefined, version: string | null): ApprovalDecisionBody {
  const trimmed = (comments ?? '').trim();
  if (commentsRequired(decision) && !trimmed) {
    throw new Error(`Comments are required to ${decision.toLowerCase()} a request.`);
  }
  return { decision, comments: trimmed || null, version };
}

export const DECISION_PAST_TENSE: Record<ApprovalDecision, string> = {
  Approve: 'approved',
  Return: 'returned to the requester',
  Reject: 'rejected',
};
