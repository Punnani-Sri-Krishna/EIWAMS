import { describe, expect, it } from 'vitest';

import { toWorkCounts } from './work-counts.service';

describe('toWorkCounts', () => {
  it('maps dashboard queue sections to badge counters and treats null sections as zero', () => {
    expect(
      toWorkCounts({
        pendingManager: { count: 2 },
        pendingHr: null,
        pendingIdCard: { count: 5 },
        pendingProvisioning: { count: 1 },
      }),
    ).toEqual({ manager: 2, hr: 0, security: 0, access: 0, idCard: 5, provisioning: 1, team: 0 });
  });

  it('returns all zeros before the first load', () => {
    expect(Object.values(toWorkCounts(null)).every((n) => n === 0)).toBe(true);
  });
});
