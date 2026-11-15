import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Lookups, PagedResult } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import {
  AdminUser,
  AdminUserQuery,
  Department,
  Location,
  Reader,
  Role,
  RolePermission,
  SaveAdminUserRequest,
  SaveDepartmentRequest,
  SaveLocationRequest,
  SaveReaderRequest,
  Setting,
} from './admin.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  lookups(): Observable<Lookups> {
    return this.api.get<Lookups>('v1/lookups');
  }

  users(query: AdminUserQuery): Observable<PagedResult<AdminUser>> {
    return this.api.getPaged<AdminUser>('v1/admin/users', { ...query });
  }

  createUser(body: SaveAdminUserRequest): Observable<AdminUser> {
    return this.api.post<AdminUser>('v1/admin/users', body);
  }

  updateUser(id: number, body: SaveAdminUserRequest): Observable<AdminUser> {
    return this.api.put<AdminUser>(`v1/admin/users/${id}`, body);
  }

  roles(): Observable<Role[]> {
    return this.api.get<Role[]>('v1/admin/roles');
  }

  rolePermissions(roleId: number): Observable<RolePermission[]> {
    return this.api.get<RolePermission[]>(`v1/admin/roles/${roleId}/permissions`);
  }

  setRolePermissions(roleId: number, permissionIds: number[]): Observable<RolePermission[]> {
    return this.api.put<RolePermission[]>(`v1/admin/roles/${roleId}/permissions`, { permissionIds });
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

  readers(): Observable<Reader[]> {
    return this.api.get<Reader[]>('v1/readers');
  }

  createReader(body: SaveReaderRequest): Observable<Reader> {
    return this.api.post<Reader>('v1/readers', body);
  }

  updateReader(readerId: string, body: SaveReaderRequest): Observable<Reader> {
    return this.api.put<Reader>(`v1/readers/${encodeURIComponent(readerId)}`, body);
  }

  settings(): Observable<Setting[]> {
    return this.api.get<Setting[]>('v1/admin/settings');
  }

  updateSetting(settingKey: string, settingValue: string): Observable<Setting> {
    return this.api.put<Setting>('v1/admin/settings', { settingKey, settingValue });
  }
}
