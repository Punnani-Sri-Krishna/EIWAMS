import { describe, expect, it } from 'vitest';

import { statusLabel, statusTone } from './status-tone';

describe('v2 workflow status presentation', () => {
  it('maps card request statuses to the contract labels and tones', () => {
    expect(statusLabel('PendingHR', 'card-request')).toBe('HR Verification');
    expect(statusTone('PendingHR', 'card-request')).toBe('warning');
    expect(statusTone('Printing', 'card-request')).toBe('info');
    expect(statusLabel('Closed', 'card-request')).toBe('Issued');
    expect(statusTone('Closed', 'card-request')).toBe('success');
  });

  it('labels provisioned access as completed and keeps approval pending states visible', () => {
    expect(statusLabel('Provisioned', 'access-request')).toBe('Completed');
    expect(statusTone('Provisioned', 'access-request')).toBe('success');
    expect(statusTone('PendingApproval', 'access-request')).toBe('warning');
    expect(statusTone('Approved', 'access-request')).toBe('info');
  });
});
