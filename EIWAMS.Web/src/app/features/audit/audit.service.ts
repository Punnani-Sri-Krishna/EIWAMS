import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AuditLog } from './audit.models';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly api = inject(ApiService);

  /** Query: page, pageSize, search, sortBy, sortDir, from, to, actorUserId, action, entityType, entityId. */
  search(query: QueryParams): Observable<PagedResult<AuditLog>> {
    return this.api.getPaged<AuditLog>('v1/audit-logs', query);
  }

  timeline(entityType: string, entityId: string): Observable<AuditLog[]> {
    return this.api.get<AuditLog[]>('v1/audit-logs/timeline', { entityType, entityId });
  }
}
