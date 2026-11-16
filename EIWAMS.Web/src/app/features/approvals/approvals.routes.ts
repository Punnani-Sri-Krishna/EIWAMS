import { inject } from '@angular/core';
import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';
import { approvalTabs } from '../../core/navigation/nav';
import { SessionService } from '../../core/services/session.service';
import { CardQueueComponent } from '../card-requests/card-queue.component';
import { ApprovalQueueComponent } from './approval-queue.component';
import { ApprovalsHubComponent } from './approvals-hub.component';
import { ManagerApprovalsComponent } from './manager-approvals.component';
import { TeamRequestsComponent } from './team-requests.component';

/** `/approvals` opens the first queue the user owns. */
const firstTab = () => {
  const session = inject(SessionService);
  const tab = approvalTabs({ has: (p) => session.hasPermission(p), roles: session.user()?.roles ?? [] })[0];
  return tab?.route ?? '/unauthorized';
};

/** Approvals page: one tab per queue (route data feeds component inputs via withComponentInputBinding). */
const routes: Routes = [
  {
    path: '',
    component: ApprovalsHubComponent,
    title: 'Approvals | EIWAMS',
    children: [
      { path: '', pathMatch: 'full', redirectTo: firstTab },
      {
        path: 'manager',
        component: ManagerApprovalsComponent,
        title: 'Manager approvals | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Cards.ManagerApprove'] },
      },
      {
        path: 'team',
        component: TeamRequestsComponent,
        title: 'Team requests | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Approvals.Team'], embedded: true },
      },
      {
        path: 'hr',
        component: CardQueueComponent,
        title: 'HR verification | EIWAMS',
        canActivate: [permissionGuard],
        data: {
          permissions: ['Cards.HrVerify'],
          stage: 'HR',
          embedded: true,
          emptyText: 'No ID card requests are waiting for HR verification.',
        },
      },
      {
        path: 'security',
        component: CardQueueComponent,
        title: 'Security approvals | EIWAMS',
        canActivate: [permissionGuard],
        data: {
          permissions: ['Cards.SecurityReview'],
          stage: 'Security',
          embedded: true,
          emptyText: 'No lost-card requests are waiting for security review.',
        },
      },
      {
        path: 'access',
        component: ApprovalQueueComponent,
        title: 'Access requests review | EIWAMS',
        canActivate: [permissionGuard],
        data: { permissions: ['Approvals.Decide'], embedded: true },
      },
    ],
  },
];

export default routes;
