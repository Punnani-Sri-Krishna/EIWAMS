/**
 * Admin models. "Employees & roles" (SIMPLIFY-SPEC §B): employees come from HR, so the admin only assigns roles and
 * organisational fields; there is no user create. Raw API shapes are mapped in AdminService so payload changes stay local.
 */

/**
 * Row of the employees-and-roles list / save response as returned by the API. Employees without a sign-in account
 * have `userId: null`; the employee fields are optional until every row carries them.
 */
export interface AdminUser {
  userId: number | null;
  displayName?: string | null;
  /** Some employee-centric DTOs send `fullName` / `workEmail` instead of `displayName` / `email`. */
  fullName?: string | null;
  email?: string | null;
  workEmail?: string | null;
  isActive: boolean;
  roleIds?: number[];
  roleNames?: string[];
  /** Role codes, if the API sends them separately from display names. */
  roles?: string[];
  employeeId: number | null;
  employeeNumber: string | null;
  lastLoginAtUtc?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  managerEmployeeId?: number | null;
  managerName?: string | null;
  designation?: string | null;
  locationId?: number | null;
  locationName?: string | null;
}

export interface AdminUserQuery {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean | null;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

/**
 * One row of the "Employees & roles" table, keyed by employee. `userId` is null until the employee first gets an
 * account (the save creates it). `roles` holds role codes (see ASSIGNABLE_ROLES).
 */
export interface EmployeeRoleRow {
  employeeId: number;
  userId: number | null;
  displayName: string;
  email: string;
  employeeNumber: string | null;
  departmentId: number | null;
  departmentName: string | null;
  managerEmployeeId: number | null;
  managerName: string | null;
  designation: string | null;
  locationId: number | null;
  locationName: string | null;
  roles: string[];
  isActive: boolean;
  lastLoginAtUtc: string | null;
}

/** Body of `PUT v1/admin/employees/{employeeId}` (no userId: the API links or creates the account). */
export interface UpdateEmployeeRolesRequest {
  roles: string[];
  managerEmployeeId: number | null;
  departmentId: number | null;
  designation: string | null;
  locationId: number | null;
  isActive: boolean;
}

export interface AssignableRole {
  code: string;
  label: string;
  description: string;
}

/** Roles an administrator can assign. Employee is implicit for everyone and cannot be removed. */
export const ASSIGNABLE_ROLES: readonly AssignableRole[] = [
  { code: 'Employee', label: 'Employee', description: 'Raise own requests (everyone)' },
  { code: 'Manager', label: 'Manager', description: 'Approve direct reports' },
  { code: 'HRAdmin', label: 'HR', description: 'Verify ID card requests' },
  { code: 'SecurityHead', label: 'Security Head', description: 'Lost cards and restricted access' },
  { code: 'SecurityTeam', label: 'Security', description: 'Review access requests' },
  { code: 'IdCardTeam', label: 'ID Card Team', description: 'Print and issue ID cards' },
  { code: 'AccessControlTeam', label: 'Access Control', description: 'Provision approved access' },
  { code: 'SystemAdmin', label: 'System Admin', description: 'Employees, roles and reference data' },
];

export const BASE_ROLE = 'Employee';

const ROLE_ALIASES: Record<string, string> = {
  hr: 'HRAdmin',
  security: 'SecurityTeam',
  accesscontrol: 'AccessControlTeam',
  admin: 'SystemAdmin',
};

/** Maps a role code or display name from the API to an assignable role code (unknown values are kept as-is). */
export function toRoleCode(value: string): string {
  const key = value.replace(/[\s_-]/g, '').toLowerCase();
  const known = ASSIGNABLE_ROLES.find((r) => r.code.toLowerCase() === key || r.label.replace(/\s/g, '').toLowerCase() === key);
  return known?.code ?? ROLE_ALIASES[key] ?? value;
}

export function roleLabel(code: string): string {
  return ASSIGNABLE_ROLES.find((r) => r.code === code)?.label ?? code;
}

/** Normalises role codes: known roles in display order, Employee always included, duplicates removed. */
export function normaliseRoles(values: readonly string[]): string[] {
  const codes = new Set(values.map(toRoleCode));
  codes.add(BASE_ROLE);
  const ordered = ASSIGNABLE_ROLES.map((r) => r.code).filter((c) => codes.has(c));
  const extra = [...codes].filter((c) => !ASSIGNABLE_ROLES.some((r) => r.code === c));
  return [...ordered, ...extra];
}

export interface Department {
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  headUserId: number | null;
  headUserName: string | null;
  isActive: boolean;
  employeeCount: number;
}

export interface SaveDepartmentRequest {
  departmentCode: string;
  departmentName: string;
  headUserId: number | null;
  isActive: boolean;
}

export interface Location {
  locationId: number;
  parentLocationId: number | null;
  parentLocationName: string | null;
  locationCode: string;
  locationName: string;
  locationType: string;
  isRestricted: boolean;
  isActive: boolean;
  timeZone: string | null;
  path: string | null;
  /** Legacy field; card readers are no longer managed in the UI. */
  readerCount?: number;
}

export interface SaveLocationRequest {
  parentLocationId: number | null;
  locationCode: string;
  locationName: string;
  locationType: string;
  isRestricted: boolean;
  isActive: boolean;
  timeZone: string | null;
}

export const LOCATION_TYPES = ['Campus', 'Building', 'Floor', 'Wing', 'Zone'] as const;
/** Mirrors the API's code rule: letters, digits, '-' and '_'. */
export const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
