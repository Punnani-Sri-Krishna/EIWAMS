import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { Lookups, PagedResult } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import {
  AdminUser,
  AdminUserQuery,
  Department,
  EmployeeRoleRow,
  Location,
  SaveDepartmentRequest,
  SaveLocationRequest,
  UpdateEmployeeRolesRequest,
  normaliseRoles,
} from './admin.models';

/** Employee fields used to prefill the edit dialog when the list row does not carry them. */
export interface EmployeeOrgDetails {
  departmentId: number | null;
  managerEmployeeId: number | null;
  designation: string | null;
  locationId: number | null;
}

/**
 * Maps a raw list/save row to the "Employees & roles" row. Returns null for accounts with no employee record
 * (nothing to save by employee). Keep all payload knowledge in this file.
 */
export function toEmployeeRoleRow(u: AdminUser): EmployeeRoleRow | null {
  if (u.employeeId == null) {
    return null;
  }
  return {
    employeeId: u.employeeId,
    userId: u.userId ?? null,
    displayName: u.displayName || u.fullName || u.employeeNumber || `Employee #${u.employeeId}`,
    email: u.email || u.workEmail || '',
    employeeNumber: u.employeeNumber ?? null,
    departmentId: u.departmentId ?? null,
    departmentName: u.departmentName ?? null,
    managerEmployeeId: u.managerEmployeeId ?? null,
    managerName: u.managerName ?? null,
    designation: u.designation ?? null,
    locationId: u.locationId ?? null,
    locationName: u.locationName ?? null,
    roles: normaliseRoles(u.roles ?? u.roleNames ?? []),
    isActive: u.isActive,
    lastLoginAtUtc: u.lastLoginAtUtc ?? null,
  };
}

const isRow = (r: EmployeeRoleRow | null): r is EmployeeRoleRow => r !== null;

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  lookups(): Observable<Lookups> {
    return this.api.get<Lookups>('v1/lookups');
  }

  /**
   * Employees with their roles (server-paged), including employees that have no sign-in account yet
   * (`userId: null`). Account-only rows without an employee record are dropped.
   */
  employeeRoles(query: AdminUserQuery): Observable<PagedResult<EmployeeRoleRow>> {
    return this.api
      .getPaged<AdminUser>('v1/admin/users', { ...query })
      .pipe(map((res) => ({ ...res, items: (res?.items ?? []).map(toEmployeeRoleRow).filter(isRow) })));
  }

  /** Organisation fields of a linked employee (`GET v1/employees/{id}`), used when the list row lacks them. */
  employeeOrg(employeeId: number): Observable<EmployeeOrgDetails> {
    return this.api.get<Partial<EmployeeOrgDetails>>(`v1/employees/${employeeId}`).pipe(
      map((e) => ({
        departmentId: e?.departmentId ?? null,
        managerEmployeeId: e?.managerEmployeeId ?? null,
        designation: e?.designation ?? null,
        locationId: e?.locationId ?? null,
      })),
    );
  }

  /**
   * Assigns roles and organisation fields by employee (`PUT v1/admin/employees/{employeeId}`). The API links the
   * employee's account or creates one when absent, so no userId is sent. Resolves to the saved row when returned.
   */
  updateEmployeeRoles(employeeId: number, body: UpdateEmployeeRolesRequest): Observable<EmployeeRoleRow | null> {
    return this.api
      .put<AdminUser | null>(`v1/admin/employees/${employeeId}`, { ...body, roles: normaliseRoles(body.roles) })
      .pipe(
        map((u) =>
          u && typeof u === 'object' ? toEmployeeRoleRow({ ...u, employeeId: u.employeeId ?? employeeId }) : null,
        ),
      );
  }

  departments(): Observable<Department[]> {
    return this.api.get<Department[]>('v1/departments');
  }

  saveDepartment(id: number | null, body: SaveDepartmentRequest): Observable<Department> {
    return id == null
      ? this.api.post<Department>('v1/departments', body)
      : this.api.put<Department>(`v1/departments/${id}`, body);
  }

  locations(): Observable<Location[]> {
    return this.api.get<Location[]>('v1/locations');
  }

  saveLocation(id: number | null, body: SaveLocationRequest): Observable<Location> {
    return id == null
      ? this.api.post<Location>('v1/locations', body)
      : this.api.put<Location>(`v1/locations/${id}`, body);
  }
}
