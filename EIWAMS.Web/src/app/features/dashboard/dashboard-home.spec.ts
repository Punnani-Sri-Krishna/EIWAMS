import { describe, expect, it } from 'vitest';

import { HomeDashboardDto, waitingCards, waitingTotal } from './dashboard.models';

const home = (overrides: Partial<HomeDashboardDto> = {}): HomeDashboardDto => ({
  myRequests: { open: 2, closed: 3, recent: [] },
  pendingManager: null,
  pendingHr: null,
  pendingSecurity: null,
  pendingIdCard: null,
  pendingAccessReview: null,
  pendingProvisioning: null,
  teamRequests: null,
  ...overrides,
});

describe('home "waiting for you" cards', () => {
  it('shows nothing for a plain employee', () => {
    expect(waitingCards(home())).toEqual([]);
    expect(waitingCards(null)).toEqual([]);
  });

  it('includes only non-null queues, in workflow order, with simplified routes', () => {
    const cards = waitingCards(home({
      pendingProvisioning: { count: 1, route: '/permissions/provision', top: [] },
      pendingIdCard: { count: 3, route: '/approvals/id-card', top: [] },
      pendingHr: { count: 4, route: '/approvals/hr', top: [] },
      teamRequests: { count: 9, route: '/approvals/team', top: [] },
    }));

    expect(cards.map((c) => c.key)).toEqual(['pendingHr', 'pendingIdCard', 'pendingProvisioning']);
    expect(cards.find((c) => c.key === 'pendingIdCard')?.route).toBe('/id-card-processing');
    expect(waitingTotal(cards)).toBe(8);
  });

  it('sends plain managers to the approvals hub for access review', () => {
    const h = home({ pendingAccessReview: { count: 2, route: '/approvals/access', top: [] } });
    expect(waitingCards(h, true)[0].route).toBe('/approvals/access');
    expect(waitingCards(h, false)[0].route).toBe('/approvals');
  });
});
