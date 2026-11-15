import { describe, expect, it } from 'vitest';

import { groupByModule } from './profile-helpers';

describe('groupByModule', () => {
  it('groups by module prefix with sorted modules and actions', () => {
    expect(groupByModule(['Employees.View', 'Cards.Issue', 'Cards.Request', 'Dashboard'])).toEqual([
      { module: 'Cards', permissions: ['Issue', 'Request'] },
      { module: 'Employees', permissions: ['View'] },
      { module: 'General', permissions: ['Dashboard'] },
    ]);
  });

  it('removes duplicates', () => {
    expect(groupByModule(['A.X', 'A.X'])).toEqual([{ module: 'A', permissions: ['X'] }]);
  });
});
