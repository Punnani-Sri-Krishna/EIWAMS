import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
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
import { Incident } from './incidents.models';
import { IncidentsService } from './incidents.service';

@Component({
  selector: 'eiw-incident-list',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Security incidents</h1>
        <div class="page-actions">
          @if (session.hasPermission('Incidents.Manage')) {
            <a mat-flat-button routerLink="/incidents/new"><mat-icon>add</mat-icon>New incident</a>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Number or title" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.incidentStatuses ?? []; track s) {
              <mat-option [value]="s">{{ humanize(s) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Severity</mat-label>
          <mat-select formControlName="severity">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.severities ?? []; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Assigned to</mat-label>
          <mat-select formControlName="assignedToUserId">
            <mat-option [value]="null">Anyone</mat-option>
            @for (u of lk.lookups()?.users ?? []; track u.id) {
              <mat-option [value]="u.id">{{ u.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <div class="col-12 col-md-2 d-flex gap-1">
          <button mat-flat-button type="submit">Apply</button>
          <button mat-button type="button" (click)="filters.reset(); list.search()">Reset</button>
        </div>
      </form>

      <div class="data-card">
        @if (list.loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <eiw-error-state [error]="list.error()" (retry)="list.load()" />
        <div class="table-wrap">
          <table mat-table [dataSource]="list.items()" matSort matSortActive="openedAtUtc" matSortDirection="desc" (matSortChange)="list.onSort($event)">
            <ng-container matColumnDef="incidentNumber">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Number</th>
              <td mat-cell *matCellDef="let i"><a [routerLink]="['/incidents', i.incidentId]">{{ i.incidentNumber }}</a></td>
            </ng-container>
            <ng-container matColumnDef="title">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Title</th>
              <td mat-cell *matCellDef="let i">{{ i.title }}<div class="text-muted small">{{ humanize(i.incidentType) }}</div></td>
            </ng-container>
            <ng-container matColumnDef="severity">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Severity</th>
              <td mat-cell *matCellDef="let i"><eiw-status [value]="i.severity" /></td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let i"><eiw-status [value]="i.status" /></td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
              <td mat-cell *matCellDef="let i">{{ i.locationName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="assignedToName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Assigned to</th>
              <td mat-cell *matCellDef="let i">{{ i.assignedToName ?? 'Unassigned' }}</td>
            </ng-container>
            <ng-container matColumnDef="openedAtUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Opened</th>
              <td mat-cell *matCellDef="let i">{{ i.openedAtUtc | date: 'medium' }}<div class="text-muted small">{{ i.openedByName }}</div></td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No incidents match the current filters." icon="shield" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class IncidentListComponent {
  private readonly service = inject(IncidentsService);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;
  readonly columns = ['incidentNumber', 'title', 'severity', 'status', 'locationName', 'assignedToName', 'openedAtUtc'];

  readonly filters = new FormGroup({
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    severity: new FormControl<string | null>(null),
    assignedToUserId: new FormControl<number | null>(null),
  });

  readonly list = new PagedList<Incident>((q) => this.service.search(q), () => this.filters.getRawValue(), { sortBy: 'openedAtUtc', sortDir: 'desc' });

  constructor() {
    this.lk.ensure();
    this.list.load();
  }
}
