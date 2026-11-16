import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';

import { AccessRequest, accessTypeLabel, durationLabel } from '../access-requests/access-requests.models';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { Notifier, PagedList } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { PermissionsService } from './permissions.service';

/** Provision Access: Approved access requests waiting for an access permission (contract §7). */
@Component({
  selector: 'eiw-provision-queue',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Provision access</h1>
          <p class="subtitle">Fully approved access requests. Provisioning creates the access permission on the controller.</p>
        </div>
        <div class="page-actions">
          <a mat-button routerLink="/permissions"><mat-icon>key</mat-icon>All permissions</a>
          <button mat-stroked-button type="button" (click)="list.load()"><mat-icon>refresh</mat-icon>Refresh</button>
        </div>
      </header>

      <form class="filter-bar" (ngSubmit)="list.search()">
        <mat-form-field class="flex-grow-1" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput [formControl]="search" placeholder="Request number, employee or location" />
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
          <table mat-table [dataSource]="list.items()" aria-label="Approved access requests awaiting provisioning">
            <ng-container matColumnDef="request">
              <th mat-header-cell *matHeaderCellDef>Request</th>
              <td mat-cell *matCellDef="let r">
                <a [routerLink]="['/access-requests', r.accessRequestId]">{{ r.requestNumber }}</a>
                <span class="cell-sub">{{ accessTypeLabel(r.accessType) }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="employee">
              <th mat-header-cell *matHeaderCellDef>Employee</th>
              <td mat-cell *matCellDef="let r">{{ r.employeeName }}<span class="cell-sub">{{ r.employeeNumber }}</span></td>
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
            <ng-container matColumnDef="validity">
              <th mat-header-cell *matHeaderCellDef>Validity</th>
              <td mat-cell *matCellDef="let r" class="text-nowrap">
                {{ durationLabel(r.durationCode) || '—' }}
                <span class="cell-sub">{{ r.validFromUtc | date: 'mediumDate' }} – {{ r.durationCode === 'Permanent' ? 'permanent' : (r.validToUtc | date: 'mediumDate') }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r"><eiw-status [value]="r.status" kind="access-request" /></td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let r" class="text-end">
                <button mat-flat-button type="button" [disabled]="busyId() !== null" (click)="provision(r)"><mat-icon>key</mat-icon>Provision</button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No approved requests are waiting for provisioning." icon="task_alt" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class ProvisionQueueComponent {
  private readonly requests = inject(AccessRequestsService);
  private readonly permissions = inject(PermissionsService);
  private readonly notifier = inject(Notifier);
  readonly accessTypeLabel = accessTypeLabel;
  readonly durationLabel = durationLabel;
  readonly search = new FormControl<string | null>(null);
  readonly busyId = signal<number | null>(null);
  readonly columns = ['request', 'employee', 'location', 'validity', 'status', 'actions'];
  readonly list = new PagedList<AccessRequest>((q) => this.requests.search(q), () => ({ status: 'Approved', search: this.search.value }));

  constructor() {
    this.list.load();
  }

  provision(r: AccessRequest): void {
    this.busyId.set(r.accessRequestId);
    this.permissions.provision(r.accessRequestId).subscribe({
      next: () => {
        this.busyId.set(null);
        this.notifier.success(`Access provisioned for ${r.requestNumber}.`);
        this.list.load();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.notifier.error(err);
        this.list.load();
      },
    });
  }
}
