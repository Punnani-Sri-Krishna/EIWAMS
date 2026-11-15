import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { permissionGuard } from './core/auth/permission.guard';
import { ShellComponent } from './layout/shell/shell.component';

const guarded = (path: string, permissions: string[], load: Routes[number]['loadChildren']): Routes[number] => ({
  path,
  canActivate: [permissionGuard],
  data: { permissions },
  loadChildren: load,
});

export const routes: Routes = [
  { path: 'login', title: 'Sign in | EIWAMS', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
  {
    path: 'unauthorized',
    title: 'Access denied | EIWAMS',
    loadComponent: () => import('./features/errors/unauthorized.component').then((m) => m.UnauthorizedComponent),
  },
  {
    path: '',
    component: ShellComponent,
    title: 'EIWAMS',
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Dashboard.View'] },
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      { path: 'profile', title: 'My profile | EIWAMS', loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent) },
      {
        path: 'notifications',
        title: 'Notifications | EIWAMS',
        loadComponent: () => import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
      },
      guarded('employees', ['Employees.View', 'Employees.ViewAll'], () => import('./features/employees/employees.routes')),
      guarded('cards', ['Cards.View', 'Cards.ViewAll'], () => import('./features/cards/cards.routes')),
      guarded('access-requests', ['AccessRequests.View', 'AccessRequests.ViewAll'], () => import('./features/access-requests/access-requests.routes')),
      guarded('approvals', ['Approvals.Decide'], () => import('./features/approvals/approvals.routes')),
      guarded('permissions', ['Permissions.View'], () => import('./features/permissions/permissions.routes')),
      guarded('rfid-monitor', ['Rfid.View'], () => import('./features/rfid-monitor/rfid-monitor.routes')),
      guarded('violations', ['Violations.View'], () => import('./features/violations/violations.routes')),
      guarded('incidents', ['Incidents.View'], () => import('./features/incidents/incidents.routes')),
      guarded('blacklist', ['Blacklist.View'], () => import('./features/blacklist/blacklist.routes')),
      guarded('visitors', ['Visitors.View'], () => import('./features/visitors/visitors.routes')),
      guarded('reports', ['Reports.View'], () => import('./features/reports/reports.routes')),
      guarded('audit', ['Audit.View'], () => import('./features/audit/audit.routes')),
      { path: 'admin', loadChildren: () => import('./features/admin/admin.routes') },
    ],
  },
  {
    path: '**',
    title: 'Not found | EIWAMS',
    loadComponent: () => import('./features/errors/not-found.component').then((m) => m.NotFoundComponent),
  },
];
