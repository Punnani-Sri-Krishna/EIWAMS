import { Routes } from '@angular/router';

import { ProvisionQueueComponent } from './provision-queue.component';

/** Access Provisioning (AccessControlTeam). The old permissions directory was removed. */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'provision' },
  { path: 'provision', component: ProvisionQueueComponent, title: 'Access provisioning | EIWAMS' },
];

export default routes;
