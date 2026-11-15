import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { filter } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { AccessRequest } from '../access-requests/access-requests.models';
import { AccessRequestsService } from '../access-requests/access-requests.service';
import { FeatureLookups, Notifier, PagedList, asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS, askReason } from '../approvals/kit/ui.components';
import { AccessPermission } from './permissions.models';
import { PermissionsService } from './permissions.service';

/** Pick an Approved access request and provision its permission (Permissions.Provision). */
@Component({
  selector: 'eiw-provision-dialog',
  imports: [DatePipe, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatListModule, MatProgressBarModule, MatPaginatorModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Provision access from an approved request</h2>
    @if (requests.loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <mat-dialog-content>
      <form class="d-flex gap-2" (ngSubmit)="requests.search()">
        <mat-form-field class="flex-grow-1" subscriptSizing="dynamic">
          <mat-label>Search approved requests</mat-label>
          <input matInput [formControl]="search" />
        </mat-form-field>
        <button mat-stroked-button type="submit">Search</button>
      </form>
      <eiw-error-state [error]="requests.error()" (retry)="requests.load()" />
      <eiw-error-state [error]="error()" [retryable]="false" />
      @if (requests.empty()) {
        <eiw-empty-state message="No approved requests are waiting for provisioning." icon="task_alt" />
      }
      <mat-selection-list [multiple]="false" (selectionChange)="selected.set($event.options[0].value)" aria-label="Approved requests">
        @for (r of requests.items(); track r.accessRequestId) {
          <mat-list-option [value]="r">
            <span matListItemTitle>{{ r.requestNumber }} — {{ r.employeeName }}</span>
            <span matListItemLine>{{ r.locationName }} · {{ r.validFromUtc | date: 'mediumDate' }} – {{ r.validToUtc | date: 'mediumDate' }}</span>
          </mat-list-option>
        }
      </mat-selection-list>
      <mat-paginator [length]="requests.total()" [pageIndex]="requests.page() - 1" [pageSize]="requests.pageSize()" [hidePageSize]="true" (page)="requests.onPage($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button type="button" [disabled]="!selected() || saving()" (click)="provision()">Provision</button>
    </mat-dialog-actions>
  `,
})
export class ProvisionDialogComponent {
  private readonly ref = inject<MatDialogRef<ProvisionDialogComponent, AccessPermission>>(MatDialogRef);
  private readonly service = inject(PermissionsService);
  private readonly accessRequests = inject(AccessRequestsService);
  readonly search = new FormControl<string | null>(null);
  readonly selected = signal<AccessRequest | null>(null);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly requests = new PagedList<AccessRequest>((q) => this.accessRequests.search(q), () => ({ status: 'Approved', search: this.search.value }), { pageSize: 10 });

  constructor() {
    this.requests.load();
  }

  provision(): void {
    const r = this.selected();
    if (!r) return;
    this.saving.set(true);
    this.error.set(null);
    this.service.provision(r.accessRequestId).subscribe({
      next: (p) => this.ref.close(p),
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(asApiError(err));
      },
    });
  }
}

@Component({
  selector: 'eiw-permission-list',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Access permissions</h1>
        <div class="page-actions">
          @if (session.hasPermission('Permissions.Provision')) {
            <button mat-flat-button type="button" (click)="provision()"><mat-icon>key</mat-icon>Provision from request</button>
          }
        </div>
      </header>

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Employee or request" />
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Status</mat-label>
          <mat-select formControlName="status">
            <mat-option [value]="null">All</mat-option>
            @for (s of lk.lookups()?.permissionStatuses ?? []; track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-3" subscriptSizing="dynamic">
          <mat-label>Location</mat-label>
          <mat-select formControlName="locationId">
            <mat-option [value]="null">All locations</mat-option>
            @for (l of lk.lookups()?.locations ?? []; track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Expiring within</mat-label>
          <mat-select formControlName="expiringWithinDays">
            <mat-option [value]="null">Any time</mat-option>
            <mat-option [value]="7">7 days</mat-option>
            <mat-option [value]="30">30 days</mat-option>
            <mat-option [value]="90">90 days</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="col-6 col-md-2 d-flex gap-1">
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
          <table mat-table [dataSource]="list.items()" matSort (matSortChange)="list.onSort($event)">
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
              <td mat-cell *matCellDef="let p">{{ p.employeeName }} <span class="text-muted small">{{ p.employeeNumber }}</span></td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
              <td mat-cell *matCellDef="let p">{{ p.locationName }}</td>
            </ng-container>
            <ng-container matColumnDef="requestNumber">
              <th mat-header-cell *matHeaderCellDef>Request</th>
              <td mat-cell *matCellDef="let p">
                @if (p.accessRequestId) {
                  <a [routerLink]="['/access-requests', p.accessRequestId]">{{ p.requestNumber }}</a>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="validFromUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Valid from</th>
              <td mat-cell *matCellDef="let p">{{ p.validFromUtc | date: 'medium' }}</td>
            </ng-container>
            <ng-container matColumnDef="validToUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Valid to</th>
              <td mat-cell *matCellDef="let p">{{ p.validToUtc | date: 'medium' }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
              <td mat-cell *matCellDef="let p">
                <eiw-status [value]="p.status" />
                @if (p.revokeReason) {
                  <div class="text-muted small">{{ p.revokeReason }}</div>
                }
              </td>
            </ng-container>
            <ng-container matColumnDef="provisioned">
              <th mat-header-cell *matHeaderCellDef>Provisioned</th>
              <td mat-cell *matCellDef="let p">{{ p.provisionedAtUtc | date: 'mediumDate' }}<div class="text-muted small">{{ p.provisionedByName }}</div></td>
            </ng-container>
            <ng-container matColumnDef="sync">
              <th mat-header-cell *matHeaderCellDef>Controller sync</th>
              <td mat-cell *matCellDef="let p">{{ p.controllerSyncStatus ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let p">
                @if (p.status === 'Active' && session.hasPermission('Permissions.Revoke')) {
                  <button mat-button type="button" class="danger-action" (click)="revoke(p)"><mat-icon>block</mat-icon>Revoke</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No access permissions match the current filters." icon="key_off" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class PermissionListComponent {
  private readonly service = inject(PermissionsService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly columns = ['employeeName', 'locationName', 'requestNumber', 'validFromUtc', 'validToUtc', 'status', 'provisioned', 'sync', 'actions'];

  readonly filters = new FormGroup({
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    locationId: new FormControl<number | null>(null),
    expiringWithinDays: new FormControl<number | null>(null),
  });

  readonly list = new PagedList<AccessPermission>((q) => this.service.search(q), () => this.filters.getRawValue());

  constructor() {
    this.lk.ensure();
    this.list.load();
  }

  provision(): void {
    this.dialog
      .open<ProvisionDialogComponent, void, AccessPermission>(ProvisionDialogComponent, { width: '640px' })
      .afterClosed()
      .pipe(filter((p): p is AccessPermission => !!p))
      .subscribe(() => {
        this.notifier.success('Access permission provisioned.');
        this.list.load();
      });
  }

  revoke(p: AccessPermission): void {
    askReason(this.dialog, {
      title: 'Revoke access permission',
      message: `${p.employeeName} will lose access to ${p.locationName} immediately.`,
      label: 'Reason',
      required: true,
      maxLength: 500,
      confirmText: 'Revoke',
      danger: true,
    }).subscribe((r) => {
      this.list.loading.set(true);
      this.service.revoke(p.permissionId, r.text).subscribe({
        next: () => {
          this.notifier.success('Access permission revoked.');
          this.list.load();
        },
        error: (err: unknown) => {
          this.list.loading.set(false);
          this.notifier.error(err);
        },
      });
    });
  }
}
