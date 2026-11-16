/**
 * Simple top navigation (SIMPLIFY-SPEC §D), computed on the client from the caller's permissions and roles:
 * Home | Requests ▾ | Approvals | ID Card Processing | Access Provisioning | Employees | Admin ▾ (+ bell and avatar).
 */

/** Keys of the pending-work counters (see WorkCountsService). */
export type WorkCountKey = 'manager' | 'hr' | 'security' | 'access' | 'idCard' | 'provisioning' | 'team';

export interface NavAccess {
  has(permission: string): boolean;
  roles: readonly string[];
}

export interface NavLink {
  key: string;
  label: string;
  icon: string;
  route: string;
}

export interface NavEntry {
  key: string;
  label: string;
  icon: string;
  /** Link target for single entries; dropdowns have `children` instead. */
  route?: string;
  children?: NavLink[];
  /** Counters summed into the entry badge. */
  badge?: WorkCountKey[];
}

export type ApprovalTabKey = 'manager' | 'team' | 'hr' | 'security' | 'access';

export interface ApprovalTab {
  key: ApprovalTabKey;
  label: string;
  icon: string;
  route: string;
  /** Counter shown on the tab (team requests are informational, so no badge). */
  count: WorkCountKey | null;
}

/** Roles that review access requests after the manager stage. */
const ACCESS_REVIEW_ROLES = ['SecurityHead', 'SecurityTeam', 'AccessControlTeam', 'SystemAdmin'];

/** Approval queues the user owns, in display order. */
export function approvalTabs(a: NavAccess): ApprovalTab[] {
  const tabs: ApprovalTab[] = [];
  if (a.has('Cards.ManagerApprove')) {
    tabs.push({ key: 'manager', label: 'Manager approvals', icon: 'pending_actions', route: '/approvals/manager', count: 'manager' });
  }
  if (a.has('Approvals.Team')) {
    tabs.push({ key: 'team', label: 'Team requests', icon: 'groups', route: '/approvals/team', count: null });
  }
  if (a.has('Cards.HrVerify')) {
    tabs.push({ key: 'hr', label: 'HR verification', icon: 'fact_check', route: '/approvals/hr', count: 'hr' });
  }
  if (a.has('Cards.SecurityReview')) {
    tabs.push({ key: 'security', label: 'Security approvals', icon: 'shield', route: '/approvals/security', count: 'security' });
  }
  // A plain manager decides access requests inside "Manager approvals"; reviewers after that stage get their own tab.
  if (a.has('Approvals.Decide') && (a.roles.some((r) => ACCESS_REVIEW_ROLES.includes(r)) || !a.has('Cards.ManagerApprove'))) {
    tabs.push({ key: 'access', label: 'Access requests review', icon: 'task_alt', route: '/approvals/access', count: 'access' });
  }
  return tabs;
}

export function buildNav(a: NavAccess): NavEntry[] {
  const nav: NavEntry[] = [{ key: 'home', label: 'Home', icon: 'home', route: '/dashboard' }];

  const requests: NavLink[] = [];
  if (a.has('Cards.Request')) {
    requests.push({ key: 'new-card', label: 'Raise ID card request', icon: 'badge', route: '/cards/requests/new' });
  }
  if (a.has('AccessRequests.Create')) {
    requests.push({ key: 'new-access', label: 'Raise access request', icon: 'vpn_key', route: '/access-requests/new' });
  }
  if (a.has('Cards.View') || a.has('AccessRequests.View')) {
    requests.push({ key: 'my-requests', label: 'My requests', icon: 'assignment', route: '/my-requests' });
  }
  if (requests.length) {
    nav.push({ key: 'requests', label: 'Requests', icon: 'assignment', children: requests });
  }

  const tabs = approvalTabs(a);
  if (tabs.length) {
    nav.push({
      key: 'approvals',
      label: 'Approvals',
      icon: 'pending_actions',
      route: '/approvals',
      badge: tabs.map((t) => t.count).filter((c): c is WorkCountKey => c !== null),
    });
  }
  if (a.has('Cards.Process')) {
    nav.push({ key: 'id-card', label: 'ID Card Processing', icon: 'print', route: '/id-card-processing', badge: ['idCard'] });
  }
  if (a.has('Permissions.Provision')) {
    nav.push({ key: 'provisioning', label: 'Access Provisioning', icon: 'lock_open', route: '/permissions/provision', badge: ['provisioning'] });
  }
  if (a.has('Employees.ViewAll')) {
    nav.push({ key: 'employees', label: 'Employees', icon: 'contacts', route: '/employees' });
  }

  const admin: NavLink[] = [];
  if (a.has('Users.Manage')) {
    admin.push({ key: 'admin-employees', label: 'Employees & roles', icon: 'manage_accounts', route: '/admin/employees' });
  }
  if (a.has('Reference.Manage')) {
    admin.push({ key: 'admin-locations', label: 'Locations', icon: 'location_city', route: '/admin/locations' });
    admin.push({ key: 'admin-departments', label: 'Departments', icon: 'apartment', route: '/admin/departments' });
  }
  if (admin.length) {
    nav.push({ key: 'admin', label: 'Admin', icon: 'admin_panel_settings', children: admin });
  }
  return nav;
}
