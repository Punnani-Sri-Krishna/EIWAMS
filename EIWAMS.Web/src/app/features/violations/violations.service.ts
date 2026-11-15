import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { Violation, ViolationReviewBody } from './violations.models';

@Injectable({ providedIn: 'root' })
export class ViolationsService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<Violation>> {
    return this.api.getPaged<Violation>('v1/violations', query);
  }

  review(violationId: number, body: ViolationReviewBody): Observable<Violation> {
    return this.api.post<Violation>(`v1/violations/${violationId}/review`, body);
  }
}
