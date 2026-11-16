/** `GET v1/dashboard/home` (contract §6). Sections are null when the caller lacks the matching permission. */
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
  myRequests: { open: number; closed: number; recent: HomeWorkItem[] } | null;
  pendingManager: QueueSummary | null;
  pendingHr: QueueSummary | null;
  pendingSecurity: QueueSummary | null;
  pendingIdCard: QueueSummary | null;
  pendingAccessReview: QueueSummary | null;
  pendingProvisioning: QueueSummary | null;
  teamRequests: QueueSummary | null;
}

type QueueKey = 'pendingManager' | 'pendingHr' | 'pendingSecurity' | 'pendingIdCard' | 'pendingAccessReview' | 'pendingProvisioning';

/** "Waiting for you" card on Home: one per work queue the user owns. */
export interface WaitingCard {
  key: QueueKey;
  title: string;
  icon: string;
  route: string;
  count: number;
}

/** Queue cards in display order; routes follow the simplified navigation rather than the API's legacy paths. */
const QUEUES: ReadonlyArray<{ key: QueueKey; title: string; icon: string; route: string }> = [
  { key: 'pendingManager', title: 'Manager approvals', icon: 'pending_actions', route: '/approvals/manager' },
  { key: 'pendingHr', title: 'HR verification', icon: 'fact_check', route: '/approvals/hr' },
  { key: 'pendingSecurity', title: 'Security approvals', icon: 'shield', route: '/approvals/security' },
  { key: 'pendingAccessReview', title: 'Access requests review', icon: 'task_alt', route: '/approvals/access' },
  { key: 'pendingIdCard', title: 'ID cards to print and issue', icon: 'print', route: '/id-card-processing' },
  { key: 'pendingProvisioning', title: 'Access to provision', icon: 'lock_open', route: '/permissions/provision' },
];

/**
 * Converts the nullable queue sections into "waiting for you" cards (null sections stay hidden).
 * `hasAccessTab` is false for plain managers, whose access decisions live in the manager tab.
 */
export function waitingCards(home: HomeDashboardDto | null, hasAccessTab = true): WaitingCard[] {
  if (!home) return [];
  const cards: WaitingCard[] = [];
  for (const q of QUEUES) {
    const section = home[q.key];
    if (!section) continue;
    const route = q.key === 'pendingAccessReview' && !hasAccessTab ? '/approvals' : q.route;
    cards.push({ key: q.key, title: q.title, icon: q.icon, route, count: section.count ?? 0 });
  }
  return cards;
}

/** Total number of items waiting for the user across all queues. */
export function waitingTotal(cards: readonly WaitingCard[]): number {
  return cards.reduce((sum, c) => sum + c.count, 0);
}
