export interface EmployeeListItem {
  employeeId: number;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  workEmail: string;
  employeeType: string;
  departmentId: number;
  departmentName: string | null;
  managerEmployeeId: number | null;
  managerName: string | null;
  locationId: number;
  locationName: string | null;
  employmentStatus: string;
  joinDate: string;
  endDate: string | null;
  activeCardCount: number;
}

export interface EmployeeDetail extends EmployeeListItem {
  userId: number | null;
  activePermissionCount: number;
  openAccessRequestCount: number;
  createdAtUtc: string;
  updatedAtUtc: string | null;
  version: string | null;
}

export interface EmployeeHistory {
  historyId: number;
  changeType: string;
  summary: string | null;
  effectiveDate: string | null;
  changedByName: string | null;
  changedAtUtc: string;
}

export interface SaveEmployeeRequest {
  employeeNumber?: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  employeeType: string;
  departmentId: number;
  managerEmployeeId: number | null;
  locationId: number;
  joinDate: string;
  endDate: string | null;
  userId?: number | null;
  version?: string | null;
}

export interface TransferEmployeeRequest {
  departmentId: number;
  managerEmployeeId: number | null;
  locationId: number;
  effectiveDate: string;
  reason: string;
}

export interface DeactivateEmployeeRequest {
  employmentStatus: string;
  endDate: string;
  reason: string;
}

export const DEACTIVATION_STATUSES = ['Exited', 'Inactive'];
