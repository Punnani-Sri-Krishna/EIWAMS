import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';
import { PermissionListComponent } from './permission-list.component';
import { ProvisionQueueComponent } from './provision-queue.component';

const routes: Routes = [
  { path: '', component: PermissionListComponent, title: 'Access permissions | EIWAMS', canActivate: [permissionGuard], data: { permissions: ['Permissions.View'] } },
  {
    path: 'provision',
    component: ProvisionQueueComponent,
    title: 'Provision access | EIWAMS',
    canActivate: [permissionGuard],
    data: { permissions: ['Permissions.Provision'] },
  },
];

export default routes;