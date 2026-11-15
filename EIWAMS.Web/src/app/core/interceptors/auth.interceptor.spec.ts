import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthConfigService } from '../auth/auth-config.service';
import { DEV_USER_KEY } from '../auth/auth.service';
import { SessionService } from '../services/session.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor (DevHeader mode)', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    sessionStorage.setItem(DEV_USER_KEY, '42');
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    TestBed.inject(AuthConfigService).config.set({
      mode: 'DevHeader', tenantId: null, spaClientId: null, apiScope: null, authority: null,
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    ctrl.verify();
    sessionStorage.removeItem(DEV_USER_KEY);
  });

  it('adds X-User-Id and X-Correlation-Id to API requests', () => {
    http.get('/api/v1/me').subscribe();
    const req = ctrl.expectOne('/api/v1/me');
    expect(req.request.headers.get('X-User-Id')).toBe('42');
    expect(req.request.headers.get('X-Correlation-Id')).toBeTruthy();
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('leaves non-API requests untouched', () => {
    http.get('/assets/logo.svg').subscribe();
    const req = ctrl.expectOne('/assets/logo.svg');
    expect(req.request.headers.has('X-User-Id')).toBe(false);
    expect(req.request.headers.has('X-Correlation-Id')).toBe(false);
    req.flush('');
  });

  it('clears the session and redirects to login on 401', () => {
    const session = TestBed.inject(SessionService);
    const clear = vi.spyOn(session, 'clear');
    http.get('/api/v1/me').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(clear).toHaveBeenCalled();
    expect(sessionStorage.getItem(DEV_USER_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
