import { Routes } from '@angular/router';

import { requirePermission } from '../approvals/kit/feature-kit';
import { AccessRequestDetailComponent } from './access-request-detail.component';
import { AccessRequestFormComponent } from './access-request-form.component';
import { AccessRequestListComponent } from './access-request-list.component';

const canCreate = requirePermission('AccessRequests.Create', '/access-requests');

const routes: Routes = [
  { path: '', component: AccessRequestListComponent, title: 'Access requests' },
  { path: 'new', component: AccessRequestFormComponent, title: 'New access request', canActivate: [canCreate] },
  { path: ':id', component: AccessRequestDetailComponent, title: 'Access request' },
  { path: ':id/edit', component: AccessRequestFormComponent, title: 'Edit access request', canActivate: [canCreate] },
];

export default routes;
