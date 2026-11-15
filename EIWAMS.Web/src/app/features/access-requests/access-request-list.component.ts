import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';

import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, PagedList, humanize } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { AccessRequest } from './access-requests.models';
import { AccessRequestsService } from './access-requests.service';

@Component({
  selector: 'eiw-access-request-list',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatButtonToggleModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Access requests</h1>
        <div class="page-actions">
          @if (session.hasPermission('AccessRequests.Create')) {
            <a mat-flat-button routerLink="new"><mat-icon>add</mat-icon>New request</a>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        @if (session.hasPermission('AccessRequests.ViewAll')) {
          <div class="col-12 col-md-auto">
            <mat-button-toggle-group formControlName="scope" aria-label="Request scope" (change)="list.search()">
              <mat-button-toggle value="mine">My requests</mat-button-toggle>
              <mat-button-toggle value="all">All requests</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
        }
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Request number or employee" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.accessRequestStatuses ?? []; track s) {
              <mat-option [value]="s">{{ humanize(s) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Stage</mat-label>
          <mat-select formControlName="currentStage">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.approvalStages ?? []; track s) {
              <mat-option [value]="s">{{ humanize(s) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Location</mat-label>
          <mat-select formControlName="locationId">
            <mat-option [value]="null">All</mat-option>
            @for (l of lk.lookups()?.locations ?? []; track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <div class="col-6 col-md-auto d-flex gap-1">
          <button mat-flat-button type="submit">Apply</button>
          <button mat-button type="button" (click)="reset()">Reset</button>
        </div>
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
              <td mat-cell *matCellDef="let r"><a [routerLink]="[r.accessRequestId]">{{ r.requestNumber }}</a></td>
            </ng-container>
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
              <td mat-cell *matCellDef="let r">{{ r.employeeName }} <span class="text-muted small">{{ r.employeeNumber }}</span></td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef>Location</th>
              <td mat-cell *matCellDef="let r">
                {{ r.locationName }}
                @if (r.isRestricted) {
                  <mat-icon class="align-middle" inline aria-label="Restricted location">lock</mat-icon>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="validity">
              <th mat-header-cell *matHeaderCellDef>Validity</th>
              <td mat-cell *matCellDef="let r">{{ r.validFromUtc | date: 'mediumDate' }} – {{ r.validToUtc | date: 'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let r"><eiw-status [value]="r.status" /></td>
            </ng-container>
            <ng-container matColumnDef="currentStage">
              <th mat-header-cell *matHeaderCellDef>Waiting on</th>
              <td mat-cell *matCellDef="let r">
                @if (r.currentStage) {
                  {{ humanize(r.currentStage) }}<div class="text-muted small">{{ r.currentApproverNames }}</div>
                } @else { — }
              </td>
            </ng-container>
            <ng-container matColumnDef="submittedAtUtc">
              <th mat-header-cell *matHeaderCellDef>Submitted</th>
              <td mat-cell *matCellDef="let r">{{ r.submittedAtUtc ? (r.submittedAtUtc | date: 'medium') : '—' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No access requests match the current filters." icon="assignment" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class AccessRequestListComponent {
  private readonly service = inject(AccessRequestsService);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;
  readonly columns = ['requestNumber', 'employeeName', 'locationName', 'validity', 'status', 'currentStage', 'submittedAtUtc'];

  readonly filters = new FormGroup({
    scope: new FormControl<'mine' | 'all'>('mine', { nonNullable: true }),
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    currentStage: new FormControl<string | null>(null),
    locationId: new FormControl<number | null>(null),
  });

  readonly list = new PagedList<AccessRequest>(
    (q) => this.service.search(q),
    () => {
      const { scope, ...rest } = this.filters.getRawValue();
      const all = scope === 'all' && this.session.hasPermission('AccessRequests.ViewAll');
      return { ...rest, mine: all ? undefined : true };
    },
  );

  constructor() {
    this.lk.ensure();
    this.list.load();
  }

  reset(): void {
    this.filters.reset();
    this.list.search();
  }
}
