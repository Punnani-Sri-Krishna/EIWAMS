import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { AccessPermission } from '../permissions/permissions.models';
import { PermissionsService } from '../permissions/permissions.service';
import { Card, EmployeeDetail, EmployeeHistory } from './employees.models';
import { EmployeesService } from './employees.service';

interface TabState<T> {
  loading: boolean;
  error: ApiError | null;
  items: T[];
  loaded: boolean;
}

function emptyTab<T>(): TabState<T> {
  return { loading: false, error: null, items: [], loaded: false };
}

@Component({
  selector: 'eiw-employee-detail',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, MatTabsModule, MatTableModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>
          {{ employee()?.fullName ?? 'Employee' }}
          @if (employee(); as e) {
            <eiw-status [value]="e.employmentStatus" />
          }
        </h1>
        <div class="page-actions">
          <a mat-button routerLink="/employees"><mat-icon>arrow_back</mat-icon>Employees</a>
        </div>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <eiw-error-state [error]="error()" (retry)="load()" />

      @if (employee(); as e) {
        <div class="data-card">
          <mat-tab-group (selectedIndexChange)="onTab($event)" animationDuration="0ms">
            <mat-tab label="Profile">
              <dl class="row p-3 mb-0">
                <dt class="col-sm-3">Employee number</dt><dd class="col-sm-9">{{ e.employeeNumber }}</dd>
                <dt class="col-sm-3">Work email</dt><dd class="col-sm-9">{{ e.workEmail }}</dd>
                <dt class="col-sm-3">Type</dt><dd class="col-sm-9">{{ e.employeeType }}</dd>
                <dt class="col-sm-3">Department</dt><dd class="col-sm-9">{{ e.departmentName }}</dd>
                <dt class="col-sm-3">Manager</dt><dd class="col-sm-9">{{ e.managerName ?? '—' }}</dd>
                <dt class="col-sm-3">Location</dt><dd class="col-sm-9">{{ e.locationName }}</dd>
                <dt class="col-sm-3">Join date</dt><dd class="col-sm-9">{{ e.joinDate | date: 'mediumDate' }}</dd>
                <dt class="col-sm-3">End date</dt><dd class="col-sm-9">{{ e.endDate ? (e.endDate | date: 'mediumDate') : '—' }}</dd>
                <dt class="col-sm-3">Active cards</dt><dd class="col-sm-9">{{ e.activeCardCount }}</dd>
                <dt class="col-sm-3">Active permissions</dt><dd class="col-sm-9">{{ e.activePermissionCount }}</dd>
                <dt class="col-sm-3">Open access requests</dt><dd class="col-sm-9">{{ e.openAccessRequestCount }}</dd>
                <dt class="col-sm-3">Last updated</dt><dd class="col-sm-9">{{ (e.updatedAtUtc ?? e.createdAtUtc) | date: 'medium' }}</dd>
              </dl>
            </mat-tab>

            <mat-tab label="History">
              @if (history().loading) {
                <mat-progress-bar mode="indeterminate" />
              }
              <eiw-error-state [error]="history().error" (retry)="loadHistory()" />
              @if (history().loaded && !history().error && !history().items.length) {
                <eiw-empty-state message="No history recorded for this employee." icon="history" />
              }
              @if (history().items.length) {
                <div class="table-wrap">
                  <table mat-table [dataSource]="history().items">
                    <ng-container matColumnDef="changedAtUtc">
                      <th mat-header-cell *matHeaderCellDef>When</th>
                      <td mat-cell *matCellDef="let h">{{ h.changedAtUtc | date: 'medium' }}</td>
                    </ng-container>
                    <ng-container matColumnDef="changeType">
                      <th mat-header-cell *matHeaderCellDef>Change</th>
                      <td mat-cell *matCellDef="let h">{{ h.changeType }}</td>
                    </ng-container>
                    <ng-container matColumnDef="summary">
                      <th mat-header-cell *matHeaderCellDef>Summary</th>
                      <td mat-cell *matCellDef="let h">{{ h.summary }}</td>
                    </ng-container>
                    <ng-container matColumnDef="effectiveDate">
                      <th mat-header-cell *matHeaderCellDef>Effective</th>
                      <td mat-cell *matCellDef="let h">{{ h.effectiveDate | date: 'mediumDate' }}</td>
                    </ng-container>
                    <ng-container matColumnDef="changedByName">
                      <th mat-header-cell *matHeaderCellDef>By</th>
                      <td mat-cell *matCellDef="let h">{{ h.changedByName }}</td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="historyColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: historyColumns"></tr>
                  </table>
                </div>
              }
            </mat-tab>

            <mat-tab label="Cards">
              @if (cards().loading) {
                <mat-progress-bar mode="indeterminate" />
              }
              <eiw-error-state [error]="cards().error" (retry)="loadCards()" />
              @if (cards().loaded && !cards().error && !cards().items.length) {
                <eiw-empty-state message="No cards issued to this employee." icon="credit_card" />
              }
              @if (cards().items.length) {
                <div class="table-wrap">
                  <table mat-table [dataSource]="cards().items">
                    <ng-container matColumnDef="maskedCardUid">
                      <th mat-header-cell *matHeaderCellDef>Card UID</th>
                      <td mat-cell *matCellDef="let c"><code>{{ c.maskedCardUid }}</code></td>
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
                      <th mat-header-cell *matHeaderCellDef>Status</th>
                      <td mat-cell *matCellDef="let c"><eiw-status [value]="c.status" /></td>
                    </ng-container>
                    <tr mat-header-row *matHeaderRowDef="cardColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: cardColumns"></tr>
                  </table>
                </div>
              }
            </mat-tab>

            @if (session.hasPermission('Permissions.View')) {
              <mat-tab label="Permissions">
                @if (permissions().loading) {
                  <mat-progress-bar mode="indeterminate" />
                }
                <eiw-error-state [error]="permissions().error" (retry)="loadPermissions()" />
                @if (permissions().loaded && !permissions().error && !permissions().items.length) {
                  <eiw-empty-state message="No access permissions for this employee." icon="key" />
                }
                @if (permissions().items.length) {
                  <div class="table-wrap">
                    <table mat-table [dataSource]="permissions().items">
                      <ng-container matColumnDef="locationName">
                        <th mat-header-cell *matHeaderCellDef>Location</th>
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
                      <ng-container matColumnDef="validity">
                        <th mat-header-cell *matHeaderCellDef>Valid</th>
                        <td mat-cell *matCellDef="let p">{{ p.validFromUtc | date: 'mediumDate' }} – {{ p.validToUtc | date: 'mediumDate' }}</td>
                      </ng-container>
                      <ng-container matColumnDef="status">
                        <th mat-header-cell *matHeaderCellDef>Status</th>
                        <td mat-cell *matCellDef="let p"><eiw-status [value]="p.status" /></td>
                      </ng-container>
                      <tr mat-header-row *matHeaderRowDef="permissionColumns"></tr>
                      <tr mat-row *matRowDef="let row; columns: permissionColumns"></tr>
                    </table>
                  </div>
                }
              </mat-tab>
            }
          </mat-tab-group>
        </div>
      }
    </section>
  `,
})
export class EmployeeDetailComponent {
  private readonly service = inject(EmployeesService);
  private readonly permissionsService = inject(PermissionsService);
  readonly session = inject(SessionService);
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));

  readonly employee = signal<EmployeeDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly history = signal<TabState<EmployeeHistory>>(emptyTab());
  readonly cards = signal<TabState<Card>>(emptyTab());
  readonly permissions = signal<TabState<AccessPermission>>(emptyTab());

  readonly historyColumns = ['changedAtUtc', 'changeType', 'summary', 'effectiveDate', 'changedByName'];
  readonly cardColumns = ['maskedCardUid', 'cardType', 'issuedAtUtc', 'expiresAtUtc', 'status'];
  readonly permissionColumns = ['locationName', 'requestNumber', 'validity', 'status'];

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get(this.id).subscribe({
      next: (e) => {
        this.employee.set(e);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  onTab(index: number): void {
    if (index === 1 && !this.history().loaded) this.loadHistory();
    if (index === 2 && !this.cards().loaded) this.loadCards();
    if (index === 3 && !this.permissions().loaded) this.loadPermissions();
  }

  loadHistory(): void {
    this.history.set({ ...emptyTab(), loading: true });
    this.service.history(this.id).subscribe({
      next: (items) => this.history.set({ loading: false, error: null, items: items ?? [], loaded: true }),
      error: (err: unknown) => this.history.set({ loading: false, error: asApiError(err), items: [], loaded: true }),
    });
  }

  loadCards(): void {
    this.cards.set({ ...emptyTab(), loading: true });
    this.service.cards(this.id).subscribe({
      next: (items) => this.cards.set({ loading: false, error: null, items: items ?? [], loaded: true }),
      error: (err: unknown) => this.cards.set({ loading: false, error: asApiError(err), items: [], loaded: true }),
    });
  }

  loadPermissions(): void {
    this.permissions.set({ ...emptyTab(), loading: true });
    this.permissionsService.search({ employeeId: this.id, page: 1, pageSize: 100 }).subscribe({
      next: (res) => this.permissions.set({ loading: false, error: null, items: res?.items ?? [], loaded: true }),
      error: (err: unknown) => this.permissions.set({ loading: false, error: asApiError(err), items: [], loaded: true }),
    });
  }

}
