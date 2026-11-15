import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { ApprovalDecision, DECISION_PAST_TENSE, PendingApproval } from './approvals.models';
import { ApprovalsService } from './approvals.service';
import { Notifier, PagedList, humanize } from './kit/feature-kit';
import { KIT_IMPORTS } from './kit/ui.components';

@Component({
  selector: 'eiw-approval-queue',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatTooltipModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>My approvals</h1>
        <div class="page-actions">
          <button mat-stroked-button type="button" (click)="list.load()"><mat-icon>refresh</mat-icon>Refresh</button>
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-6" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput [formControl]="search" placeholder="Request number, employee or location" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <div class="col-12 col-md-2"><button mat-flat-button type="submit">Apply</button></div>
      </form>

      <div class="data-card">
        @if (list.loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="list.error()" (retry)="list.load()" />
        <div class="table-wrap">
          <table mat-table [dataSource]="list.items()" matSort (matSortChange)="list.onSort($event)">
            <ng-container matColumnDef="requestNumber">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Request</th>
              <td mat-cell *matCellDef="let a"><a [routerLink]="['/access-requests', a.accessRequestId]">{{ a.requestNumber }}</a></td>
            </ng-container>
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
              <td mat-cell *matCellDef="let a">{{ a.employeeName }} <span class="text-muted small">{{ a.employeeNumber }}</span></td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef>Location</th>
              <td mat-cell *matCellDef="let a">
                {{ a.locationName }}
                @if (a.isRestricted) {
                  <span class="status-chip tone-danger" matTooltip="Restricted zone: requires FacilityAdmin approval"><mat-icon aria-hidden="true">lock</mat-icon>Restricted</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="stage">
              <th mat-header-cell *matHeaderCellDef>Stage</th>
              <td mat-cell *matCellDef="let a">{{ humanize(a.stage) }}</td>
            </ng-container>
            <ng-container matColumnDef="justification">
              <th mat-header-cell *matHeaderCellDef>Justification</th>
              <td mat-cell *matCellDef="let a" class="text-truncate" style="max-width: 280px" [title]="a.businessJustification ?? ''">{{ a.businessJustification }}</td>
            </ng-container>
            <ng-container matColumnDef="validity">
              <th mat-header-cell *matHeaderCellDef>Validity</th>
              <td mat-cell *matCellDef="let a">{{ a.validFromUtc | date: 'mediumDate' }} – {{ a.validToUtc | date: 'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="ageHours">
              <th mat-header-cell *matHeaderCellDef class="num">Waiting (h)</th>
              <td mat-cell *matCellDef="let a" class="num">
                <span [class.text-danger]="a.ageHours >= 48">{{ a.ageHours | number: '1.0-1' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let a" class="text-nowrap">
                <button mat-flat-button type="button" (click)="decide(a, 'Approve')"><mat-icon>check</mat-icon>Approve</button>
                <button mat-button type="button" (click)="decide(a, 'Return')"><mat-icon>undo</mat-icon>Return</button>
                <button mat-button type="button" class="danger-action" (click)="decide(a, 'Reject')"><mat-icon>close</mat-icon>Reject</button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="Nothing is waiting for your approval." icon="task_alt" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class ApprovalQueueComponent {
  private readonly service = inject(ApprovalsService);
  private readonly notifier = inject(Notifier);
  readonly humanize = humanize;
  readonly search = new FormControl<string | null>(null);
  readonly columns = ['requestNumber', 'employeeName', 'locationName', 'stage', 'justification', 'validity', 'ageHours', 'actions'];
  readonly list = new PagedList<PendingApproval>((q) => this.service.pending(q), () => ({ search: this.search.value }));

  constructor() {
    this.list.load();
  }

  decide(a: PendingApproval, decision: ApprovalDecision): void {
    this.service.decideWithPrompt(a, decision).subscribe({
      next: () => {
        this.notifier.success(`${a.requestNumber} ${DECISION_PAST_TENSE[decision]}.`);
        this.list.load();
      },
      error: (err: unknown) => {
        this.notifier.error(err);
        this.list.load();
      },
    });
  }
}
