import { Routes } from '@angular/router';

import { requirePermission } from '../approvals/kit/feature-kit';
import { EmployeeDetailComponent } from './employee-detail.component';
import { EmployeeFormComponent } from './employee-form.component';
import { EmployeeListComponent } from './employee-list.component';

const routes: Routes = [
  { path: '', component: EmployeeListComponent, title: 'Employees' },
  { path: 'new', component: EmployeeFormComponent, title: 'New employee', canActivate: [requirePermission('Employees.Manage', '/employees')] },
  { path: ':id', component: EmployeeDetailComponent, title: 'Employee' },
  { path: ':id/edit', component: EmployeeFormComponent, title: 'Edit employee', canActivate: [requirePermission('Employees.Manage', '/employees')] },
];

export default routes;
