export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<string, StatusTone> = {
  active: 'success',
  approved: 'success',
  provisioned: 'success',
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
  submitted: 'info',
  requested: 'info',
  pendingapproval: 'warning',
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

const ICONS: Record<StatusTone, string> = {
  success: 'check_circle',
  warning: 'schedule',
  danger: 'error',
  info: 'info',
  neutral: 'radio_button_unchecked',
};

/** Maps a workflow status or severity to a colour tone (always shown with an icon and text). */
export function statusTone(status: string | null | undefined): StatusTone {
  return TONES[(status ?? '').replace(/[\s_-]/g, '').toLowerCase()] ?? 'neutral';
}

export function statusIcon(status: string | null | undefined): string {
  return ICONS[statusTone(status)];
}
