export interface DashboardSummary {
  activeEmployees: number;
  activeCards: number;
  blockedCards: number;
  pendingAccessRequests: number;
  myPendingApprovals: number;
  activePermissions: number;
  permissionsExpiring7d: number;
  eventsToday: number;
  deniedToday: number;
  openViolations: number;
  openIncidents: number;
  visitorsOnSite: number;
  avgApprovalTurnaroundHours: number | null;
}

export interface EventsTrendPoint {
  date: string;
  entries: number;
  exits: number;
  denied: number;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface OccupancyItem {
  locationId: number;
  locationName: string;
  onSite: number;
}

export interface MyWorkItem {
  itemType: string;
  referenceId: number;
  referenceNumber: string | null;
  title: string | null;
  status: string | null;
  createdAtUtc: string | null;
  route: string | null;
}

export interface ActivityItem {
  auditLogId: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorName: string | null;
  summary: string | null;
  occurredAtUtc: string;
}

export type KpiTone = 'primary' | 'teal' | 'violet' | 'success' | 'warning' | 'danger';

export interface KpiTile {
  label: string;
  value: string;
  icon: string;
  tone: KpiTone;
  hint?: string;
}
