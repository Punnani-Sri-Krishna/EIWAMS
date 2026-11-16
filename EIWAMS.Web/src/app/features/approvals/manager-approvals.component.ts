import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

import { SessionService } from '../../core/services/session.service';
import { CardQueueComponent } from '../card-requests/card-queue.component';
import { ApprovalQueueComponent } from './approval-queue.component';

/** Pending Approvals (manager): card requests and access approvals at stage Manager. */
@Component({
  selector: 'eiw-manager-approvals',
  imports: [MatTabsModule, MatIconModule, CardQueueComponent, ApprovalQueueComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.tab-body { padding-top: 16px; } .tab-label { display: inline-flex; align-items: center; gap: 6px; }`,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Pending approvals</h1>
          <p class="subtitle">Requests from your team waiting for a manager decision. Rejecting requires a comment.</p>
        </div>
      </header>
      <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms" aria-label="Approval type">
        <mat-tab>
          <ng-template mat-tab-label><span class="tab-label"><mat-icon>badge</mat-icon>ID card requests</span></ng-template>
          <div class="tab-body">
            <eiw-card-queue stage="Manager" [embedded]="true" emptyText="No ID card requests are waiting for your approval." />
          </div>
        </mat-tab>
        @if (canDecideAccess) {
          <mat-tab>
            <ng-template mat-tab-label><span class="tab-label"><mat-icon>vpn_key</mat-icon>Access requests</span></ng-template>
            <ng-template matTabContent>
              <div class="tab-body"><eiw-approval-queue stage="Manager" [embedded]="true" /></div>
            </ng-template>
          </mat-tab>
        }
      </mat-tab-group>
    </section>
  `,
})
export class ManagerApprovalsComponent {
  readonly canDecideAccess = inject(SessionService).hasPermission('Approvals.Decide');
}
