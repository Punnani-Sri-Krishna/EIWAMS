import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Router, RouterLink } from '@angular/router';

import { SessionService } from '../../core/services/session.service';
import { AccessRequest, accessTypeLabel, durationLabel, stageLabel } from '../access-requests/access-requests.models';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { PagedList } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { CARD_STAGE_LABELS, CardRequest, REQUEST_TYPE_META, CardRequestType, cardReasonText } from '../card-requests/card-requests.models';
import { CardRequestsService } from '../card-requests/card-requests.service';

export type MyRequestsTab = 'cards' | 'access';
export const MY_REQUEST_TABS: MyRequestsTab[] = ['cards', 'access'];

/** `?tab=` -> tab (default `cards`). */
export function tabFromQuery(value: string | null | undefined): MyRequestsTab {
  return value === 'access' ? 'access' : 'cards';
}

/** My Requests (contract §7): `?tab=cards` (default) / `?tab=access`. */
@Component({
  selector: 'eiw-my-requests',
  imports: [
    DatePipe, RouterLink, MatTabsModule, MatTableModule, MatPaginatorModule, MatProgressBarModule, MatButtonModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tab-body { padding-top: 16px; }
    .tab-label { display: inline-flex; align-items: center; gap: 6px; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>My requests</h1>
          <p class="subtitle">Track your ID card and access requests through every approval stage.</p>
        </div>
        <div class="page-actions">
          @if (canRaiseCard) {
            <a mat-flat-button routerLink="/cards/requests/new"><mat-icon>badge</mat-icon>Raise ID card request</a>
          }
          @if (canRaiseAccess) {
            <a mat-stroked-button routerLink="/access-requests/new"><mat-icon>vpn_key</mat-icon>Raise access request</a>
          }
        </div>
      </header>

      <mat-tab-group mat-stretch-tabs="false" mat-align-tabs="start" animationDuration="0ms" aria-label="Request kind"
        [selectedIndex]="selectedIndex()" (selectedIndexChange)="selectTab($event)">
        <mat-tab>
          <ng-template mat-tab-label><span class="tab-label"><mat-icon>badge</mat-icon>ID card</span></ng-template>
          <div class="tab-body">
            <div class="data-card">
              @if (cards.loading()) {
                <mat-progress-bar mode="indeterminate" />
              }
              <eiw-error-state [error]="cards.error()" (retry)="cards.load()" />
              <div class="table-wrap">
                <table mat-table [dataSource]="cards.items()" aria-label="My ID card requests">
                  <ng-container matColumnDef="request">
                    <th mat-header-cell *matHeaderCellDef>Request</th>
                    <td mat-cell *matCellDef="let r">
                      <a [routerLink]="['/cards/requests', r.cardRequestId]">{{ r.requestNumber }}</a>
                      <span class="cell-sub">{{ cardTypeTitle(r.requestType) }}</span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="employee">
                    <th mat-header-cell *matHeaderCellDef>Employee</th>
                    <td mat-cell *matCellDef="let r">{{ r.employeeName }}<span class="cell-sub">{{ r.employeeNumber }}</span></td>
                  </ng-container>
                  <ng-container matColumnDef="reason">
                    <th mat-header-cell *matHeaderCellDef>Reason</th>
                    <td mat-cell *matCellDef="let r" class="text-truncate" style="max-width: 260px" [title]="cardReason(r)">{{ cardReason(r) || '—' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="status">
                    <th mat-header-cell *matHeaderCellDef>Status</th>
                    <td mat-cell *matCellDef="let r">
                      <eiw-status [value]="r.status" kind="card-request" />
                      @if (r.currentStage) {
                        <span class="cell-sub">Waiting on {{ cardStage(r.currentStage) }}</span>
                      }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="requested">
                    <th mat-header-cell *matHeaderCellDef>Requested</th>
                    <td mat-cell *matCellDef="let r" class="text-nowrap">{{ r.requestedAtUtc | date: 'mediumDate' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="open">
                    <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Open</span></th>
                    <td mat-cell *matCellDef="let r" class="text-end">
                      <a mat-icon-button [routerLink]="['/cards/requests', r.cardRequestId]" [attr.aria-label]="'Open ' + r.requestNumber"><mat-icon>chevron_right</mat-icon></a>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="cardColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: cardColumns"></tr>
                </table>
              </div>
              @if (cards.empty()) {
                <eiw-empty-state message="You have not raised any ID card requests yet." icon="badge" />
              }
              <mat-paginator [length]="cards.total()" [pageIndex]="cards.page() - 1" [pageSize]="cards.pageSize()"
                [pageSizeOptions]="cards.pageSizeOptions" (page)="cards.onPage($event)" showFirstLastButtons />
            </div>
          </div>
        </mat-tab>
        @if (canViewAccess) {
          <mat-tab>
            <ng-template mat-tab-label><span class="tab-label"><mat-icon>vpn_key</mat-icon>Access</span></ng-template>
            <div class="tab-body">
              <div class="data-card">
                @if (access.loading()) {
                  <mat-progress-bar mode="indeterminate" />
                }
                <eiw-error-state [error]="access.error()" (retry)="access.load()" />
                <div class="table-wrap">
                  <table mat-table [dataSource]="access.items()" aria-label="My access requests">
                  <ng-container matColumnDef="request">
                    <th mat-header-cell *matHeaderCellDef>Request</th>
                    <td mat-cell *matCellDef="let r">
                      <a [routerLink]="['/access-requests', r.accessRequestId]">{{ r.requestNumber }}</a>
                      <span class="cell-sub">{{ accessTypeLabel(r.accessType) }}</span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="location">
                    <th mat-header-cell *matHeaderCellDef>Location</th>
                    <td mat-cell *matCellDef="let r">
                      {{ r.locationName }}
                      @if (r.buildingLocationName && r.buildingLocationName !== r.locationName) {
                        <span class="cell-sub">{{ r.buildingLocationName }}</span>
                      }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="duration">
                    <th mat-header-cell *matHeaderCellDef>Duration</th>
                    <td mat-cell *matCellDef="let r" class="text-nowrap">
                      {{ durationLabel(r.durationCode) || '—' }}
                      <span class="cell-sub">{{ r.durationCode === 'Permanent' ? 'No end date' : 'Until ' + (r.validToUtc | date: 'mediumDate') }}</span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="status">
                    <th mat-header-cell *matHeaderCellDef>Status</th>
                    <td mat-cell *matCellDef="let r">
                      <eiw-status [value]="r.status" kind="access-request" />
                      @if (r.currentStage) {
                        <span class="cell-sub">Waiting on {{ stageLabel(r.currentStage) }}</span>
                      }
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="created">
                    <th mat-header-cell *matHeaderCellDef>Created</th>
                    <td mat-cell *matCellDef="let r" class="text-nowrap">{{ r.createdAtUtc | date: 'mediumDate' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="open">
                    <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Open</span></th>
                    <td mat-cell *matCellDef="let r" class="text-end">
                      <a mat-icon-button [routerLink]="['/access-requests', r.accessRequestId]" [attr.aria-label]="'Open ' + r.requestNumber"><mat-icon>chevron_right</mat-icon></a>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="accessColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: accessColumns"></tr>
                  </table>
                </div>
                @if (access.empty()) {
                  <eiw-empty-state message="You have not raised any access requests yet." icon="vpn_key" />
                }
                <mat-paginator [length]="access.total()" [pageIndex]="access.page() - 1" [pageSize]="access.pageSize()"
                  [pageSizeOptions]="access.pageSizeOptions" (page)="access.onPage($event)" showFirstLastButtons />
              </div>
            </div>
          </mat-tab>
        }
      </mat-tab-group>
    </section>
  `,
})
export class MyRequestsComponent {
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly cardService = inject(CardRequestsService);
  private readonly accessService = inject(AccessRequestsService);

  /** Bound from `?tab=` (withComponentInputBinding). */
  readonly tab = input<string | null>(null);
  readonly current = computed(() => tabFromQuery(this.tab()));
  readonly canViewAccess = this.session.hasPermission('AccessRequests.View');
  readonly selectedIndex = computed(() => this.current() === 'access' && this.canViewAccess ? 1 : 0);

  readonly canRaiseCard = this.session.hasPermission('Cards.Request');
  readonly canRaiseAccess = this.session.hasPermission('AccessRequests.Create');
  readonly accessTypeLabel = accessTypeLabel;
  readonly durationLabel = durationLabel;
  readonly stageLabel = stageLabel;
  readonly cardColumns = ['request', 'employee', 'reason', 'status', 'requested', 'open'];
  readonly accessColumns = ['request', 'location', 'duration', 'status', 'created', 'open'];
  readonly cards = new PagedList<CardRequest>((q) => this.cardService.search(q), () => ({ mine: true }));
  readonly access = new PagedList<AccessRequest>((q) => this.accessService.search(q), () => ({ mine: true }));

  constructor() {
    // Load each tab the first time it becomes visible.
    effect(() => {
      const list = this.current() === 'access' && this.canViewAccess ? this.access : this.cards;
      untracked(() => {
        if (!list.loaded() && !list.loading()) list.load();
      });
    });
  }

  selectTab(index: number): void {
    const tab = index === 1 && this.canViewAccess ? 'access' : 'cards';
    if (tab === this.current()) return;
    void this.router.navigate([], { queryParams: { tab }, replaceUrl: true });
  }

  cardTypeTitle(type: string): string {
    return REQUEST_TYPE_META[type as CardRequestType]?.title ?? `${type} card`;
  }

  cardStage(stage: string): string {
    return CARD_STAGE_LABELS[stage as keyof typeof CARD_STAGE_LABELS] ?? stage;
  }

  cardReason(r: CardRequest): string {
    return cardReasonText(r);
  }
}
