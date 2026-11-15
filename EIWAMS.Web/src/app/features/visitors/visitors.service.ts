import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { CreateVisitorBody, CreateVisitorPassBody, Visitor, VisitorPass } from './visitors.models';

@Injectable({ providedIn: 'root' })
export class VisitorsService {
  private readonly api = inject(ApiService);

  visitors(query: QueryParams): Observable<PagedResult<Visitor>> {
    return this.api.getPaged<Visitor>('v1/visitors', query);
  }

  createVisitor(body: CreateVisitorBody): Observable<Visitor> {
    return this.api.post<Visitor>('v1/visitors', body);
  }

  passes(query: QueryParams): Observable<PagedResult<VisitorPass>> {
    return this.api.getPaged<VisitorPass>('v1/visitor-passes', query);
  }

  createPass(body: CreateVisitorPassBody): Observable<VisitorPass> {
    return this.api.post<VisitorPass>('v1/visitor-passes', body);
  }

  approve(id: number, comments?: string | null): Observable<VisitorPass> {
    return this.api.post<VisitorPass>(`v1/visitor-passes/${id}/approve`, comments ? { comments } : {});
  }

  checkIn(id: number): Observable<VisitorPass> {
    return this.api.post<VisitorPass>(`v1/visitor-passes/${id}/check-in`, {});
  }

  checkOut(id: number): Observable<VisitorPass> {
    return this.api.post<VisitorPass>(`v1/visitor-passes/${id}/check-out`, {});
  }

  revoke(id: number, reason: string): Observable<VisitorPass> {
    return this.api.post<VisitorPass>(`v1/visitor-passes/${id}/revoke`, { reason });
  }
}
