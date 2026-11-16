import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EmployeeRoleRow } from './admin.models';
import { AdminService } from './admin.service';

describe('AdminService employees & roles', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('saves an unlinked employee by employeeId without sending a userId and maps the created account', () => {
    let saved: EmployeeRoleRow | null | undefined;
    service
      .updateEmployeeRoles(15, {
        roles: ['IdCardTeam'],
        managerEmployeeId: 4,
        departmentId: 2,
        designation: 'Card officer',
        locationId: 9,
        isActive: true,
      })
      .subscribe((r) => (saved = r));

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/admin/employees/15'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      roles: ['Employee', 'IdCardTeam'],
      managerEmployeeId: 4,
      departmentId: 2,
      designation: 'Card officer',
      locationId: 9,
      isActive: true,
    });
    expect('userId' in req.request.body).toBe(false);

    req.flush({
      success: true,
      message: 'OK',
      data: {
        employeeId: 15,
        userId: 31,
        fullName: 'Ravi Kumar',
        workEmail: 'ravi@example.com',
        employeeNumber: 'E015',
        isActive: true,
        roles: ['Employee', 'IdCardTeam'],
        departmentId: 2,
        locationId: 9,
      },
    });
    expect(saved).toMatchObject({
      employeeId: 15,
      userId: 31,
      displayName: 'Ravi Kumar',
      email: 'ravi@example.com',
      roles: ['Employee', 'IdCardTeam'],
    });
  });

  it('lists employees without accounts and drops account-only rows', () => {
    let rows: EmployeeRoleRow[] = [];
    service.employeeRoles({ page: 1, pageSize: 20 }).subscribe((r) => (rows = r.items));

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/admin/users'));
    req.flush({
      success: true,
      message: 'OK',
      data: {
        items: [
          { employeeId: 15, userId: null, displayName: 'Ravi Kumar', email: null, employeeNumber: 'E015', isActive: true },
          { employeeId: null, userId: 2, displayName: 'Service account', email: 'svc@example.com', employeeNumber: null, isActive: true },
        ],
        totalCount: 2,
        page: 1,
        pageSize: 20,
      },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employeeId: 15, userId: null, email: '', roles: ['Employee'] });
  });

  it('accepts an empty save response', () => {
    let saved: EmployeeRoleRow | null | undefined;
    service
      .updateEmployeeRoles(15, { roles: [], managerEmployeeId: null, departmentId: 2, designation: null, locationId: 9, isActive: true })
      .subscribe((r) => (saved = r));
    http.expectOne((r) => r.url.endsWith('/api/v1/admin/employees/15')).flush({ success: true, message: 'OK', data: null });
    expect(saved).toBeNull();
  });
});
