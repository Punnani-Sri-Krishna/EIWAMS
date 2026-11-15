import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';

const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'users' },
  {
    path: 'users',
    title: 'Users',
    canActivate: [permissionGuard],
    data: { permissions: ['Users.Manage'] },
    loadComponent: () => import('./users.component').then((m) => m.UsersComponent),
  },
  {
    path: 'roles',
    title: 'Roles & permissions',
    canActivate: [permissionGuard],
    data: { permissions: ['Roles.Manage'] },
    loadComponent: () => import('./roles.component').then((m) => m.RolesComponent),
  },
  {
    path: 'departments',
    title: 'Departments',
    canActivate: [permissionGuard],
    data: { permissions: ['Reference.Manage'] },
    loadComponent: () => import('./departments.component').then((m) => m.DepartmentsComponent),
  },
  {
    path: 'locations',
    title: 'Locations',
    canActivate: [permissionGuard],
    data: { permissions: ['Reference.Manage'] },
    loadComponent: () => import('./locations.component').then((m) => m.LocationsComponent),
  },
  {
    path: 'readers',
    title: 'RFID readers',
    canActivate: [permissionGuard],
    data: { permissions: ['Reference.Manage'] },
    loadComponent: () => import('./readers.component').then((m) => m.ReadersComponent),
  },
  {
    path: 'settings',
    title: 'System settings',
    canActivate: [permissionGuard],
    data: { permissions: ['Settings.Manage'] },
    loadComponent: () => import('./settings.component').then((m) => m.SettingsComponent),
  },
];

export default routes;
