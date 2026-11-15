import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { BlacklistEntry, CreateBlacklistBody } from './blacklist.models';

@Injectable({ providedIn: 'root' })
export class BlacklistService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<BlacklistEntry>> {
    return this.api.getPaged<BlacklistEntry>('v1/blacklist', query);
  }

  create(body: CreateBlacklistBody): Observable<BlacklistEntry> {
    return this.api.post<BlacklistEntry>('v1/blacklist', body);
  }

  lift(blacklistId: number, reason: string): Observable<BlacklistEntry> {
    return this.api.post<BlacklistEntry>(`v1/blacklist/${blacklistId}/lift`, { reason });
  }
}
