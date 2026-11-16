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

export interface HomeWorkItem {
  requestKind: 'Card' | 'Access';
  requestId: number;
  requestNumber: string;
  requestType: string;
  employeeName: string | null;
  employeeNumber: string | null;
  status: string;
  currentStage: string | null;
  submittedAtUtc: string | null;
  route: string;
}

export interface QueueSummary {
  count: number;
  route: string;
  top: HomeWorkItem[];
}

export interface HomeDashboardDto {
  myRequests: { open: number; closed: number; recent: HomeWorkItem[] };
  pendingManager: QueueSummary | null;
  pendingHr: QueueSummary | null;
  pendingSecurity: QueueSummary | null;
  pendingIdCard: QueueSummary | null;
  pendingAccessReview: QueueSummary | null;
  pendingProvisioning: QueueSummary | null;
  teamRequests: QueueSummary | null;
  reports: { cardsIssuedThisMonth: number; accessGrantedThisMonth: number; openRequests: number } | null;
}

export interface HomeCardSection {
  key: string;
  title: string;
  icon: string;
  route: string;
  count: number;
  detail: string;
  items: HomeWorkItem[];
}

/** Converts nullable API sections into user-facing cards; null sections stay hidden. */
export function homeCardSections(home: HomeDashboardDto | null, hasEmployeeProfile: boolean): HomeCardSection[] {
  if (!home) return [];
  const sections: HomeCardSection[] = hasEmployeeProfile ? [{
      key: 'myRequests',
      title: 'My Requests',
      icon: 'assignment',
      route: '/my-requests',
      count: home.myRequests.open,
      detail: `${home.myRequests.closed} closed`,
      items: home.myRequests.recent,
    }] : [];
  const queues: Array<[keyof Pick<HomeDashboardDto, 'pendingManager' | 'pendingHr' | 'pendingSecurity' | 'pendingIdCard' | 'pendingAccessReview' | 'pendingProvisioning' | 'teamRequests'>, string, string]> = [
    ['pendingManager', 'Pending Manager Approvals', 'pending_actions'],
    ['pendingHr', 'HR Verification', 'fact_check'],
    ['pendingSecurity', 'Security Approvals', 'shield'],
    ['pendingIdCard', 'ID Card Processing', 'badge'],
    ['pendingAccessReview', 'Access Review', 'task_alt'],
    ['pendingProvisioning', 'Provisioning', 'lock_open'],
    ['teamRequests', 'Team Requests', 'groups'],
  ];
  for (const [key, title, icon] of queues) {
    const queue = home[key];
    if (queue) {
      sections.push({
        key,
        title,
        icon,
        route: queue.route,
        count: queue.count,
        detail: `${queue.count} waiting`,
        items: queue.top,
      });
    }
  }
  if (home.reports) {
    sections.push({
      key: 'reports',
      title: 'Reports',
      icon: 'analytics',
      route: '/reports',
      count: home.reports.openRequests,
      detail: `${home.reports.cardsIssuedThisMonth} cards issued · ${home.reports.accessGrantedThisMonth} access grants this month`,
      items: [],
    });
  }
  return sections;
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
