import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AccessRequest, AccessRequestDetail, CreateAccessRequestBody, UpdateAccessRequestBody } from './access-requests.models';

@Injectable({ providedIn: 'root' })
export class AccessRequestsService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<AccessRequest>> {
    return this.api.getPaged<AccessRequest>('v1/access-requests', query);
  }

  get(id: number): Observable<AccessRequestDetail> {
    return this.api.get<AccessRequestDetail>(`v1/access-requests/${id}`);
  }

  create(body: CreateAccessRequestBody): Observable<AccessRequestDetail> {
    return this.api.post<AccessRequestDetail>('v1/access-requests', body);
  }

  update(id: number, body: UpdateAccessRequestBody): Observable<AccessRequestDetail> {
    return this.api.put<AccessRequestDetail>(`v1/access-requests/${id}`, body);
  }

  submit(id: number, version: string | null): Observable<AccessRequestDetail> {
    return this.api.post<AccessRequestDetail>(`v1/access-requests/${id}/submit`, { version });
  }

  cancel(id: number, reason: string, version: string | null): Observable<AccessRequestDetail> {
    return this.api.post<AccessRequestDetail>(`v1/access-requests/${id}/cancel`, { reason, version });
  }
}
