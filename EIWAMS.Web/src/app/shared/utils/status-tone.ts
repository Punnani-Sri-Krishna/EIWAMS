export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/**
 * Status vocabulary a chip belongs to. The same string can mean different things in
 * different workflows (e.g. `Closed` = "Issued" for card requests, `Approved` = info for
 * access requests because provisioning is still outstanding).
 */
export type StatusKind = 'generic' | 'card-request' | 'access-request';

interface StatusPresentation {
  label: string;
  tone: StatusTone;
  icon: string;
}

const TONES: Record<string, StatusTone> = {
  active: 'success',
  approved: 'success',
  provisioned: 'success',
  completed: 'success',
  granted: 'success',
  issued: 'success',
  synced: 'success',
  closed: 'neutral',
  checkedout: 'neutral',
  confirmed: 'danger',
  falsepositive: 'neutral',
  draft: 'neutral',
  cancelled: 'neutral',
  expired: 'neutral',
  inactive: 'neutral',
  deactivated: 'neutral',
  skipped: 'neutral',
  submitted: 'info',
  requested: 'info',
  printing: 'info',
  readytoissue: 'info',
  pendingapproval: 'warning',
  pendingmanager: 'warning',
  pendinghr: 'warning',
  pendingsecurity: 'warning',
  pendingidcardteam: 'warning',
  verificationpending: 'warning',
  pending: 'warning',
  underreview: 'warning',
  review: 'warning',
  open: 'warning',
  returned: 'warning',
  suspended: 'warning',
  onleave: 'warning',
  medium: 'warning',
  low: 'info',
  rejected: 'danger',
  denied: 'danger',
  lost: 'danger',
  blocked: 'danger',
  damaged: 'danger',
  revoked: 'danger',
  exited: 'danger',
  high: 'danger',
  critical: 'danger',
};

/** Card request statuses (contract §5.1). */
const CARD_REQUEST: Record<string, StatusPresentation> = {
  PendingManager: { label: 'Pending Manager', tone: 'warning', icon: 'supervisor_account' },
  PendingHR: { label: 'HR Verification', tone: 'warning', icon: 'fact_check' },
  PendingSecurity: { label: 'Security Review', tone: 'warning', icon: 'shield' },
  PendingIdCardTeam: { label: 'ID Card Team', tone: 'warning', icon: 'badge' },
  Printing: { label: 'Printing', tone: 'info', icon: 'print' },
  ReadyToIssue: { label: 'Ready to Issue', tone: 'info', icon: 'inventory' },
  Closed: { label: 'Issued', tone: 'success', icon: 'verified' },
  Rejected: { label: 'Rejected', tone: 'danger', icon: 'cancel' },
  Cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'block' },
};

/** Access request statuses (contract §5.3 / §7). */
const ACCESS_REQUEST: Record<string, StatusPresentation> = {
  Draft: { label: 'Draft', tone: 'neutral', icon: 'edit_note' },
  Submitted: { label: 'Submitted', tone: 'warning', icon: 'schedule' },
  PendingApproval: { label: 'Pending Approval', tone: 'warning', icon: 'schedule' },
  Returned: { label: 'Returned', tone: 'warning', icon: 'undo' },
  Approved: { label: 'Approved', tone: 'info', icon: 'task_alt' },
  Provisioned: { label: 'Completed', tone: 'success', icon: 'verified' },
  Rejected: { label: 'Rejected', tone: 'danger', icon: 'cancel' },
  Cancelled: { label: 'Cancelled', tone: 'neutral', icon: 'block' },
  Expired: { label: 'Expired', tone: 'neutral', icon: 'event_busy' },
};

const ICONS: Record<StatusTone, string> = {
  success: 'check_circle',
  warning: 'schedule',
  danger: 'error',
  info: 'info',
  neutral: 'radio_button_unchecked',
};

function normalise(status: string | null | undefined): string {
  return (status ?? '').replace(/[\s_-]/g, '').toLowerCase();
}

/** "PendingApproval" -> "Pending Approval". */
export function humanizeStatus(value: string | null | undefined): string {
  return (value ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
}

function kindMap(kind: StatusKind): Record<string, StatusPresentation> | null {
  return kind === 'card-request' ? CARD_REQUEST : kind === 'access-request' ? ACCESS_REQUEST : null;
}

/** Maps a workflow status or severity to a colour tone (always shown with an icon and text). */
export function statusTone(status: string | null | undefined, kind: StatusKind = 'generic'): StatusTone {
  return kindMap(kind)?.[status ?? '']?.tone ?? TONES[normalise(status)] ?? 'neutral';
}

export function statusIcon(status: string | null | undefined, kind: StatusKind = 'generic'): string {
  return kindMap(kind)?.[status ?? '']?.icon ?? ICONS[statusTone(status, kind)];
}

/** UI label for a status (e.g. card request `Closed` -> "Issued", access `Provisioned` -> "Completed"). */
export function statusLabel(status: string | null | undefined, kind: StatusKind = 'generic'): string {
  return kindMap(kind)?.[status ?? '']?.label ?? humanizeStatus(status);
}
