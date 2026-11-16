import { describe, expect, it } from 'vitest';

import { HomeDashboardDto, homeCardSections } from './dashboard.models';

const home = (overrides: Partial<HomeDashboardDto> = {}): HomeDashboardDto => ({
  myRequests: { open: 2, closed: 3, recent: [] },
  pendingManager: null,
  pendingHr: null,
  pendingSecurity: null,
  pendingIdCard: null,
  pendingAccessReview: null,
  pendingProvisioning: null,
  teamRequests: null,
  reports: null,
  ...overrides,
});

describe('role dashboard sections', () => {
  it('always shows My Requests and only includes non-null permission sections', () => {
    const cards = homeCardSections(home({
      pendingHr: { count: 4, route: '/approvals/hr', top: [] },
      pendingProvisioning: { count: 1, route: '/permissions/provision', top: [] },
    }), true);

    expect(cards.map((card) => card.key)).toEqual(['myRequests', 'pendingHr', 'pendingProvisioning']);
    expect(cards[0]).toMatchObject({ title: 'My Requests', count: 2, detail: '3 closed' });
    expect(cards[1]).toMatchObject({ title: 'HR Verification', count: 4, route: '/approvals/hr' });
  });

  it('shows the reports section only when the reports DTO is present', () => {
    expect(homeCardSections(home(), true).some((card) => card.key === 'reports')).toBe(false);
    expect(homeCardSections(home({
      reports: { cardsIssuedThisMonth: 5, accessGrantedThisMonth: 6, openRequests: 7 },
    }), true).find((card) => card.key === 'reports')).toMatchObject({
      route: '/reports',
      count: 7,
      detail: '5 cards issued · 6 access grants this month',
    });
  });

  it('omits My Requests for users without an employee profile', () => {
    const cards = homeCardSections(home({
      pendingHr: { count: 1, route: '/approvals/hr', top: [] },
    }), false);

    expect(cards.map((card) => card.key)).toEqual(['pendingHr']);
  });
});
