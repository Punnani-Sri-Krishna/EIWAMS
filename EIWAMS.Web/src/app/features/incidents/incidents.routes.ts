import { Routes } from '@angular/router';

import { requirePermission } from '../approvals/kit/feature-kit';
import { IncidentDetailComponent } from './incident-detail.component';
import { IncidentFormComponent } from './incident-form.component';
import { IncidentListComponent } from './incident-list.component';

const routes: Routes = [
  { path: '', component: IncidentListComponent, title: 'Security incidents' },
  { path: 'new', component: IncidentFormComponent, title: 'New incident', canActivate: [requirePermission('Incidents.Manage', '/incidents')] },
  { path: ':id', component: IncidentDetailComponent, title: 'Incident' },
];

export default routes;
