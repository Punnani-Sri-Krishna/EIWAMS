import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';
import { AccessRequestDetailComponent } from './access-request-detail.component';
import { AccessRequestFormComponent } from './access-request-form.component';

const guard = (...permissions: string[]) => ({ canActivate: [permissionGuard], data: { permissions } });

/** Access requests (contract §7): the list lives on My Requests (`/my-requests?tab=access`). */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/my-requests?tab=access' },
  { path: 'new', component: AccessRequestFormComponent, title: 'Raise access request | EIWAMS', ...guard('AccessRequests.Create') },
  {
    path: ':id',
    component: AccessRequestDetailComponent,
    title: 'Access request | EIWAMS',
    ...guard('AccessRequests.View', 'Approvals.Decide', 'Approvals.Team'),
  },
  { path: ':id/edit', component: AccessRequestFormComponent, title: 'Edit access request | EIWAMS', ...guard('AccessRequests.Create') },
];

export default routes;