import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { Lookups, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { ReportResult } from './reports.models';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly api = inject(ApiService);
  private lookups$?: Observable<Lookups>;

  run(name: string, query: QueryParams): Observable<ReportResult> {
    return this.api.get<ReportResult>(`v1/reports/${encodeURIComponent(name)}`, query);
  }

  exportCsv(name: string, query: QueryParams): Observable<void> {
    return this.api.download(`v1/reports/${encodeURIComponent(name)}/export`, query, `${name}.csv`);
  }

  lookups(): Observable<Lookups> {
    this.lookups$ ??= this.api.get<Lookups>('v1/lookups').pipe(shareReplay({ bufferSize: 1, refCount: false }));
    return this.lookups$;
  }
}
