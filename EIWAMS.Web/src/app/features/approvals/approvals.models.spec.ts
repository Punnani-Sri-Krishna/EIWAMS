import { buildDecisionBody, commentsRequired } from './approvals.models';

describe('approval decisions', () => {
  it('requires comments only for Return and Reject', () => {
    expect(commentsRequired('Approve')).toBe(false);
    expect(commentsRequired('Return')).toBe(true);
    expect(commentsRequired('Reject')).toBe(true);
  });

  it('rejects blank comments for Return/Reject and trims them otherwise', () => {
    expect(() => buildDecisionBody('Reject', '   ', 'AAA=')).toThrow(/Comments are required/);
    expect(() => buildDecisionBody('Return', null, 'AAA=')).toThrow();
    expect(buildDecisionBody('Return', '  needs dates ', 'AAA=')).toEqual({ decision: 'Return', comments: 'needs dates', version: 'AAA=' });
    expect(buildDecisionBody('Approve', '', 'AAA=')).toEqual({ decision: 'Approve', comments: null, version: 'AAA=' });
  });
});
