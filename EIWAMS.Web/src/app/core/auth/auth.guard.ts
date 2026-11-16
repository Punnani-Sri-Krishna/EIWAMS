import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { SessionService } from '../services/session.service';
import { AuthService } from './auth.service';

/** Requires a signed-in user and loads the profile (roles + permissions drive the navigation) before entering the shell. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const session = inject(SessionService);
  const router = inject(Router);
  const toLogin = router.createUrlTree(['/login']);

  if (!auth.isSignedIn()) {
    return toLogin;
  }
  if (session.user()) {
    return true;
  }
  return session.loadProfile().pipe(
    map(() => true),
    catchError(() => {
      auth.clearLocal();
      return of(toLogin);
    }),
  );
};
