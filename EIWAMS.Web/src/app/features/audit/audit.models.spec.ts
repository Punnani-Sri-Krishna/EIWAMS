import { diffAudit, prettyJson } from './audit.models';

describe('audit diff', () => {
  it('classifies added, removed, changed and unchanged fields including nested paths', () => {
    const rows = diffAudit('{"status":"Active","name":"A","addr":{"city":"X"}}', '{"status":"Suspended","name":"A","addr":{"city":"Y"},"reason":"r"}');
    const byPath = Object.fromEntries(rows.map((r) => [r.path, r]));
    expect(byPath['status']).toEqual({ path: 'status', before: 'Active', after: 'Suspended', kind: 'changed' });
    expect(byPath['name'].kind).toBe('same');
    expect(byPath['addr.city'].kind).toBe('changed');
    expect(byPath['reason']).toEqual({ path: 'reason', before: '', after: 'r', kind: 'added' });
  });

  it('handles create (no before) and non-JSON text', () => {
    expect(diffAudit(null, '{"id":1}')).toEqual([{ path: 'id', before: '', after: '1', kind: 'added' }]);
    expect(prettyJson('not json')).toBe('not json');
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });
});
