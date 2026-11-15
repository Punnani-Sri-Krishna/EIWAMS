export interface AdminUser {
  userId: number;
  displayName: string;
  email: string;
  entraObjectId: string | null;
  isActive: boolean;
  allFacilities: boolean;
  roleIds: number[];
  roleNames: string[];
  facilityIds: number[];
  facilityNames: string[];
  employeeId: number | null;
  employeeNumber: string | null;
  lastLoginAtUtc: string | null;
}

export interface SaveAdminUserRequest {
  displayName: string;
  email: string;
  entraObjectId: string | null;
  isActive: boolean;
  allFacilities: boolean;
  roleIds: number[];
  facilityIds: number[];
  employeeId: number | null;
}

export interface AdminUserQuery {
  page: number;
  pageSize: number;
  search?: string;
  isActive?: boolean | null;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface Role {
  roleId: number;
  roleName: string;
  description: string | null;
  isSystem: boolean;
  userCount: number;
  permissionCount: number;
}

export interface RolePermission {
  permissionId: number;
  code: string;
  module: string;
  description: string | null;
  granted: boolean;
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
  readerCount: number;
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

export interface Reader {
  readerId: string;
  readerName: string;
  locationId: number;
  locationName: string | null;
  direction: string;
  isActive: boolean;
  lastSeenAtUtc: string | null;
}

export interface SaveReaderRequest {
  readerId: string;
  readerName: string;
  locationId: number;
  direction: string;
  isActive: boolean;
}

export interface Setting {
  settingKey: string;
  settingValue: string | null;
  description: string | null;
  dataType: string | null;
}

export const LOCATION_TYPES = ['Campus', 'Building', 'Floor', 'Zone'] as const;
export const READER_DIRECTIONS = ['In', 'Out', 'Both'] as const;
/** Mirrors the API's code rule: letters, digits, '-' and '_'. */
export const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;
export const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
