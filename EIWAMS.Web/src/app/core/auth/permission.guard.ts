import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SessionService } from '../services/session.service';

/** Allows navigation when the user holds any permission listed in route `data.permissions`. */
export const permissionGuard: CanActivateFn = (route) => {
  const session = inject(SessionService);
  const required = (route.data?.['permissions'] as string[] | undefined) ?? [];
  return session.hasAny(required) ? true : inject(Router).createUrlTree(['/unauthorized']);
};
