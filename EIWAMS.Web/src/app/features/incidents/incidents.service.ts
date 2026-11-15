import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { CreateIncidentBody, Incident, IncidentDetail, UpdateIncidentBody } from './incidents.models';

@Injectable({ providedIn: 'root' })
export class IncidentsService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<Incident>> {
    return this.api.getPaged<Incident>('v1/incidents', query);
  }

  get(id: number): Observable<IncidentDetail> {
    return this.api.get<IncidentDetail>(`v1/incidents/${id}`);
  }

  create(body: CreateIncidentBody): Observable<Incident> {
    return this.api.post<Incident>('v1/incidents', body);
  }

  /** Returns the updated incident including its notes. */
  update(id: number, body: UpdateIncidentBody): Observable<IncidentDetail> {
    return this.api.patch<IncidentDetail>(`v1/incidents/${id}`, body);
  }
}
