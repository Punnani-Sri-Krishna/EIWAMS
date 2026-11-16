export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors?: string[] | Record<string, string[]> | null;
  correlationId?: string | null;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface ApiError {
  status: number;
  message: string;
  errors: string[];
  correlationId?: string | null;
}

export interface CurrentUser {
  userId: number;
  displayName: string;
  email: string;
  employeeId: number | null;
  employeeNumber: string | null;
  designation?: string | null;
  departmentName?: string | null;
  managerName?: string | null;
  managerEmail?: string | null;
  locationName?: string | null;
  hasPhoto?: boolean;
  roles: string[];
  permissions: string[];
  allFacilities: boolean;
  facilityIds: number[];
}

export interface MenuItem {
  menuId: number;
  section: string;
  sectionOrder: number;
  label: string;
  icon: string;
  route: string;
  sortOrder: number;
}

export interface IdName {
  id: number;
  name: string;
}

export interface Lookups {
  departments: { id: number; code: string; name: string }[];
  locations: {
    id: number;
    code: string;
    name: string;
    locationType: string;
    parentLocationId: number | null;
    isRestricted: boolean;
  }[];
  employees: { id: number; name: string; employeeNumber: string }[];
  users: IdName[];
  readers: { id: string; name: string; locationId: number }[];
  employeeTypes: string[];
  employmentStatuses: string[];
  cardTypes: string[];
  cardStatuses: string[];
  cardRequestTypes: string[];
  cardRequestStatuses: string[];
  /** v2 lookups (optional so the UI degrades gracefully against an older API). */
  cardRequestTypesOffered?: string[];
  cardRequestStages?: string[];
  cardRequestActions?: string[];
  damagedReasons?: string[];
  bloodGroups?: string[];
  accessTypes?: string[];
  durationCodes?: string[];
  accessRequestStatuses: string[];
  approvalStages: string[];
  permissionStatuses: string[];
  eventTypes: string[];
  violationTypes: string[];
  violationStatuses: string[];
  severities: string[];
  incidentTypes: string[];
  incidentStatuses: string[];
  visitorPassStatuses: string[];
  locationTypes: string[];
}
