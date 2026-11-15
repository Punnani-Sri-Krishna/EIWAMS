import { describe, expect, it } from 'vitest';

import { RolePermission } from './admin.models';
import { groupPermissions, settingKind } from './admin-helpers';

const perm = (id: number, code: string, module: string): RolePermission => ({
  permissionId: id,
  code,
  module,
  description: null,
  granted: false,
});

describe('groupPermissions', () => {
  it('groups by module alphabetically, sorting codes and defaulting blank modules', () => {
    const groups = groupPermissions([
      perm(1, 'Users.Manage', 'Admin'),
      perm(2, 'Cards.View', 'Cards'),
      perm(3, 'Roles.Manage', 'Admin'),
      perm(4, 'Misc.Do', ''),
    ]);
    expect(groups.map((g) => g.module)).toEqual(['Admin', 'Cards', 'General']);
    expect(groups[0].permissions.map((p) => p.code)).toEqual(['Roles.Manage', 'Users.Manage']);
  });
});

describe('settingKind', () => {
  it('maps API data types to editors', () => {
    expect(settingKind('Boolean')).toBe('bool');
    expect(settingKind('int')).toBe('int');
    expect(settingKind('decimal')).toBe('decimal');
    expect(settingKind(null)).toBe('text');
  });
});
