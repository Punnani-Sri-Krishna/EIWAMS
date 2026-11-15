import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AccessLog, RfidIngestBody, RfidIngestResult } from './rfid-monitor.models';

@Injectable({ providedIn: 'root' })
export class RfidMonitorService {
  private readonly api = inject(ApiService);

  events(query: QueryParams): Observable<PagedResult<AccessLog>> {
    return this.api.getPaged<AccessLog>('v1/rfid/events', query);
  }

  ingest(body: RfidIngestBody): Observable<RfidIngestResult> {
    return this.api.post<RfidIngestResult>('v1/rfid/events', body);
  }
}
