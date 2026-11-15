import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ApiError } from '../../core/models/api.models';
import { cleanParams } from '../approvals/kit/feature-kit';
import { EmployeesService } from './employees.service';

describe('EmployeesService', () => {
  let service: EmployeesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EmployeesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the paged employee list with only the non-empty filters', () => {
    let total = -1;
    service
      .search(cleanParams({ page: 2, pageSize: 50, search: 'ann', departmentId: 3, employmentStatus: '', sortBy: 'fullName', sortDir: 'asc', locationId: null }))
      .subscribe((r) => (total = r.totalCount));

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/employees'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('50');
    expect(req.request.params.get('search')).toBe('ann');
    expect(req.request.params.get('departmentId')).toBe('3');
    expect(req.request.params.get('sortBy')).toBe('fullName');
    expect(req.request.params.has('employmentStatus')).toBe(false);
    expect(req.request.params.has('locationId')).toBe(false);
    req.flush({ success: true, message: 'OK', data: { items: [], totalCount: 7, page: 2, pageSize: 50 } });
    expect(total).toBe(7);
  });

  it('posts transfers to the employee transfer endpoint and surfaces API errors with the correlation id', () => {
    let error: ApiError | undefined;
    service
      .transfer(42, { departmentId: 1, managerEmployeeId: null, locationId: 2, effectiveDate: '2026-01-31', reason: 'Team move' })
      .subscribe({ error: (e: ApiError) => (error = e) });

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/employees/42/transfer'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ departmentId: 1, managerEmployeeId: null, locationId: 2, effectiveDate: '2026-01-31', reason: 'Team move' });
    req.flush(
      { success: false, message: 'Validation failed.', errors: ["'reason' is required."], correlationId: 'abc-123' },
      { status: 400, statusText: 'Bad Request' },
    );
    expect(error?.status).toBe(400);
    expect(error?.correlationId).toBe('abc-123');
  });
});
