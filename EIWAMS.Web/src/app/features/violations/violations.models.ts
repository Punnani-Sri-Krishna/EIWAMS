export interface Violation {
  violationId: number;
  accessLogId: number | null;
  employeeId: number | null;
  employeeName: string | null;
  locationId: number | null;
  locationName: string | null;
  violationType: string;
  severity: string;
  status: string;
  detectedAtUtc: string;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAtUtc: string | null;
  incidentId: number | null;
}

export interface ViolationReviewBody {
  status: string;
  reviewNotes: string;
  createIncident: boolean;
}

/**
 * Mirrors dbo.fn_SecurityTransitionAllowed (shared by violations and incidents).
 * Incidents may be re-opened (Closed -> UnderReview); violations may not.
 */
export function nextSecurityStatuses(from: string, allowReopen: boolean): string[] {
  switch (from) {
    case 'Open':
      return ['UnderReview', 'Confirmed', 'FalsePositive'];
    case 'UnderReview':
      return ['Confirmed', 'FalsePositive'];
    case 'Confirmed':
    case 'FalsePositive':
      return ['Closed'];
    case 'Closed':
      return allowReopen ? ['UnderReview'] : [];
    default:
      return [];
  }
}

/** Statuses a reviewer may pick for a violation: the current one (notes-only update) plus allowed transitions. */
export function violationReviewOptions(current: string): string[] {
  const next = nextSecurityStatuses(current, false);
  return current === 'Open' ? next : [current, ...next];
}

export const SEVERITY_ORDER = ['Low', 'Medium', 'High', 'Critical'];
