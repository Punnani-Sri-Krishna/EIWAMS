import { describe, expect, it } from 'vitest';

import { toAccessRequestPayload } from './access-requests.models';

describe('access request wire payload', () => {
  it('uses justification and sends no submit field for an immediate create', () => {
    const body = toAccessRequestPayload({
      accessType: 'Building',
      buildingLocationId: 10,
      locationId: 10,
      durationCode: 'OneMonth',
      justification: '  Project work  ',
    });

    expect(body).toEqual({
      accessType: 'Building',
      buildingLocationId: 10,
      locationId: 10,
      durationCode: 'OneMonth',
      justification: 'Project work',
    });
    expect(body).not.toHaveProperty('submit');
    expect(body).not.toHaveProperty('businessJustification');
    expect(body).not.toHaveProperty('validFrom');
    expect(body).not.toHaveProperty('validTo');
  });

  it('sends canonical UTC timestamp fields only for Custom duration', () => {
    expect(toAccessRequestPayload({
      accessType: 'WingFloor',
      buildingLocationId: 10,
      locationId: 15,
      durationCode: 'Custom',
      justification: 'Restricted lab duties',
      validFromUtc: '2026-11-17T08:00:00.000Z',
      validToUtc: '2026-12-01T17:59:59.000Z',
    })).toMatchObject({
      accessType: 'WingFloor',
      buildingLocationId: 10,
      locationId: 15,
      justification: 'Restricted lab duties',
      validFromUtc: '2026-11-17T08:00:00.000Z',
      validToUtc: '2026-12-01T17:59:59.000Z',
    });
  });
});
