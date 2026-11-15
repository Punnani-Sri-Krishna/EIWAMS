import { nextSecurityStatuses, violationReviewOptions } from './violations.models';
import { passActions } from '../visitors/visitors.models';

describe('security workflow rules', () => {
  it('mirrors fn_SecurityTransitionAllowed, allowing re-open only for incidents', () => {
    expect(nextSecurityStatuses('Open', false)).toEqual(['UnderReview', 'Confirmed', 'FalsePositive']);
    expect(nextSecurityStatuses('UnderReview', false)).toEqual(['Confirmed', 'FalsePositive']);
    expect(nextSecurityStatuses('Confirmed', false)).toEqual(['Closed']);
    expect(nextSecurityStatuses('Closed', false)).toEqual([]);
    expect(nextSecurityStatuses('Closed', true)).toEqual(['UnderReview']);
  });

  it('never offers Open as a review status but allows a notes-only update on reviewed violations', () => {
    expect(violationReviewOptions('Open')).not.toContain('Open');
    expect(violationReviewOptions('Confirmed')).toEqual(['Confirmed', 'Closed']);
    expect(violationReviewOptions('Closed')).toEqual(['Closed']);
  });

  it('offers visitor pass actions by status and permission', () => {
    const all = () => true;
    const manageOnly = (c: string) => c === 'Visitors.Manage';
    expect(passActions('PendingApproval', all)).toEqual(['approve', 'revoke']);
    expect(passActions('PendingApproval', manageOnly)).toEqual(['revoke']);
    expect(passActions('Approved', manageOnly)).toEqual(['checkIn', 'revoke']);
    expect(passActions('Active', all)).toEqual(['checkOut', 'revoke']);
    expect(passActions('CheckedOut', all)).toEqual([]);
    expect(passActions('Approved', () => false)).toEqual([]);
  });
});
