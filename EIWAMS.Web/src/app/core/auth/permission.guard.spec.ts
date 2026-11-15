import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { CurrentUser } from '../models/api.models';
import { SessionService } from '../services/session.service';
import { permissionGuard } from './permission.guard';

const user = (permissions: string[]): CurrentUser => ({
  userId: 1,
  displayName: 'Test User',
  email: 't@example.com',
  employeeId: null,
  employeeNumber: null,
  roles: [],
  permissions,
  allFacilities: false,
  facilityIds: [],
});

function run(required: string[] | undefined): boolean | UrlTree {
  const route = { data: required ? { permissions: required } : {} } as unknown as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(() => permissionGuard(route, {} as RouterStateSnapshot)) as boolean | UrlTree;
}

describe('permissionGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    TestBed.inject(SessionService).user.set(user(['Cards.View']));
  });

  it('allows when the user has any required permission', () => {
    expect(run(['Cards.ViewAll', 'Cards.View'])).toBe(true);
  });

  it('allows when no permissions are required', () => {
    expect(run(undefined)).toBe(true);
  });

  it('redirects to /unauthorized when permission is missing', () => {
    const result = run(['Audit.View']);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/unauthorized');
  });
});
