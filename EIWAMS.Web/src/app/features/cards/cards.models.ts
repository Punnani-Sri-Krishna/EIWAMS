export interface Card {
  cardId: number;
  maskedCardUid: string;
  employeeId: number;
  employeeNumber: string | null;
  employeeName: string | null;
  cardType: string;
  status: string;
  issuedAtUtc: string | null;
  activatedAtUtc: string | null;
  expiresAtUtc: string | null;
  blockedAtUtc: string | null;
  blockReason: string | null;
  controllerSyncStatus: string | null;
  replacedByCardId: number | null;
  cardRequestId: number | null;
  version: string | null;
}

export interface CardRequest {
  cardRequestId: number;
  requestNumber: string;
  requestType: string;
  employeeId: number;
  employeeName: string | null;
  employeeNumber: string | null;
  oldCardId: number | null;
  newCardId: number | null;
  reason: string | null;
  status: string;
  requestedAtUtc: string;
  requestedByName: string | null;
  verifiedByName: string | null;
  approvedByName: string | null;
  decidedAtUtc: string | null;
  decisionComments: string | null;
  requestedValidToUtc: string | null;
}

export interface IssueCardRequest {
  employeeId: number;
  cardUid: string;
  cardType: string;
  expiresAtUtc?: string | null;
  cardRequestId?: number | null;
}

export interface CreateCardRequestBody {
  employeeId: number;
  requestType: string;
  oldCardId?: number | null;
  reason: string;
  requestedValidToUtc?: string | null;
}

export type CardRequestDecision = 'Verify' | 'Approve' | 'Reject';

/** Card UID rule enforced by the API: 4-32 hexadecimal characters. */
export const CARD_UID_PATTERN = /^[0-9A-Fa-f]{4,32}$/;

export type CardAction = 'activate' | 'reportLost' | 'block' | 'replace' | 'deactivate';

/** Lifecycle actions available for a card, given the caller's permissions. */
export function cardActions(card: Pick<Card, 'status' | 'employeeId'>, can: (code: string) => boolean, ownEmployeeId: number | null): CardAction[] {
  const actions: CardAction[] = [];
  const own = ownEmployeeId !== null && ownEmployeeId === card.employeeId;
  switch (card.status) {
    case 'Requested':
      if (can('Cards.Issue')) actions.push('activate');
      if (can('Cards.Block')) actions.push('deactivate');
      break;
    case 'Active':
      if (can('Cards.Block') || (own && can('Cards.Request'))) actions.push('reportLost');
      if (can('Cards.Block')) actions.push('block');
      if (can('Cards.Issue')) actions.push('replace');
      if (can('Cards.Block')) actions.push('deactivate');
      break;
    case 'Lost':
    case 'Blocked':
    case 'Damaged':
      if (can('Cards.Issue')) actions.push('replace');
      if (can('Cards.Block')) actions.push('deactivate');
      break;
  }
  return actions;
}

/** Decisions available for a card request (Cards.Verify): Submitted -> Verify -> Approve; Reject from either. */
export function cardRequestDecisions(status: string): CardRequestDecision[] {
  switch (status) {
    case 'Submitted':
      return ['Verify', 'Approve', 'Reject'];
    case 'VerificationPending':
      return ['Approve', 'Reject'];
    default:
      return [];
  }
}
