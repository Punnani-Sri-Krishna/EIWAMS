import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';

import { accessTypeLabel, stageLabel } from '../access-requests/access-requests.models';
import { CARD_STAGE_LABELS } from '../card-requests/card-requests.models';
import { TeamRequestItem } from './approvals.models';
import { ApprovalsService } from './approvals.service';
import { PagedList } from './kit/feature-kit';
import { KIT_IMPORTS } from './kit/ui.components';

/** Team Requests: card + access requests of the caller's direct reports (`v1/approvals/team`). */
@Component({
  selector: 'eiw-team-requests',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatButtonToggleModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Team requests</h1>
          <p class="subtitle">ID card and access requests raised by your direct reports.</p>
        </div>
        <div class="page-actions">
          <button mat-stroked-button type="button" (click)="list.load()"><mat-icon>refresh</mat-icon>Refresh</button>
        </div>
      </header>

      <form class="filter-bar" (ngSubmit)="list.search()">
        <mat-button-toggle-group [formControl]="kind" (change)="list.search()" aria-label="Request kind" hideSingleSelectionIndicator>
          <mat-button-toggle value="">All</mat-button-toggle>
          <mat-button-toggle value="Card">ID card</mat-button-toggle>
          <mat-button-toggle value="Access">Access</mat-button-toggle>
        </mat-button-toggle-group>
        <mat-form-field class="flex-grow-1" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput [formControl]="search" placeholder="Request number or employee" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <button mat-flat-button type="submit">Apply</button>
      </form>

      <div class="data-card">
        @if (list.loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="list.error()" (retry)="list.load()" />
        <div class="table-wrap">
          <table mat-table [dataSource]="list.items()" aria-label="Team requests">
            <ng-container matColumnDef="request">
              <th mat-header-cell *matHeaderCellDef>Request</th>
              <td mat-cell *matCellDef="let r">
                <a [routerLink]="r.route">{{ r.requestNumber }}</a>
                <span class="cell-sub">{{ typeText(r) }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="employee">
              <th mat-header-cell *matHeaderCellDef>Employee</th>
              <td mat-cell *matCellDef="let r">{{ r.employeeName }}<span class="cell-sub">{{ r.employeeNumber }}</span></td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r"><eiw-status [value]="r.status" [kind]="r.requestKind === 'Card' ? 'card-request' : 'access-request'" /></td>
            </ng-container>
            <ng-container matColumnDef="stage">
              <th mat-header-cell *matHeaderCellDef>Current stage</th>
              <td mat-cell *matCellDef="let r">{{ stageText(r) || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="submitted">
              <th mat-header-cell *matHeaderCellDef>Submitted</th>
              <td mat-cell *matCellDef="let r" class="text-nowrap">{{ r.submittedAtUtc ? (r.submittedAtUtc | date: 'medium') : '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="open">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Open</span></th>
              <td mat-cell *matCellDef="let r" class="text-end">
                <a mat-icon-button [routerLink]="r.route" [attr.aria-label]="'Open ' + r.requestNumber"><mat-icon>chevron_right</mat-icon></a>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="Your team has no requests yet." icon="groups" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class TeamRequestsComponent {
  private readonly service = inject(ApprovalsService);
  readonly search = new FormControl<string | null>(null);
  readonly kind = new FormControl<string>('', { nonNullable: true });
  readonly columns = ['request', 'employee', 'status', 'stage', 'submitted', 'open'];
  readonly list = new PagedList<TeamRequestItem>((q) => this.service.team(q), () => ({ search: this.search.value, requestKind: this.kind.value }));

  constructor() {
    this.list.load();
  }

  typeText(r: TeamRequestItem): string {
    return r.requestKind === 'Card' ? `ID card · ${r.requestType}` : `Access · ${accessTypeLabel(r.requestType)}`;
  }

  stageText(r: TeamRequestItem): string {
    if (!r.currentStage) return '';
    return r.requestKind === 'Card'
      ? (CARD_STAGE_LABELS[r.currentStage as keyof typeof CARD_STAGE_LABELS] ?? r.currentStage)
      : stageLabel(r.currentStage);
  }
}
