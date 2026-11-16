import { describe, expect, it } from 'vitest';

import { approvalTabs, buildNav, NavAccess } from './nav';

const access = (permissions: string[], roles: string[] = []): NavAccess => ({
  has: (p) => permissions.includes(p),
  roles,
});

const EMPLOYEE = ['Cards.Request', 'Cards.View', 'AccessRequests.Create', 'AccessRequests.View', 'Dashboard.View'];

const keys = (a: NavAccess) => buildNav(a).map((e) => e.key);

describe('simplified top navigation', () => {
  it('gives a plain employee Home and Requests only', () => {
    const nav = buildNav(access(EMPLOYEE, ['Employee']));
    expect(nav.map((e) => e.key)).toEqual(['home', 'requests']);
    expect(nav[1].children?.map((c) => c.route)).toEqual(['/cards/requests/new', '/access-requests/new', '/my-requests']);
  });

  it('gives a manager an Approvals entry with manager and team tabs, access decided inside the manager tab', () => {
    const a = access([...EMPLOYEE, 'Cards.ManagerApprove', 'Approvals.Team', 'Approvals.Decide'], ['Employee', 'Manager']);
    expect(keys(a)).toEqual(['home', 'requests', 'approvals']);
    expect(approvalTabs(a).map((t) => t.key)).toEqual(['manager', 'team']);
    expect(buildNav(a).find((e) => e.key === 'approvals')?.badge).toEqual(['manager']);
  });

  it('gives HR the HR verification tab and the employee directory', () => {
    const a = access([...EMPLOYEE, 'Cards.HrVerify', 'Employees.ViewAll'], ['Employee', 'HRAdmin']);
    expect(keys(a)).toEqual(['home', 'requests', 'approvals', 'employees']);
    expect(approvalTabs(a).map((t) => t.route)).toEqual(['/approvals/hr']);
  });

  it('gives the ID card team a top-level ID Card Processing entry with a badge', () => {
    const nav = buildNav(access([...EMPLOYEE, 'Cards.Process'], ['Employee', 'IdCardTeam']));
    const entry = nav.find((e) => e.key === 'id-card');
    expect(entry).toMatchObject({ route: '/id-card-processing', badge: ['idCard'] });
    expect(nav.some((e) => e.key === 'approvals')).toBe(false);
  });

  it('gives access control the review tab and Access Provisioning', () => {
    const a = access([...EMPLOYEE, 'Approvals.Decide', 'Permissions.Provision'], ['Employee', 'AccessControlTeam']);
    expect(keys(a)).toEqual(['home', 'requests', 'approvals', 'provisioning']);
    expect(approvalTabs(a).map((t) => t.key)).toEqual(['access']);
  });

  it('gives a system admin the Admin menu without removed modules', () => {
    const nav = buildNav(access([...EMPLOYEE, 'Users.Manage', 'Reference.Manage', 'Employees.ViewAll'], ['Employee', 'SystemAdmin']));
    const admin = nav.find((e) => e.key === 'admin');
    expect(admin?.children?.map((c) => c.label)).toEqual(['Employees & roles', 'Locations', 'Departments']);
    const routes = nav.flatMap((e) => [e.route, ...(e.children ?? []).map((c) => c.route)]).filter(Boolean).join(' ');
    expect(routes).not.toMatch(/rfid|violation|incident|blacklist|visitor|report|audit|reader|setting/i);
  });

  it('gives security head the security tab and the access review tab even when also a manager', () => {
    const a = access([...EMPLOYEE, 'Cards.ManagerApprove', 'Cards.SecurityReview', 'Approvals.Decide'], ['Employee', 'Manager', 'SecurityHead']);
    expect(approvalTabs(a).map((t) => t.key)).toEqual(['manager', 'security', 'access']);
  });
});
