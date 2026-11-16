import { StageState, StageStep, TimelineEntry } from '../../shared/utils/stage-steps';
import { statusLabel, statusTone } from '../../shared/utils/status-tone';

/** Card request list / queue item (contract §6 `CardRequest`). */
export interface CardRequest {
  cardRequestId: number;
  requestNumber: string;
  requestType: string;
  employeeId: number;
  employeeNumber: string | null;
  employeeName: string | null;
  designation: string | null;
  departmentName: string | null;
  managerName: string | null;
  reason: string | null;
  status: string;
  currentStage: CardRequestStage | null;
  oldCardId: number | null;
  oldMaskedCardUid: string | null;
  newCardId: number | null;
  newMaskedCardUid: string | null;
  requestedByUserId: number | null;
  requestedByName: string | null;
  requestedAtUtc: string;
  updatedAtUtc: string | null;
  closedAtUtc: string | null;
  lastActionByName: string | null;
  lastActionAtUtc: string | null;
  lastComments: string | null;
  hasPhoto: boolean;
  version: string | null;
}

export interface CardRequestHistoryItem {
  historyId: number;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  comments: string | null;
  actorUserId: number | null;
  actorName: string | null;
  createdAtUtc: string;
}

export interface CardRequestDetail extends CardRequest {
  workEmail: string | null;
  locationName: string | null;
  mobileNumber: string | null;
  address: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactNumber: string | null;
  availableActions: string[];
  history: CardRequestHistoryItem[];
}

export type CardRequestType = 'New' | 'Lost' | 'Damaged';
export type CardRequestStage = 'Manager' | 'HR' | 'Security' | 'IdCardTeam';
export type CardRequestAction = 'Approve' | 'Reject' | 'Verify' | 'MarkPrinted' | 'Issue' | 'Cancel';

export interface CreateCardRequestBody {
  employeeId?: number;
  requestType: CardRequestType;
  reason: string | null;
  mobileNumber: string;
  address: string;
  bloodGroup: string;
  emergencyContactName: string;
  emergencyContactNumber: string;
  photoBase64?: string | null;
  photoContentType?: string | null;
}

export interface CardDecisionBody {
  action: CardRequestAction;
  comments: string | null;
  version: string | null;
}

export const CARD_REQUEST_TYPES_OFFERED: CardRequestType[] = ['New', 'Lost', 'Damaged'];
export const DAMAGED_REASONS = ['Scratched', 'Broken', 'RfidNotWorking', 'CardExpired', 'PhotoNotVisible'];
export const CARD_COMMENTS_MAX = 1000;

const DAMAGED_REASON_LABELS: Record<string, string> = {
  Scratched: 'Scratched',
  Broken: 'Broken / cracked',
  RfidNotWorking: 'RFID chip not working',
  CardExpired: 'Card expired',
  PhotoNotVisible: 'Photo not visible',
};

export function damagedReasonLabel(code: string | null | undefined): string {
  return code ? (DAMAGED_REASON_LABELS[code] ?? code) : '';
}

export const REQUEST_TYPE_META: Record<CardRequestType, { title: string; icon: string; description: string }> = {
  New: { title: 'New card', icon: 'badge', description: 'First ID card for an employee without an active card.' },
  Lost: { title: 'Lost card', icon: 'report', description: 'Your current card is blocked immediately and a replacement is printed after a security review.' },
  Damaged: { title: 'Damaged card', icon: 'build', description: 'Replace a card that is physically damaged or no longer reads.' },
};

export const CARD_STAGE_LABELS: Record<CardRequestStage, string> = {
  Manager: 'Manager',
  HR: 'HR',
  Security: 'Security',
  IdCardTeam: 'ID Card Team',
};

export interface ActionMeta {
  label: string;
  icon: string;
  /** Confirm button text / past tense used in toasts. */
  done: string;
  style: 'primary' | 'secondary' | 'danger';
  commentsRequired: boolean;
  confirmMessage?: string;
}

export const CARD_ACTION_META: Record<CardRequestAction, ActionMeta> = {
  Approve: { label: 'Approve', icon: 'check', done: 'approved', style: 'primary', commentsRequired: false },
  Verify: { label: 'Verify', icon: 'fact_check', done: 'verified', style: 'primary', commentsRequired: false },
  MarkPrinted: {
    label: 'Mark printed', icon: 'print', done: 'marked as printed', style: 'primary', commentsRequired: false,
    confirmMessage: 'A new card is generated for the employee and the request moves to Ready to Issue.',
  },
  Issue: {
    label: 'Issue card', icon: 'badge', done: 'issued', style: 'primary', commentsRequired: false,
    confirmMessage: 'The new card becomes Active (valid for 3 years) and the request is closed.',
  },
  Reject: { label: 'Reject', icon: 'close', done: 'rejected', style: 'danger', commentsRequired: true },
  Cancel: { label: 'Cancel request', icon: 'cancel', done: 'cancelled', style: 'secondary', commentsRequired: false },
};

export interface ActionButton {
  action: CardRequestAction;
  meta: ActionMeta;
}

/** Maps `availableActions` (server order preserved) to buttons; unknown strings are ignored. */
export function actionButtons(available: readonly string[] | null | undefined): ActionButton[] {
  return (available ?? [])
    .filter((a): a is CardRequestAction => a in CARD_ACTION_META)
    .map((action) => ({ action, meta: CARD_ACTION_META[action] }));
}

/** Builds the decision body; Reject requires 1..1000 chars of comments after trimming. */
export function buildCardDecisionBody(action: CardRequestAction, comments: string | null | undefined, version: string | null): CardDecisionBody {
  const trimmed = (comments ?? '').trim();
  if (CARD_ACTION_META[action]?.commentsRequired && !trimmed) {
    throw new Error(`Comments are required to ${action.toLowerCase()} a request.`);
  }
  if (trimmed.length > CARD_COMMENTS_MAX) {
    throw new Error(`Comments must be at most ${CARD_COMMENTS_MAX} characters.`);
  }
  return { action, comments: trimmed || null, version };
}

/** Steps of the card request workflow; `status` is the status a request has while it waits at the step. */
interface StepDef {
  key: string;
  label: string;
  status: string | null;
}

const STEPS_BEFORE_SECURITY: StepDef[] = [
  { key: 'Submitted', label: 'Submitted', status: null },
  { key: 'Manager', label: 'Manager', status: 'PendingManager' },
  { key: 'HR', label: 'HR', status: 'PendingHR' },
];
const SECURITY_STEP: StepDef = { key: 'Security', label: 'Security', status: 'PendingSecurity' };
const STEPS_AFTER_SECURITY: StepDef[] = [
  { key: 'IdCardTeam', label: 'ID Card Team', status: 'PendingIdCardTeam' },
  { key: 'Printed', label: 'Printed', status: 'Printing' },
  { key: 'Issued', label: 'Issued', status: 'ReadyToIssue' },
];

export function cardStepDefs(requestType: string): StepDef[] {
  return requestType === 'Lost'
    ? [...STEPS_BEFORE_SECURITY, SECURITY_STEP, ...STEPS_AFTER_SECURITY]
    : [...STEPS_BEFORE_SECURITY, ...STEPS_AFTER_SECURITY];
}

/**
 * Computes the horizontal stepper (contract §5.1) from requestType + status + history.
 * Steps before the current one are done; Rejected / Cancelled mark the step where it stopped.
 */
export function cardRequestSteps(r: Pick<CardRequestDetail, 'requestType' | 'status' | 'history'>): StageStep[] {
  const defs = cardStepDefs(r.requestType);
  const history = [...(r.history ?? [])].sort((a, b) => a.createdAtUtc.localeCompare(b.createdAtUtc) || a.historyId - b.historyId);
  const last = history[history.length - 1];
  let stopIndex: number;
  let stopState: StageState = 'current';

  if (r.status === 'Closed') {
    stopIndex = defs.length; // everything done
  } else if (r.status === 'Rejected' || r.status === 'Cancelled') {
    const from = last && last.toStatus === r.status ? last.fromStatus : null;
    const idx = defs.findIndex((d) => d.status !== null && d.status === from);
    stopIndex = idx >= 0 ? idx : 1;
    stopState = r.status === 'Rejected' ? 'rejected' : 'cancelled';
  } else {
    const idx = defs.findIndex((d) => d.status === r.status);
    stopIndex = idx >= 0 ? idx : 1;
  }

  return defs.map((d, i) => {
    const state: StageState = i < stopIndex ? 'done' : i === stopIndex ? stopState : 'pending';
    let entry: CardRequestHistoryItem | undefined;
    if (d.key === 'Submitted') entry = history.find((h) => h.action === 'Submit') ?? history[0];
    else if (d.key === 'Issued' && state === 'done') entry = history.find((h) => h.toStatus === 'Closed');
    else if (state === 'done') entry = [...history].reverse().find((h) => h.fromStatus === d.status);
    else if (state === 'rejected' || state === 'cancelled') entry = last;
    return {
      key: d.key,
      label: d.label,
      state,
      caption: entry && state !== 'pending' && state !== 'current' ? entry.actorName : null,
      at: entry && state !== 'pending' && state !== 'current' ? entry.createdAtUtc : null,
    };
  });
}

const ACTION_TIMELINE: Record<string, { title: string; icon: string }> = {
  Submit: { title: 'Submitted', icon: 'send' },
  Approve: { title: 'Approved', icon: 'check_circle' },
  Verify: { title: 'Verified by HR', icon: 'fact_check' },
  MarkPrinted: { title: 'Card printed', icon: 'print' },
  Issue: { title: 'Card issued', icon: 'badge' },
  Reject: { title: 'Rejected', icon: 'cancel' },
  Cancel: { title: 'Cancelled', icon: 'block' },
};

/** History rows -> timeline entries (newest last, as returned). */
export function cardHistoryTimeline(history: readonly CardRequestHistoryItem[] | null | undefined): TimelineEntry[] {
  return (history ?? []).map((h) => {
    const meta = ACTION_TIMELINE[h.action] ?? { title: h.action, icon: 'radio_button_checked' };
    const tone = statusTone(h.toStatus, 'card-request');
    return {
      id: h.historyId,
      title: meta.title,
      icon: meta.icon,
      tone: h.action === 'Submit' ? 'info' : tone,
      actor: h.actorName,
      at: h.createdAtUtc,
      detail: h.fromStatus
        ? `${statusLabel(h.fromStatus, 'card-request')} → ${statusLabel(h.toStatus, 'card-request')}`
        : statusLabel(h.toStatus, 'card-request'),
      comments: h.comments,
    };
  });
}

/** Human readable reason (Damaged codes are mapped to labels). */
export function cardReasonText(r: Pick<CardRequest, 'requestType' | 'reason'>): string {
  if (!r.reason) return '';
  return r.requestType === 'Damaged' ? damagedReasonLabel(r.reason) : r.reason;
}
