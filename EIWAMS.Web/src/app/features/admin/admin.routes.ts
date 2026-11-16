import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';
import { DepartmentsComponent } from './departments.component';
import { EmployeesRolesComponent } from './employees-roles.component';
import { LocationsComponent } from './locations.component';

/** Admin: Employees & roles, Locations, Departments (SIMPLIFY-SPEC §B). */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'employees' },
  {
    path: 'employees',
    component: EmployeesRolesComponent,
    title: 'Employees & roles | EIWAMS',
    canActivate: [permissionGuard],
    data: { permissions: ['Users.Manage'] },
  },
  { path: 'users', redirectTo: 'employees' },
  {
    path: 'departments',
    component: DepartmentsComponent,
    title: 'Departments | EIWAMS',
    canActivate: [permissionGuard],
    data: { permissions: ['Reference.Manage'] },
  },
  {
    path: 'locations',
    component: LocationsComponent,
    title: 'Locations | EIWAMS',
    canActivate: [permissionGuard],
    data: { permissions: ['Reference.Manage'] },
  },
];

export default routes;
