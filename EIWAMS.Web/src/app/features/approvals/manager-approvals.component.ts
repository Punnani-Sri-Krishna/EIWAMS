import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { SessionService } from '../../core/services/session.service';
import { CardQueueComponent } from '../card-requests/card-queue.component';
import { ApprovalQueueComponent } from './approval-queue.component';

/** "Manager approvals" tab: team card requests and access requests at stage Manager. */
@Component({
  selector: 'eiw-manager-approvals',
  imports: [MatIconModule, CardQueueComponent, ApprovalQueueComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .queue-title { display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 1.05rem; font-weight: 600; }
    .queue + .queue { margin-top: 28px; }
  `,
  template: `
    <section class="queue" aria-labelledby="mgr-cards">
      <h2 class="queue-title" id="mgr-cards"><mat-icon aria-hidden="true">badge</mat-icon>ID card requests</h2>
      <eiw-card-queue stage="Manager" [embedded]="true" emptyText="No ID card requests are waiting for your approval." />
    </section>
    @if (canDecideAccess) {
      <section class="queue" aria-labelledby="mgr-access">
        <h2 class="queue-title" id="mgr-access"><mat-icon aria-hidden="true">vpn_key</mat-icon>Access requests</h2>
        <eiw-approval-queue stage="Manager" [embedded]="true" />
      </section>
    }
  `,
})
export class ManagerApprovalsComponent {
  readonly canDecideAccess = inject(SessionService).hasPermission('Approvals.Decide');
}
