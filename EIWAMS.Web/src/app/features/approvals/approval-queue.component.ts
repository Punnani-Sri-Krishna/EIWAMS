import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

import { accessTypeLabel, durationLabel, stageLabel } from '../access-requests/access-requests.models';
import { ApprovalDecision, DECISION_PAST_TENSE, PendingApproval } from './approvals.models';
import { ApprovalsService } from './approvals.service';
import { Notifier, PagedList } from './kit/feature-kit';
import { KIT_IMPORTS } from './kit/ui.components';

/** Access approvals assigned to the caller (`v1/approvals/pending`), optionally fixed to one stage. */
@Component({
  selector: 'eiw-approval-queue',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, DecimalPipe, MatTableModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatTooltipModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section [class.page]="!embedded()">
      @if (!embedded()) {
        <header class="page-header">
          <div>
            <h1>{{ title() }}</h1>
            <p class="subtitle">Access requests waiting for your decision. Return or reject requires a comment.</p>
          </div>
          <div class="page-actions">
            <button mat-stroked-button type="button" (click)="list.load()"><mat-icon>refresh</mat-icon>Refresh</button>
          </div>
        </header>
      }

      <form class="filter-bar" (ngSubmit)="list.search()">
        <mat-form-field class="flex-grow-1" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput [formControl]="search" placeholder="Request number, employee or location" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        @if (!stage()) {
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Stage</mat-label>
            <mat-select [formControl]="stageFilter" (selectionChange)="list.search()">
              <mat-option value="">All stages</mat-option>
              @for (s of reviewStages; track s) {
                <mat-option [value]="s">{{ stageLabel(s) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
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
          <table mat-table [dataSource]="list.items()" aria-label="Pending access approvals">
            <ng-container matColumnDef="requestNumber">
              <th mat-header-cell *matHeaderCellDef>Request</th>
              <td mat-cell *matCellDef="let a">
                <a [routerLink]="['/access-requests', a.accessRequestId]">{{ a.requestNumber }}</a>
                <span class="cell-sub">{{ accessTypeLabel(a.accessType) }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef>Employee</th>
              <td mat-cell *matCellDef="let a">{{ a.employeeName }}<span class="cell-sub">{{ a.employeeNumber }}</span></td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef>Location</th>
              <td mat-cell *matCellDef="let a">
                {{ a.locationName }}
                @if (a.isRestricted) {
                  <mat-icon class="restricted" matTooltip="Restricted location" aria-label="Restricted">lock</mat-icon>
                }
                @if (a.buildingLocationName && a.buildingLocationName !== a.locationName) {
                  <span class="cell-sub">{{ a.buildingLocationName }}</span>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="stage">
              <th mat-header-cell *matHeaderCellDef>Stage</th>
              <td mat-cell *matCellDef="let a"><span class="status-chip tone-warning"><mat-icon aria-hidden="true">how_to_reg</mat-icon>{{ stageLabel(a.stage) }}</span></td>
            </ng-container>
            <ng-container matColumnDef="duration">
              <th mat-header-cell *matHeaderCellDef>Duration</th>
              <td mat-cell *matCellDef="let a" class="text-nowrap">
                {{ durationLabel(a.durationCode) || '—' }}
                <span class="cell-sub">{{ a.validFromUtc | date: 'mediumDate' }} – {{ a.durationCode === 'Permanent' ? 'permanent' : (a.validToUtc | date: 'mediumDate') }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="justification">
              <th mat-header-cell *matHeaderCellDef>Justification</th>
              <td mat-cell *matCellDef="let a" class="text-truncate" style="max-width: 240px" [title]="a.businessJustification ?? ''">{{ a.businessJustification }}</td>
            </ng-container>
            <ng-container matColumnDef="ageHours">
              <th mat-header-cell *matHeaderCellDef class="num">Waiting (h)</th>
              <td mat-cell *matCellDef="let a" class="num"><span [class.text-danger]="a.ageHours >= 48">{{ a.ageHours | number: '1.0-1' }}</span></td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let a" class="text-nowrap text-end">
                <button mat-flat-button type="button" (click)="decide(a, 'Approve')"><mat-icon>check</mat-icon>Approve</button>
                <button mat-button type="button" (click)="decide(a, 'Return')"><mat-icon>undo</mat-icon>Return</button>
                <button mat-button type="button" class="danger-action" (click)="decide(a, 'Reject')"><mat-icon>close</mat-icon>Reject</button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns()"></tr>
            <tr mat-row *matRowDef="let row; columns: columns()"></tr>
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
  styles: `.restricted { font-size: 16px; width: 16px; height: 16px; vertical-align: -3px; color: var(--lab-danger); }`,
})
export class ApprovalQueueComponent implements OnInit {
  private readonly service = inject(ApprovalsService);
  private readonly notifier = inject(Notifier);

  /** Fixed stage (e.g. `Manager` in Pending Approvals); empty = stage filter (All / SecurityHead / Security / AccessControl). */
  readonly stage = input<string | null>(null);
  readonly title = input('Access requests review');
  readonly embedded = input(false);

  readonly stageLabel = stageLabel;
  readonly durationLabel = durationLabel;
  readonly accessTypeLabel = accessTypeLabel;
  readonly reviewStages = ['SecurityHead', 'Security', 'AccessControl'];
  readonly search = new FormControl<string | null>(null);
  readonly stageFilter = new FormControl<string>('', { nonNullable: true });
  readonly columns = computed(() => [
    'requestNumber', 'employeeName', 'locationName', ...(this.stage() ? [] : ['stage']), 'duration', 'justification', 'ageHours', 'actions',
  ]);
  readonly list = new PagedList<PendingApproval>(
    (q) => this.service.pending(q),
    () => ({ search: this.search.value, stage: this.stage() || this.stageFilter.value }),
  );

  ngOnInit(): void {
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
