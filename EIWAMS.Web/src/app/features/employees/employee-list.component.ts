import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';

import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, PagedList, humanize } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { EmployeeListItem } from './employees.models';
import { EmployeesService } from './employees.service';

@Component({
  selector: 'eiw-employee-list',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Employees</h1>
        <div class="page-actions">
          @if (session.hasPermission('Employees.Manage')) {
            <a mat-flat-button routerLink="new"><mat-icon>person_add</mat-icon>New employee</a>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-4" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Name, number or email" />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-3" subscriptSizing="dynamic">
          <mat-label>Department</mat-label>
          <mat-select formControlName="departmentId">
            <mat-option [value]="null">All departments</mat-option>
            @for (d of lk.lookups()?.departments ?? []; track d.id) {
              <mat-option [value]="d.id">{{ d.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="employmentStatus">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.employmentStatuses ?? []; track s) {
              <mat-option [value]="s">{{ humanize(s) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Type</mat-label>
          <mat-select formControlName="employeeType">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.employeeTypes ?? []; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <div class="col-6 col-md-1 d-flex gap-1">
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
            <ng-container matColumnDef="employeeNumber">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Number</th>
              <td mat-cell *matCellDef="let e">{{ e.employeeNumber }}</td>
            </ng-container>
            <ng-container matColumnDef="fullName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
              <td mat-cell *matCellDef="let e">
                <a [routerLink]="[e.employeeId]">{{ e.fullName }}</a>
                <div class="text-muted small">{{ e.workEmail }}</div>
              </td>
            </ng-container>
            <ng-container matColumnDef="departmentName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Department</th>
              <td mat-cell *matCellDef="let e">{{ e.departmentName }}</td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
              <td mat-cell *matCellDef="let e">{{ e.locationName }}</td>
            </ng-container>
            <ng-container matColumnDef="employeeType">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let e">{{ e.employeeType }}</td>
            </ng-container>
            <ng-container matColumnDef="joinDate">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Joined</th>
              <td mat-cell *matCellDef="let e">{{ e.joinDate | date: 'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="activeCardCount">
              <th mat-header-cell *matHeaderCellDef class="num">Active cards</th>
              <td mat-cell *matCellDef="let e" class="num">{{ e.activeCardCount }}</td>
            </ng-container>
            <ng-container matColumnDef="employmentStatus">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let e"><eiw-status [value]="e.employmentStatus" /></td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" class="clickable-row" (dblclick)="open(row)"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No employees match the current filters." icon="badge" />
        }
        <mat-paginator
          [length]="list.total()"
          [pageIndex]="list.page() - 1"
          [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions"
          (page)="list.onPage($event)"
          showFirstLastButtons
        />
      </div>
    </section>
  `,
})
export class EmployeeListComponent {
  private readonly service = inject(EmployeesService);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;
  readonly columns = ['employeeNumber', 'fullName', 'departmentName', 'locationName', 'employeeType', 'joinDate', 'activeCardCount', 'employmentStatus'];

  readonly filters = new FormGroup({
    search: new FormControl<string | null>(null),
    departmentId: new FormControl<number | null>(null),
    employmentStatus: new FormControl<string | null>(null),
    employeeType: new FormControl<string | null>(null),
  });

  readonly list = new PagedList<EmployeeListItem>((q) => this.service.search(q), () => this.filters.getRawValue());

  constructor() {
    this.lk.ensure();
    this.list.load();
  }

  reset(): void {
    this.filters.reset();
    this.list.search();
  }

  open(e: EmployeeListItem): void {
    void this.router.navigate(['/employees', e.employeeId]);
  }
}
