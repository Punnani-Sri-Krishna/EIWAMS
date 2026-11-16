import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { Notifier, PagedList } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { CARD_ACTION_META, CardRequest, CardRequestAction, CardRequestStage, cardReasonText } from './card-requests.models';
import { CardRequestsService } from './card-requests.service';

/** Row quick actions: primary + Reject are posted from the row (with its version); others open the detail page. */
export function queueRowActions(status: string): { quick: CardRequestAction[]; open: CardRequestAction | null } {
  switch (status) {
    case 'PendingManager':
    case 'PendingSecurity':
    case 'PendingIdCardTeam':
      return { quick: ['Approve', 'Reject'], open: null };
    case 'PendingHR':
      return { quick: ['Verify', 'Reject'], open: null };
    case 'Printing':
      return { quick: [], open: 'MarkPrinted' };
    case 'ReadyToIssue':
      return { quick: [], open: 'Issue' };
    default:
      return { quick: [], open: null };
  }
}

/** Card request work queue for one stage (`v1/card-requests/queue?stage=`). */
@Component({
  selector: 'eiw-card-queue',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule,
    MatInputModule, MatButtonModule, MatIconModule, MatTooltipModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class.page]="!embedded()">
      @if (!embedded()) {
        <header class="page-header">
          <div>
            <h1>{{ title() }}</h1>
            @if (subtitle()) {
              <p class="subtitle">{{ subtitle() }}</p>
            }
          </div>
          <div class="page-actions">
            <button mat-stroked-button type="button" (click)="list.load()"><mat-icon>refresh</mat-icon>Refresh</button>
          </div>
        </header>
      }

      <form class="filter-bar" (ngSubmit)="list.search()">
        <mat-form-field class="flex-grow-1" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput [formControl]="search" placeholder="Request number, employee name or number" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <button mat-flat-button type="submit">Apply</button>
        @if (embedded()) {
          <button mat-stroked-button type="button" (click)="list.load()"><mat-icon>refresh</mat-icon>Refresh</button>
        }
      </form>

      <div class="data-card">
        @if (list.loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="list.error()" (retry)="list.load()" />
        <div class="table-wrap">
          <table mat-table [dataSource]="list.items()" aria-label="Card requests in queue">
            <ng-container matColumnDef="request">
              <th mat-header-cell *matHeaderCellDef>Request</th>
              <td mat-cell *matCellDef="let r">
                <a [routerLink]="['/cards/requests', r.cardRequestId]">{{ r.requestNumber }}</a>
                <span class="cell-sub">{{ r.requestType }} card</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="employee">
              <th mat-header-cell *matHeaderCellDef>Employee</th>
              <td mat-cell *matCellDef="let r">
                {{ r.employeeName }} <span class="text-muted small">{{ r.employeeNumber }}</span>
                <span class="cell-sub">{{ r.designation || r.departmentName || '' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="reason">
              <th mat-header-cell *matHeaderCellDef>Reason</th>
              <td mat-cell *matCellDef="let r" class="text-truncate" style="max-width: 240px" [title]="reason(r)">{{ reason(r) || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r"><eiw-status [value]="r.status" kind="card-request" /></td>
            </ng-container>
            <ng-container matColumnDef="requested">
              <th mat-header-cell *matHeaderCellDef>Requested</th>
              <td mat-cell *matCellDef="let r" class="text-nowrap">{{ r.requestedAtUtc | date: 'mediumDate' }}
                <span class="cell-sub">{{ r.requestedAtUtc | date: 'shortTime' }}</span></td>
            </ng-container>
            <ng-container matColumnDef="lastAction">
              <th mat-header-cell *matHeaderCellDef>Last action</th>
              <td mat-cell *matCellDef="let r">
                @if (r.lastActionByName) {
                  {{ r.lastActionByName }}<span class="cell-sub">{{ r.lastActionAtUtc | date: 'short' }}</span>
                } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let r" class="text-nowrap text-end">
                @let row = rowActions(r.status);
                @for (a of row.quick; track a) {
                  @if (a === 'Reject') {
                    <button mat-button type="button" class="danger-action" (click)="decide(r, a)"><mat-icon>close</mat-icon>Reject</button>
                  } @else {
                    <button mat-flat-button type="button" (click)="decide(r, a)"><mat-icon>{{ meta[a].icon }}</mat-icon>{{ meta[a].label }}</button>
                  }
                }
                @if (row.open; as o) {
                  <a mat-flat-button [routerLink]="['/cards/requests', r.cardRequestId]" [matTooltip]="'Open the request to ' + meta[o].label.toLowerCase()">
                    <mat-icon>{{ meta[o].icon }}</mat-icon>{{ meta[o].label }}
                  </a>
                }
                <a mat-icon-button [routerLink]="['/cards/requests', r.cardRequestId]" [attr.aria-label]="'Open ' + r.requestNumber" matTooltip="Open">
                  <mat-icon>chevron_right</mat-icon>
                </a>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state [message]="emptyText()" icon="task_alt" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class CardQueueComponent implements OnInit {
  private readonly service = inject(CardRequestsService);
  private readonly notifier = inject(Notifier);

  readonly stage = input<CardRequestStage>('Manager');
  readonly title = input('Card requests');
  readonly subtitle = input<string | null>(null);
  readonly emptyText = input('Nothing is waiting for you in this queue.');
  readonly embedded = input(false);

  readonly meta = CARD_ACTION_META;
  readonly rowActions = queueRowActions;
  readonly search = new FormControl<string | null>(null);
  readonly columns = ['request', 'employee', 'reason', 'status', 'requested', 'lastAction', 'actions'];
  readonly list = new PagedList<CardRequest>((q) => this.service.queue(this.stage(), q), () => ({ search: this.search.value }));

  ngOnInit(): void {
    this.list.load();
  }

  reason(r: CardRequest): string {
    return cardReasonText(r);
  }

  decide(r: CardRequest, action: CardRequestAction): void {
    this.service.decideWithPrompt(r, action).subscribe({
      next: () => {
        this.notifier.success(`${r.requestNumber} ${CARD_ACTION_META[action].done}.`);
        this.list.load();
      },
      error: (err: unknown) => {
        this.notifier.error(err);
        this.list.load();
      },
    });
  }
}
