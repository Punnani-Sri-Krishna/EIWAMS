import { Routes } from '@angular/router';

import { EmployeeDetailComponent } from './employee-detail.component';
import { EmployeeListComponent } from './employee-list.component';

const routes: Routes = [
  { path: '', component: EmployeeListComponent, title: 'Employees' },
  { path: 'new', pathMatch: 'full', redirectTo: '/employees' },
  { path: ':id/edit', redirectTo: '/employees/:id' },
  { path: ':id', pathMatch: 'full', component: EmployeeDetailComponent, title: 'Employee' },
];

export default routes;
