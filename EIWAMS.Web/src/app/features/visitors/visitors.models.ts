export interface Visitor {
  visitorId: number;
  displayName: string;
  organization: string | null;
  contactReference: string | null;
  visitPurpose: string | null;
  sponsorUserId: number | null;
  sponsorName: string | null;
  isBlacklisted: boolean;
  createdAtUtc: string;
  passCount: number;
}

export interface CreateVisitorBody {
  displayName: string;
  organization: string | null;
  contactReference: string | null;
  visitPurpose: string;
  sponsorUserId: number | null;
}

export interface VisitorPass {
  visitorPassId: number;
  passNumber: string;
  visitorId: number;
  visitorName: string | null;
  organization: string | null;
  locationId: number;
  locationName: string | null;
  sponsorUserId: number | null;
  sponsorName: string | null;
  validFromUtc: string;
  validToUtc: string;
  status: string;
  approvedByName: string | null;
  approvedAtUtc: string | null;
  checkedInAtUtc: string | null;
  checkedOutAtUtc: string | null;
  revokeReason: string | null;
}

export interface CreateVisitorPassBody {
  visitorId: number;
  locationId: number;
  validFromUtc: string;
  validToUtc: string;
  sponsorUserId: number | null;
}

export type PassAction = 'approve' | 'checkIn' | 'checkOut' | 'revoke';

/** Mirrors usp_VisitorPass_Transition: which actions the current user may take on a pass. */
export function passActions(status: string, can: (permission: string) => boolean): PassAction[] {
  const actions: PassAction[] = [];
  if (status === 'PendingApproval' && can('Visitors.Approve')) actions.push('approve');
  if (can('Visitors.Manage')) {
    if (status === 'Approved') actions.push('checkIn');
    if (status === 'Active') actions.push('checkOut');
    if (['PendingApproval', 'Approved', 'Active'].includes(status)) actions.push('revoke');
  }
  return actions;
}
