import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PagedResult, QueryParams } from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import {
  Card,
  DeactivateEmployeeRequest,
  EmployeeDetail,
  EmployeeHistory,
  EmployeeListItem,
  SaveEmployeeRequest,
  TransferEmployeeRequest,
} from './employees.models';

@Injectable({ providedIn: 'root' })
export class EmployeesService {
  private readonly api = inject(ApiService);

  search(query: QueryParams): Observable<PagedResult<EmployeeListItem>> {
    return this.api.getPaged<EmployeeListItem>('v1/employees', query);
  }

  get(id: number): Observable<EmployeeDetail> {
    return this.api.get<EmployeeDetail>(`v1/employees/${id}`);
  }

  create(body: SaveEmployeeRequest): Observable<EmployeeDetail> {
    return this.api.post<EmployeeDetail>('v1/employees', body);
  }

  update(id: number, body: SaveEmployeeRequest): Observable<EmployeeDetail> {
    return this.api.put<EmployeeDetail>(`v1/employees/${id}`, body);
  }

  transfer(id: number, body: TransferEmployeeRequest): Observable<EmployeeDetail> {
    return this.api.post<EmployeeDetail>(`v1/employees/${id}/transfer`, body);
  }

  deactivate(id: number, body: DeactivateEmployeeRequest): Observable<EmployeeDetail> {
    return this.api.post<EmployeeDetail>(`v1/employees/${id}/deactivate`, body);
  }

  cards(id: number): Observable<Card[]> {
    return this.api.get<Card[]>(`v1/employees/${id}/cards`);
  }

  history(id: number): Observable<EmployeeHistory[]> {
    return this.api.get<EmployeeHistory[]>(`v1/employees/${id}/history`);
  }
}
