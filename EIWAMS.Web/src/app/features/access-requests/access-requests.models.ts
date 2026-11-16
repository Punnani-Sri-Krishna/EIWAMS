import { Lookups } from '../../core/models/api.models';
import { StageState, StageStep, TimelineEntry } from '../../shared/utils/stage-steps';

export type AccessType = 'Building' | 'WingFloor';
export type DurationCode = 'OneWeek' | 'OneMonth' | 'ThreeMonths' | 'SixMonths' | 'OneYear' | 'Permanent' | 'Custom';
export type ApprovalStage = 'Manager' | 'SecurityHead' | 'Security' | 'AccessControl';

export interface AccessRequest {
  accessRequestId: number;
  requestNumber: string;
  employeeId: number;
  employeeName: string | null;
  employeeNumber: string | null;
  accessType: AccessType | string;
  buildingLocationId: number | null;
  buildingLocationName: string | null;
  locationId: number;
  locationName: string | null;
  locationCode: string | null;
  isRestricted: boolean;
  durationCode: DurationCode | string | null;
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

/** `CreateAccessRequestRequest` (contract §6). */
export interface CreateAccessRequestBody {
  employeeId?: number;
  accessType: AccessType;
  buildingLocationId: number;
  locationId: number;
  durationCode: DurationCode;
  validFromUtc?: string;
  validToUtc?: string;
  justification: string;
}

export interface AccessRequestPayloadValues {
  accessType: AccessType;
  buildingLocationId: number;
  locationId: number;
  durationCode: DurationCode;
  justification: string;
  validFromUtc?: string;
  validToUtc?: string;
}

/** Builds the exact create/update wire shape; date overrides are sent only for Custom duration. */
export function toAccessRequestPayload(values: AccessRequestPayloadValues): CreateAccessRequestBody {
  const body: CreateAccessRequestBody = {
    accessType: values.accessType,
    buildingLocationId: values.buildingLocationId,
    locationId: values.locationId,
    durationCode: values.durationCode,
    justification: values.justification.trim(),
  };
  if (values.durationCode === 'Custom') {
    if (values.validFromUtc) body.validFromUtc = values.validFromUtc;
    if (values.validToUtc) body.validToUtc = values.validToUtc;
  }
  return body;
}

/** PUT body: create body without employeeId, plus version (Draft/Returned only). */
export type UpdateAccessRequestBody = Omit<CreateAccessRequestBody, 'employeeId'> & { version: string | null };

export const ACCESS_TYPES: AccessType[] = ['Building', 'WingFloor'];
export const DURATION_CODES: DurationCode[] = ['OneWeek', 'OneMonth', 'ThreeMonths', 'SixMonths', 'OneYear', 'Permanent', 'Custom'];

export const ACCESS_TYPE_META: Record<AccessType, { title: string; icon: string; description: string }> = {
  Building: { title: 'Whole building', icon: 'apartment', description: 'Access to a building. Approved by your manager, the Security Head and Access Control.' },
  WingFloor: { title: 'Wing / floor', icon: 'meeting_room', description: 'Access to a specific wing, floor or zone. Approved by your manager, Security and Access Control.' },
};

export const DURATION_LABELS: Record<DurationCode, string> = {
  OneWeek: '1 week',
  OneMonth: '1 month',
  ThreeMonths: '3 months',
  SixMonths: '6 months',
  OneYear: '1 year',
  Permanent: 'Permanent',
  Custom: 'Custom dates',
};

export function durationLabel(code: string | null | undefined): string {
  return code ? (DURATION_LABELS[code as DurationCode] ?? code) : '';
}

export function accessTypeLabel(type: string | null | undefined): string {
  return type === 'WingFloor' ? 'Wing / floor' : type === 'Building' ? 'Building' : (type ?? '');
}

export const STAGE_LABELS: Record<string, string> = {
  Manager: 'Manager',
  SecurityHead: 'Security Head',
  Security: 'Security',
  AccessControl: 'Access Control',
};

export function stageLabel(stage: string | null | undefined): string {
  return stage ? (STAGE_LABELS[stage] ?? stage) : '';
}

/** Approval chain per access type (contract §5.3). */
export function stagesFor(accessType: string | null | undefined): ApprovalStage[] {
  return accessType === 'WingFloor' ? ['Manager', 'Security', 'AccessControl'] : ['Manager', 'SecurityHead', 'AccessControl'];
}

type LocationLookup = Lookups['locations'][number];

export const TARGET_TYPES = ['Floor', 'Wing', 'Zone'];

export function buildingsOf(locations: readonly LocationLookup[] | null | undefined): LocationLookup[] {
  return (locations ?? []).filter((l) => l.locationType === 'Building').sort((a, b) => a.name.localeCompare(b.name));
}

/** Strict descendants of `buildingId` with type Floor / Wing / Zone, with a readable path label. */
export function descendantsOf(
  locations: readonly LocationLookup[] | null | undefined,
  buildingId: number | null | undefined,
): (LocationLookup & { pathLabel: string })[] {
  if (!buildingId) return [];
  const all = locations ?? [];
  const byParent = new Map<number, LocationLookup[]>();
  for (const l of all) {
    if (l.parentLocationId == null) continue;
    const list = byParent.get(l.parentLocationId) ?? [];
    list.push(l);
    byParent.set(l.parentLocationId, list);
  }
  const out: (LocationLookup & { pathLabel: string })[] = [];
  const visited = new Set<number>([buildingId]);
  const walk = (parentId: number, prefix: string) => {
    const children = [...(byParent.get(parentId) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const c of children) {
      if (visited.has(c.id)) continue;
      visited.add(c.id);
      const label = prefix ? `${prefix} › ${c.name}` : c.name;
      if (TARGET_TYPES.includes(c.locationType)) out.push({ ...c, pathLabel: label });
      walk(c.id, label);
    }
  };
  walk(buildingId, '');
  return out;
}

function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  const day = r.getDate();
  r.setMonth(r.getMonth() + months);
  if (r.getDate() < day) r.setDate(0); // clamp (e.g. 31 Jan + 1 month -> 28/29 Feb)
  return r;
}

/** Client-side preview of the server's validToUtc computation (§5.3); Custom returns null. */
export function computeValidTo(code: DurationCode | string | null | undefined, from: Date): Date | null {
  switch (code) {
    case 'OneWeek':
      return new Date(from.getTime() + 7 * 24 * 3600 * 1000);
    case 'OneMonth':
      return addMonths(from, 1);
    case 'ThreeMonths':
      return addMonths(from, 3);
    case 'SixMonths':
      return addMonths(from, 6);
    case 'OneYear':
      return addMonths(from, 12);
    case 'Permanent':
      return addMonths(from, 120);
    default:
      return null;
  }
}

/** Custom range rule: to > from and at most one year later. Returns an error message or null. */
export function customRangeError(from: Date | null, to: Date | null): string | null {
  if (!from || !to) return 'Choose both dates.';
  if (to.getTime() <= from.getTime()) return 'The end date must be after the start date.';
  if (to.getTime() > addMonths(from, 12).getTime()) return 'Custom access can be at most one year.';
  return null;
}

/**
 * Stepper: Submitted, one step per stage of the access type, Completed. State from the latest
 * approval per stage (Approved = done, Rejected, Returned, Skipped; Pending at currentStage = current).
 */
export function accessRequestSteps(r: Pick<AccessRequestDetail, 'accessType' | 'status' | 'currentStage' | 'approvals' | 'submittedAtUtc'>): StageStep[] {
  const steps: StageStep[] = [
    { key: 'Submitted', label: 'Submitted', state: r.status === 'Draft' ? 'current' : 'done', at: r.submittedAtUtc },
  ];
  for (const stage of stagesFor(r.accessType)) {
    const latest = [...(r.approvals ?? [])].filter((a) => a.stage === stage).sort((a, b) => b.stageOrder - a.stageOrder || b.approvalId - a.approvalId)[0];
    let state: StageState = 'pending';
    switch (latest?.decision) {
      case 'Approved':
        state = 'done';
        break;
      case 'Rejected':
        state = 'rejected';
        break;
      case 'Returned':
        state = 'returned';
        break;
      case 'Skipped':
        state = 'skipped';
        break;
      default:
        if (r.currentStage === stage && ['Submitted', 'PendingApproval'].includes(r.status)) state = 'current';
        else if (r.status === 'Cancelled' && r.currentStage === stage) state = 'cancelled';
    }
    if (['Approved', 'Provisioned'].includes(r.status) && state === 'pending') state = 'done';
    steps.push({
      key: stage,
      label: stageLabel(stage),
      state,
      caption: latest?.decidedByName ?? (state === 'current' ? latest?.assignedToNames : null) ?? null,
      at: latest?.decidedAtUtc ?? null,
    });
  }
  steps.push({
    key: 'Provisioned',
    label: 'Provisioned',
    state: r.status === 'Provisioned' ? 'done' : r.status === 'Approved' ? 'current' : 'pending',
  });
  return steps;
}

const DECISION_TIMELINE: Record<string, { title: string; icon: string; tone: TimelineEntry['tone'] }> = {
  Approved: { title: 'approved', icon: 'check_circle', tone: 'success' },
  Rejected: { title: 'rejected', icon: 'cancel', tone: 'danger' },
  Returned: { title: 'returned', icon: 'undo', tone: 'warning' },
  Skipped: { title: 'skipped', icon: 'remove_circle_outline', tone: 'neutral' },
  Pending: { title: 'pending', icon: 'hourglass_top', tone: 'warning' },
};

/** Timeline: created, submitted, then each approval row (chronological). */
export function accessTimeline(r: AccessRequestDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    { id: 'created', title: 'Request created', icon: 'note_add', tone: 'neutral', actor: r.requesterName, at: r.createdAtUtc },
  ];
  if (r.submittedAtUtc) {
    entries.push({ id: 'submitted', title: 'Submitted for approval', icon: 'send', tone: 'info', actor: r.requesterName, at: r.submittedAtUtc });
  }
  const approvals = [...(r.approvals ?? [])].sort((a, b) => a.approvalId - b.approvalId);
  for (const a of approvals) {
    const meta = DECISION_TIMELINE[a.decision] ?? DECISION_TIMELINE['Pending'];
    entries.push({
      id: `a${a.approvalId}`,
      title: `${stageLabel(a.stage)} ${meta.title}`,
      icon: meta.icon,
      tone: meta.tone,
      actor: a.decidedByName ?? (a.decision === 'Pending' && a.assignedToNames ? `Assigned to ${a.assignedToNames}` : null),
      at: a.decidedAtUtc,
      comments: a.comments,
    });
  }
  if (r.status === 'Provisioned') {
    entries.push({ id: 'provisioned', title: 'Access provisioned', icon: 'verified', tone: 'success', detail: r.permissionId ? `Permission #${r.permissionId}` : null });
  } else if (r.status === 'Cancelled') {
    entries.push({ id: 'cancelled', title: 'Request cancelled', icon: 'block', tone: 'neutral', at: r.updatedAtUtc });
  }
  return entries;
}
