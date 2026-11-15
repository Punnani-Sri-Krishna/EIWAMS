import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AccessPermission } from './permissions.models';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<AccessPermission>> {
    return this.api.getPaged<AccessPermission>('v1/permissions', query);
  }

  /** Provision an access permission from an Approved access request (returns 201; 409 when not yet approved). */
  provision(accessRequestId: number): Observable<AccessPermission> {
    return this.api.post<AccessPermission>('v1/permissions/provision', { accessRequestId });
  }

  revoke(permissionId: number, reason: string): Observable<AccessPermission> {
    return this.api.post<AccessPermission>(`v1/permissions/${permissionId}/revoke`, { reason });
  }
}
