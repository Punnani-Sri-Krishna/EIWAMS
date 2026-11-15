export interface AccessRequest {
  accessRequestId: number;
  requestNumber: string;
  employeeId: number;
  employeeName: string | null;
  employeeNumber: string | null;
  locationId: number;
  locationName: string | null;
  locationCode: string | null;
  isRestricted: boolean;
  requesterUserId: number;
  requesterName: string | null;
  businessJustification: string;
  validFromUtc: string;
  validToUtc: string;
  status: string;
  currentStage: string | null;
  currentApproverNames: string | null;
  submittedAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  version: string | null;
}

export interface Approval {
  approvalId: number;
  stage: string;
  stageOrder: number;
  assignedToNames: string | null;
  decidedByName: string | null;
  decision: string;
  comments: string | null;
  decidedAtUtc: string | null;
}

export interface AccessRequestDetail extends AccessRequest {
  approvals: Approval[];
  permissionId: number | null;
  permissionStatus: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canDecide: boolean;
  canProvision: boolean;
}

export interface CreateAccessRequestBody {
  employeeId: number;
  locationId: number;
  businessJustification: string;
  validFromUtc: string;
  validToUtc: string;
  submit: boolean;
}

export interface UpdateAccessRequestBody {
  locationId: number;
  businessJustification: string;
  validFromUtc: string;
  validToUtc: string;
  version: string | null;
}

/** Fixed approval chain; FacilityAdmin applies to restricted locations only. */
export const APPROVAL_STAGES = ['Manager', 'Security', 'FacilityAdmin'];

export interface TimelineStep {
  stage: string;
  state: 'done' | 'current' | 'pending' | 'returned' | 'rejected' | 'skipped';
  approval: Approval | null;
}

/**
 * Builds one step per stage (latest decision per stage wins) so the detail page can show
 * where the request is in the Manager -> Security -> FacilityAdmin chain.
 */
export function buildTimeline(request: Pick<AccessRequestDetail, 'approvals' | 'currentStage' | 'isRestricted' | 'status'>): TimelineStep[] {
  const stages = request.isRestricted ? APPROVAL_STAGES : APPROVAL_STAGES.filter((s) => s !== 'FacilityAdmin');
  return stages.map((stage) => {
    const forStage = (request.approvals ?? []).filter((a) => a.stage === stage).sort((a, b) => b.approvalId - a.approvalId);
    const latest = forStage[0] ?? null;
    let state: TimelineStep['state'] = 'pending';
    const decision = (latest?.decision ?? '').toLowerCase();
    if (decision === 'approved' || decision === 'approve') state = 'done';
    else if (decision === 'returned' || decision === 'return') state = 'returned';
    else if (decision === 'rejected' || decision === 'reject') state = 'rejected';
    else if (decision === 'skipped') state = 'skipped';
    else if (request.currentStage === stage && ['Submitted', 'PendingApproval'].includes(request.status)) state = 'current';
    return { stage, state, approval: latest };
  });
}
