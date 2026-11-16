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

/** Approval queue permissions (any-of) for the Approvals page. */
const APPROVAL_PERMISSIONS = ['Cards.ManagerApprove', 'Approvals.Team', 'Cards.HrVerify', 'Cards.SecurityReview', 'Approvals.Decide'];

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
        title: 'Home | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Dashboard.View'] },
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'profile',
        title: 'My profile | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Dashboard.View'] },
        loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'notifications',
        title: 'Notifications | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Dashboard.View'] },
        loadComponent: () => import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
      },
      {
        path: 'my-requests',
        title: 'My requests | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Cards.View', 'AccessRequests.View'] },
        loadComponent: () => import('./features/my-requests/my-requests.component').then((m) => m.MyRequestsComponent),
      },
      {
        path: 'cards/requests/new',
        title: 'Raise ID card request | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Cards.Request'] },
        loadComponent: () => import('./features/card-requests/card-request-new.component').then((m) => m.CardRequestNewComponent),
      },
      {
        path: 'cards/requests/:id',
        title: 'ID card request | EIWAMS',
        canActivate: [permissionGuard],
        data: {
          permissions: [
            'Cards.View',
            'Cards.ViewAll',
            'Cards.ManagerApprove',
            'Cards.HrVerify',
            'Cards.SecurityReview',
            'Cards.Process',
            'Approvals.Team',
          ],
        },
        loadComponent: () => import('./features/card-requests/card-request-detail.component').then((m) => m.CardRequestDetailComponent),
      },
      { path: 'cards', pathMatch: 'full', redirectTo: 'my-requests' },
      {
        path: 'id-card-processing',
        title: 'ID card processing | EIWAMS',
        canActivate: [permissionGuard],
        data: {
          permissions: ['Cards.Process'],
          stage: 'IdCardTeam',
          title: 'ID card processing',
          subtitle: 'Approve verified requests, mark cards as printed and issue them.',
          emptyText: 'No ID card requests are waiting for processing.',
        },
        loadComponent: () => import('./features/card-requests/card-queue.component').then((m) => m.CardQueueComponent),
      },
      guarded('employees', ['Employees.View', 'Employees.ViewAll'], () => import('./features/employees/employees.routes')),
      guarded('access-requests', ['AccessRequests.View', 'AccessRequests.ViewAll', 'AccessRequests.Create', 'Approvals.Decide', 'Approvals.Team', 'Permissions.Provision'], () => import('./features/access-requests/access-requests.routes')),
      { path: 'approvals/id-card', redirectTo: 'id-card-processing' },
      {
        path: 'approvals',
        loadChildren: () => import('./features/approvals/approvals.routes'),
        data: { permissions: APPROVAL_PERMISSIONS },
        canActivate: [permissionGuard],
      },
      guarded('permissions', ['Permissions.Provision'], () => import('./features/permissions/permissions.routes')),
      { path: 'admin', loadChildren: () => import('./features/admin/admin.routes') },
    ],
  },
  {
    path: '**',
    title: 'Not found | EIWAMS',
    loadComponent: () => import('./features/errors/not-found.component').then((m) => m.NotFoundComponent),
  },
];
