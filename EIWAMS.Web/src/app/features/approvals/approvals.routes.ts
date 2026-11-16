import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/permission.guard';
import { CardQueueComponent } from '../card-requests/card-queue.component';
import { ApprovalQueueComponent } from './approval-queue.component';
import { ManagerApprovalsComponent } from './manager-approvals.component';
import { TeamRequestsComponent } from './team-requests.component';

const guard = (...permissions: string[]) => ({ canActivate: [permissionGuard], data: { permissions } });

/** Approval queues (contract §7). Route data feeds component inputs (withComponentInputBinding). */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'access' },
  { path: 'manager', component: ManagerApprovalsComponent, title: 'Pending approvals | EIWAMS', ...guard('Cards.ManagerApprove') },
  { path: 'team', component: TeamRequestsComponent, title: 'Team requests | EIWAMS', ...guard('Approvals.Team') },
  {
    path: 'hr',
    component: CardQueueComponent,
    title: 'HR verification | EIWAMS',
    canActivate: [permissionGuard],
    data: {
      permissions: ['Cards.HrVerify'],
      stage: 'HR',
      title: 'HR verification queue',
      subtitle: 'Verify employee details for ID card requests approved by managers.',
      emptyText: 'No ID card requests are waiting for HR verification.',
    },
  },
  {
    path: 'id-card',
    component: CardQueueComponent,
    title: 'ID card processing | EIWAMS',
    canActivate: [permissionGuard],
    data: {
      permissions: ['Cards.Process'],
      stage: 'IdCardTeam',
      title: 'ID card processing queue',
      subtitle: 'Approve verified requests, mark cards as printed and issue them to employees.',
      emptyText: 'No ID card requests are waiting for processing.',
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
      title: 'Security approvals',
      subtitle: 'Review lost-card reports. Approving permanently deactivates the lost card.',
      emptyText: 'No lost-card requests are waiting for security review.',
    },
  },
  {
    path: 'access',
    component: ApprovalQueueComponent,
    title: 'Access requests review | EIWAMS',
    ...guard('Approvals.Decide'),
    data: { permissions: ['Approvals.Decide'], title: 'Access requests review' },
  },
];

export default routes;