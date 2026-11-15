import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Observable, filter } from 'rxjs';

import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, PagedList, humanize } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS, askReason } from '../approvals/kit/ui.components';
import { CardRequestDialogComponent, IssueCardDialogComponent, IssueCardDialogData, ReplaceCardDialogComponent } from './card-dialogs.component';
import { Card, CardAction, CardRequest, CardRequestDecision, cardActions, cardRequestDecisions } from './cards.models';
import { CardsService } from './cards.service';

@Component({
  selector: 'eiw-cards-page',
  imports: [
    ReactiveFormsModule, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatMenuModule, MatTabsModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Cards</h1>
        <div class="page-actions">
          @if (session.hasPermission('Cards.Request')) {
            <button mat-stroked-button type="button" (click)="newRequest()"><mat-icon>add_card</mat-icon>Request card</button>
          }
          @if (session.hasPermission('Cards.Issue')) {
            <button mat-flat-button type="button" (click)="issue({})"><mat-icon>contactless</mat-icon>Issue card</button>
          }
        </div>
      </header>

      <mat-tab-group animationDuration="0ms" (selectedIndexChange)="onTab($event)">
        <mat-tab label="Cards">
          <form class="filter-bar row g-2 align-items-center mt-2" [formGroup]="cardFilters" (ngSubmit)="cards.search()">
            <mat-form-field class="col-12 col-md-4" subscriptSizing="dynamic">
              <mat-label>Search</mat-label>
              <input matInput formControlName="search" placeholder="Employee name or number" />
            </mat-form-field>
            <mat-form-field class="col-6 col-md-3" subscriptSizing="dynamic">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                <mat-option [value]="null">All</mat-option>
                @for (s of lk.lookups()?.cardStatuses ?? []; track s) {
                  <mat-option [value]="s">{{ s }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field class="col-6 col-md-3" subscriptSizing="dynamic">
              <mat-label>Type</mat-label>
              <mat-select formControlName="cardType">
                <mat-option [value]="null">All</mat-option>
                @for (s of lk.lookups()?.cardTypes ?? []; track s) {
                  <mat-option [value]="s">{{ s }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="col-12 col-md-2 d-flex gap-1">
              <button mat-flat-button type="submit">Apply</button>
              <button mat-button type="button" (click)="cardFilters.reset(); cards.search()">Reset</button>
            </div>
          </form>
          <div class="data-card">
            @if (cards.loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <eiw-error-state [error]="cards.error()" (retry)="cards.load()" />
            <div class="table-wrap">
              <table mat-table [dataSource]="cards.items()" matSort (matSortChange)="cards.onSort($event)">
                <ng-container matColumnDef="maskedCardUid">
                  <th mat-header-cell *matHeaderCellDef>Card UID</th>
                  <td mat-cell *matCellDef="let c"><code>{{ c.maskedCardUid }}</code></td>
                </ng-container>
                <ng-container matColumnDef="employeeName">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
                  <td mat-cell *matCellDef="let c">{{ c.employeeName }} <span class="text-muted small">{{ c.employeeNumber }}</span></td>
                </ng-container>
                <ng-container matColumnDef="cardType">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let c">{{ c.cardType }}</td>
                </ng-container>
                <ng-container matColumnDef="issuedAtUtc">
                  <th mat-header-cell *matHeaderCellDef>Issued</th>
                  <td mat-cell *matCellDef="let c">{{ c.issuedAtUtc | date: 'mediumDate' }}</td>
                </ng-container>
                <ng-container matColumnDef="expiresAtUtc">
                  <th mat-header-cell *matHeaderCellDef>Expires</th>
                  <td mat-cell *matCellDef="let c">{{ c.expiresAtUtc ? (c.expiresAtUtc | date: 'mediumDate') : '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
                  <td mat-cell *matCellDef="let c">
                    <eiw-status [value]="c.status" />
                    @if (c.blockReason) {
                      <div class="text-muted small">{{ c.blockReason }}</div>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="sync">
                  <th mat-header-cell *matHeaderCellDef>Controller sync</th>
                  <td mat-cell *matCellDef="let c">{{ c.controllerSyncStatus ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
                  <td mat-cell *matCellDef="let c">
                    @if (actionsFor(c); as acts) {
                      @if (acts.length) {
                        <button mat-icon-button type="button" [matMenuTriggerFor]="menu" [attr.aria-label]="'Actions for card ' + c.maskedCardUid">
                          <mat-icon>more_vert</mat-icon>
                        </button>
                        <mat-menu #menu="matMenu">
                          @for (a of acts; track a) {
                            <button mat-menu-item type="button" (click)="run(a, c)">
                              <mat-icon>{{ actionIcon[a] }}</mat-icon>{{ actionLabel[a] }}
                            </button>
                          }
                        </mat-menu>
                      }
                    }
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cardColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: cardColumns"></tr>
              </table>
            </div>
            @if (cards.empty()) {
              <eiw-empty-state message="No cards match the current filters." icon="credit_card" />
            }
            <mat-paginator [length]="cards.total()" [pageIndex]="cards.page() - 1" [pageSize]="cards.pageSize()"
              [pageSizeOptions]="cards.pageSizeOptions" (page)="cards.onPage($event)" showFirstLastButtons />
          </div>
        </mat-tab>

        <mat-tab label="Card requests">
          <form class="filter-bar row g-2 align-items-center mt-2" [formGroup]="requestFilters" (ngSubmit)="requests.search()">
            <mat-form-field class="col-12 col-md-4" subscriptSizing="dynamic">
              <mat-label>Search</mat-label>
              <input matInput formControlName="search" placeholder="Request number or employee" />
            </mat-form-field>
            <mat-form-field class="col-6 col-md-3" subscriptSizing="dynamic">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                <mat-option [value]="null">All</mat-option>
                @for (s of lk.lookups()?.cardRequestStatuses ?? []; track s) {
                  <mat-option [value]="s">{{ humanize(s) }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field class="col-6 col-md-3" subscriptSizing="dynamic">
              <mat-label>Request type</mat-label>
              <mat-select formControlName="requestType">
                <mat-option [value]="null">All</mat-option>
                @for (s of lk.lookups()?.cardRequestTypes ?? []; track s) {
                  <mat-option [value]="s">{{ s }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="col-12 col-md-2 d-flex gap-1">
              <button mat-flat-button type="submit">Apply</button>
              <button mat-button type="button" (click)="requestFilters.reset(); requests.search()">Reset</button>
            </div>
          </form>
          <div class="data-card">
            @if (requests.loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <eiw-error-state [error]="requests.error()" (retry)="requests.load()" />
            <div class="table-wrap">
              <table mat-table [dataSource]="requests.items()" matSort (matSortChange)="requests.onSort($event)">
                <ng-container matColumnDef="requestNumber">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Request</th>
                  <td mat-cell *matCellDef="let r">{{ r.requestNumber }}</td>
                </ng-container>
                <ng-container matColumnDef="employeeName">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
                  <td mat-cell *matCellDef="let r">{{ r.employeeName }} <span class="text-muted small">{{ r.employeeNumber }}</span></td>
                </ng-container>
                <ng-container matColumnDef="requestType">
                  <th mat-header-cell *matHeaderCellDef>Type</th>
                  <td mat-cell *matCellDef="let r">{{ r.requestType }}</td>
                </ng-container>
                <ng-container matColumnDef="reason">
                  <th mat-header-cell *matHeaderCellDef>Reason</th>
                  <td mat-cell *matCellDef="let r">{{ r.reason }}</td>
                </ng-container>
                <ng-container matColumnDef="requestedAtUtc">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Requested</th>
                  <td mat-cell *matCellDef="let r">{{ r.requestedAtUtc | date: 'medium' }}<div class="text-muted small">{{ r.requestedByName }}</div></td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
                  <td mat-cell *matCellDef="let r">
                    <eiw-status [value]="r.status" />
                    @if (r.decisionComments) {
                      <div class="text-muted small">{{ r.decisionComments }}</div>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
                  <td mat-cell *matCellDef="let r" class="text-nowrap">
                    @if (session.hasPermission('Cards.Verify')) {
                      @for (d of decisionsFor(r); track d) {
                        <button mat-button type="button" [class.danger-action]="d === 'Reject'" (click)="decide(r, d)">{{ d }}</button>
                      }
                    }
                    @if (r.status === 'Approved' && session.hasPermission('Cards.Issue')) {
                      <button mat-flat-button type="button" (click)="issue({ request: r })"><mat-icon>contactless</mat-icon>Issue</button>
                    }
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="requestColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: requestColumns"></tr>
              </table>
            </div>
            @if (requests.empty()) {
              <eiw-empty-state message="No card requests match the current filters." icon="assignment" />
            }
            <mat-paginator [length]="requests.total()" [pageIndex]="requests.page() - 1" [pageSize]="requests.pageSize()"
              [pageSizeOptions]="requests.pageSizeOptions" (page)="requests.onPage($event)" showFirstLastButtons />
          </div>
        </mat-tab>
      </mat-tab-group>
    </section>
  `,
})
export class CardsPageComponent {
  private readonly service = inject(CardsService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;

  readonly cardColumns = ['maskedCardUid', 'employeeName', 'cardType', 'issuedAtUtc', 'expiresAtUtc', 'status', 'sync', 'actions'];
  readonly requestColumns = ['requestNumber', 'employeeName', 'requestType', 'reason', 'requestedAtUtc', 'status', 'actions'];
  readonly actionLabel: Record<CardAction, string> = {
    activate: 'Activate',
    reportLost: 'Report lost',
    block: 'Block',
    replace: 'Replace',
    deactivate: 'Deactivate',
  };
  readonly actionIcon: Record<CardAction, string> = {
    activate: 'check_circle',
    reportLost: 'report',
    block: 'block',
    replace: 'autorenew',
    deactivate: 'cancel',
  };

  readonly cardFilters = new FormGroup({
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    cardType: new FormControl<string | null>(null),
  });
  readonly requestFilters = new FormGroup({
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    requestType: new FormControl<string | null>(null),
  });

  readonly cards = new PagedList<Card>((q) => this.service.search(q), () => this.cardFilters.getRawValue());
  readonly requests = new PagedList<CardRequest>((q) => this.service.searchRequests(q), () => this.requestFilters.getRawValue());

  constructor() {
    this.lk.ensure();
    this.cards.load();
  }

  onTab(index: number): void {
    if (index === 1 && !this.requests.loaded()) this.requests.load();
  }

  actionsFor(card: Card): CardAction[] {
    return cardActions(card, (c) => this.session.hasPermission(c), this.session.user()?.employeeId ?? null);
  }

  decisionsFor(r: CardRequest): CardRequestDecision[] {
    return cardRequestDecisions(r.status);
  }

  run(action: CardAction, card: Card): void {
    switch (action) {
      case 'activate':
        askReason(this.dialog, { title: 'Activate card', message: `Activate card ${card.maskedCardUid} for ${card.employeeName}?`, hideText: true, confirmText: 'Activate' })
          .subscribe(() => this.exec(this.service.activate(card), 'Card activated.', this.cards));
        break;
      case 'reportLost':
        askReason(this.dialog, { title: 'Report card lost', message: `Card ${card.maskedCardUid} will be blocked immediately.`, label: 'What happened?', required: true, maxLength: 500, confirmText: 'Report lost', danger: true })
          .subscribe((r) => this.exec(this.service.reportLost(card, r.text), 'Card reported lost and blocked.', this.cards));
        break;
      case 'block':
        askReason(this.dialog, { title: 'Block card', message: `Block card ${card.maskedCardUid}?`, label: 'Reason', required: true, maxLength: 500, confirmText: 'Block', danger: true })
          .subscribe((r) => this.exec(this.service.block(card, r.text), 'Card blocked.', this.cards));
        break;
      case 'deactivate':
        askReason(this.dialog, { title: 'Deactivate card', message: `Deactivate card ${card.maskedCardUid}?`, label: 'Reason', required: true, maxLength: 500, confirmText: 'Deactivate', danger: true })
          .subscribe((r) => this.exec(this.service.deactivate(card, r.text), 'Card deactivated.', this.cards));
        break;
      case 'replace':
        this.dialog
          .open<ReplaceCardDialogComponent, Card, Card>(ReplaceCardDialogComponent, { data: card, width: '520px' })
          .afterClosed()
          .pipe(filter((c): c is Card => !!c))
          .subscribe(() => {
            this.notifier.success('Replacement card issued.');
            this.cards.load();
          });
        break;
    }
  }

  decide(r: CardRequest, decision: CardRequestDecision): void {
    askReason(this.dialog, {
      title: `${decision} ${r.requestNumber}`,
      message: `${r.requestType} card for ${r.employeeName}.`,
      label: decision === 'Reject' ? 'Rejection comments' : 'Comments (optional)',
      required: decision === 'Reject',
      confirmText: decision,
      danger: decision === 'Reject',
    }).subscribe((res) => this.exec(this.service.decide(r.cardRequestId, decision, res.text), `Request ${decision === 'Verify' ? 'verified' : decision === 'Approve' ? 'approved' : 'rejected'}.`, this.requests));
  }

  newRequest(): void {
    this.dialog
      .open<CardRequestDialogComponent, null, CardRequest>(CardRequestDialogComponent, { width: '600px', data: null })
      .afterClosed()
      .pipe(filter((r): r is CardRequest => !!r))
      .subscribe((r) => {
        this.notifier.success(`Card request ${r.requestNumber} submitted.`);
        this.requests.load();
      });
  }

  issue(data: IssueCardDialogData): void {
    this.dialog
      .open<IssueCardDialogComponent, IssueCardDialogData, Card>(IssueCardDialogComponent, { data, width: '640px' })
      .afterClosed()
      .pipe(filter((c): c is Card => !!c))
      .subscribe(() => {
        this.notifier.success('Card issued.');
        this.cards.load();
        if (this.requests.loaded()) this.requests.load();
      });
  }

  private exec<T>(op: Observable<T>, message: string, list: PagedList<Card> | PagedList<CardRequest>): void {
    list.loading.set(true);
    op.subscribe({
      next: () => {
        this.notifier.success(message);
        list.load();
      },
      error: (err: unknown) => {
        list.loading.set(false);
        this.notifier.error(err);
      },
    });
  }
}
