import { describe, expect, it } from 'vitest';

import { normaliseRoles, roleLabel, toRoleCode } from './admin.models';
import { toEmployeeRoleRow } from './admin.service';

describe('employee role mapping', () => {
  it('accepts role codes or display names from the API', () => {
    expect(toRoleCode('HR')).toBe('HRAdmin');
    expect(toRoleCode('ID Card Team')).toBe('IdCardTeam');
    expect(toRoleCode('Access Control')).toBe('AccessControlTeam');
    expect(toRoleCode('SecurityHead')).toBe('SecurityHead');
    expect(toRoleCode('Security')).toBe('SecurityTeam');
  });

  it('always includes Employee and orders roles consistently', () => {
    expect(normaliseRoles(['SystemAdmin', 'Manager', 'Manager'])).toEqual(['Employee', 'Manager', 'SystemAdmin']);
    expect(normaliseRoles([])).toEqual(['Employee']);
  });

  it('labels roles for display', () => {
    expect(roleLabel('HRAdmin')).toBe('HR');
    expect(roleLabel('SecurityTeam')).toBe('Security');
  });

  it('maps a list row with or without employee fields; account-only rows are dropped', () => {
    const row = toEmployeeRoleRow({
      userId: 7,
      displayName: 'Asha Rao',
      email: 'asha@example.com',
      isActive: true,
      roleNames: ['Manager'],
      employeeId: 3,
      employeeNumber: 'E003',
      lastLoginAtUtc: null,
      departmentName: 'Engineering',
    });
    expect(row).toMatchObject({ userId: 7, employeeId: 3, departmentName: 'Engineering', managerName: null, roles: ['Employee', 'Manager'] });
    expect(toEmployeeRoleRow({ userId: 8, displayName: 'Svc', email: 's@x', isActive: true, employeeId: null, employeeNumber: null })).toBeNull();
  });
});
