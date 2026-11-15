import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Observable, filter } from 'rxjs';

import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, PagedList, endOfDayIso, humanize, startOfDayIso } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS, askReason } from '../approvals/kit/ui.components';
import { NewPassDialogComponent, NewPassDialogData, RegisterVisitorDialogComponent } from './visitor-dialogs.component';
import { PassAction, Visitor, VisitorPass, passActions } from './visitors.models';
import { VisitorsService } from './visitors.service';

@Component({
  selector: 'eiw-visitors-page',
  imports: [
    ReactiveFormsModule, DatePipe, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatMenuModule, MatTabsModule, MatDatepickerModule, ...KIT_IMPORTS,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Visitors</h1>
        <div class="page-actions">
          @if (canManage) {
            <button mat-stroked-button type="button" (click)="registerVisitor()"><mat-icon>person_add</mat-icon>Register visitor</button>
            <button mat-flat-button type="button" (click)="newPass()"><mat-icon>badge</mat-icon>New pass</button>
          }
        </div>
      </header>

      <mat-tab-group mat-stretch-tabs="false" (selectedIndexChange)="onTab($event)">
        <mat-tab label="Visitor passes">
          <form class="filter-bar row g-2 align-items-center mt-2" [formGroup]="passFilters" (ngSubmit)="passes.search()">
            <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
              <mat-label>Search</mat-label>
              <input matInput formControlName="search" placeholder="Pass number or visitor" />
            </mat-form-field>
            <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                <mat-option [value]="null">All</mat-option>
                @for (s of lk.lookups()?.visitorPassStatuses ?? []; track s) {
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
            <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
              <mat-label>Valid between</mat-label>
              <mat-date-range-input [rangePicker]="picker">
                <input matStartDate formControlName="from" placeholder="From" />
                <input matEndDate formControlName="to" placeholder="To" />
              </mat-date-range-input>
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-date-range-picker #picker />
            </mat-form-field>
            <mat-form-field class="col-6 col-md-1" subscriptSizing="dynamic">
              <mat-label>On site</mat-label>
              <mat-select formControlName="onSite">
                <mat-option [value]="null">Any</mat-option>
                <mat-option [value]="true">Yes</mat-option>
                <mat-option [value]="false">No</mat-option>
              </mat-select>
            </mat-form-field>
            <div class="col-12 col-md-2 d-flex gap-1">
              <button mat-flat-button type="submit">Apply</button>
              <button mat-button type="button" (click)="passFilters.reset(); passes.search()">Reset</button>
            </div>
          </form>

          <div class="data-card">
            @if (passes.loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <eiw-error-state [error]="passes.error()" (retry)="passes.load()" />
            <div class="table-wrap">
              <table mat-table [dataSource]="passes.items()" matSort matSortActive="validFromUtc" matSortDirection="desc" (matSortChange)="passes.onSort($event)">
                <ng-container matColumnDef="passNumber">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Pass</th>
                  <td mat-cell *matCellDef="let p">{{ p.passNumber }}</td>
                </ng-container>
                <ng-container matColumnDef="visitorName">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Visitor</th>
                  <td mat-cell *matCellDef="let p">{{ p.visitorName }}<div class="text-muted small">{{ p.organization }}</div></td>
                </ng-container>
                <ng-container matColumnDef="locationName">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
                  <td mat-cell *matCellDef="let p">{{ p.locationName }}</td>
                </ng-container>
                <ng-container matColumnDef="validFromUtc">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Validity</th>
                  <td mat-cell *matCellDef="let p">{{ p.validFromUtc | date: 'short' }} – {{ p.validToUtc | date: 'short' }}</td>
                </ng-container>
                <ng-container matColumnDef="sponsorName">
                  <th mat-header-cell *matHeaderCellDef>Sponsor</th>
                  <td mat-cell *matCellDef="let p">{{ p.sponsorName ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Status</th>
                  <td mat-cell *matCellDef="let p">
                    <eiw-status [value]="p.status" />
                    @if (p.checkedInAtUtc) {
                      <div class="text-muted small">In {{ p.checkedInAtUtc | date: 'shortTime' }}{{ p.checkedOutAtUtc ? ' · Out ' + (p.checkedOutAtUtc | date: 'shortTime') : '' }}</div>
                    }
                    @if (p.revokeReason) {
                      <div class="text-muted small">{{ p.revokeReason }}</div>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
                  <td mat-cell *matCellDef="let p">
                    @let acts = actionsFor(p);
                    @if (acts.length) {
                      <button mat-icon-button type="button" [matMenuTriggerFor]="menu" [attr.aria-label]="'Actions for ' + p.passNumber"><mat-icon>more_vert</mat-icon></button>
                      <mat-menu #menu="matMenu">
                        @for (a of acts; track a) {
                          <button mat-menu-item type="button" (click)="act(p, a)"><mat-icon>{{ actionIcon[a] }}</mat-icon>{{ actionLabel[a] }}</button>
                        }
                      </mat-menu>
                    }
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="passColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: passColumns"></tr>
              </table>
            </div>
            @if (passes.empty()) {
              <eiw-empty-state message="No visitor passes match the current filters." icon="badge" />
            }
            <mat-paginator [length]="passes.total()" [pageIndex]="passes.page() - 1" [pageSize]="passes.pageSize()"
              [pageSizeOptions]="passes.pageSizeOptions" (page)="passes.onPage($event)" showFirstLastButtons />
          </div>
        </mat-tab>

        <mat-tab label="Visitors">
          <form class="filter-bar row g-2 align-items-center mt-2" (ngSubmit)="visitors.search()">
            <mat-form-field class="col-12 col-md-4" subscriptSizing="dynamic">
              <mat-label>Search visitors</mat-label>
              <input matInput [formControl]="visitorSearch" placeholder="Name or organization" />
            </mat-form-field>
            <div class="col-12 col-md-2"><button mat-flat-button type="submit">Search</button></div>
          </form>
          <div class="data-card">
            @if (visitors.loading()) {
              <mat-progress-bar mode="indeterminate" />
            }
            <eiw-error-state [error]="visitors.error()" (retry)="visitors.load()" />
            <div class="table-wrap">
              <table mat-table [dataSource]="visitors.items()" matSort (matSortChange)="visitors.onSort($event)">
                <ng-container matColumnDef="displayName">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
                  <td mat-cell *matCellDef="let v">
                    {{ v.displayName }}
                    @if (v.isBlacklisted) {
                      <span class="status-chip tone-danger"><mat-icon aria-hidden="true">block</mat-icon>Blacklisted</span>
                    }
                  </td>
                </ng-container>
                <ng-container matColumnDef="organization">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Organization</th>
                  <td mat-cell *matCellDef="let v">{{ v.organization ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="visitPurpose">
                  <th mat-header-cell *matHeaderCellDef>Purpose</th>
                  <td mat-cell *matCellDef="let v">{{ v.visitPurpose }}</td>
                </ng-container>
                <ng-container matColumnDef="sponsorName">
                  <th mat-header-cell *matHeaderCellDef>Sponsor</th>
                  <td mat-cell *matCellDef="let v">{{ v.sponsorName ?? '—' }}</td>
                </ng-container>
                <ng-container matColumnDef="passCount">
                  <th mat-header-cell *matHeaderCellDef class="num">Passes</th>
                  <td mat-cell *matCellDef="let v" class="num">{{ v.passCount }}</td>
                </ng-container>
                <ng-container matColumnDef="createdAtUtc">
                  <th mat-header-cell *matHeaderCellDef mat-sort-header>Registered</th>
                  <td mat-cell *matCellDef="let v">{{ v.createdAtUtc | date: 'mediumDate' }}</td>
                </ng-container>
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
                  <td mat-cell *matCellDef="let v">
                    @if (canManage && !v.isBlacklisted) {
                      <button mat-button type="button" (click)="newPass(v)"><mat-icon>badge</mat-icon>New pass</button>
                    }
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="visitorColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: visitorColumns"></tr>
              </table>
            </div>
            @if (visitors.empty()) {
              <eiw-empty-state message="No visitors found." icon="person_search" />
            }
            <mat-paginator [length]="visitors.total()" [pageIndex]="visitors.page() - 1" [pageSize]="visitors.pageSize()"
              [pageSizeOptions]="visitors.pageSizeOptions" (page)="visitors.onPage($event)" showFirstLastButtons />
          </div>
        </mat-tab>
      </mat-tab-group>
    </section>
  `,
})
export class VisitorsPageComponent {
  private readonly service = inject(VisitorsService);
  private readonly dialog = inject(MatDialog);
  private readonly notifier = inject(Notifier);
  private readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;
  readonly canManage = this.session.hasPermission('Visitors.Manage');
  readonly passColumns = ['passNumber', 'visitorName', 'locationName', 'validFromUtc', 'sponsorName', 'status', 'actions'];
  readonly visitorColumns = ['displayName', 'organization', 'visitPurpose', 'sponsorName', 'passCount', 'createdAtUtc', 'actions'];
  readonly actionLabel: Record<PassAction, string> = { approve: 'Approve', checkIn: 'Check in', checkOut: 'Check out', revoke: 'Revoke' };
  readonly actionIcon: Record<PassAction, string> = { approve: 'check', checkIn: 'login', checkOut: 'logout', revoke: 'block' };

  readonly passFilters = new FormGroup({
    search: new FormControl<string | null>(null),
    status: new FormControl<string | null>(null),
    locationId: new FormControl<number | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
    onSite: new FormControl<boolean | null>(null),
  });
  readonly visitorSearch = new FormControl<string | null>(null);

  readonly passes = new PagedList<VisitorPass>(
    (q) => this.service.passes(q),
    () => {
      const f = this.passFilters.getRawValue();
      return { ...f, from: startOfDayIso(f.from), to: endOfDayIso(f.to) };
    },
    { sortBy: 'validFromUtc', sortDir: 'desc' },
  );
  readonly visitors = new PagedList<Visitor>((q) => this.service.visitors(q), () => ({ search: this.visitorSearch.value }));

  constructor() {
    this.lk.ensure();
    this.passes.load();
  }

  onTab(index: number): void {
    if (index === 1 && !this.visitors.loaded()) this.visitors.load();
  }

  actionsFor(p: VisitorPass): PassAction[] {
    return passActions(p.status, (c) => this.session.hasPermission(c));
  }

  act(p: VisitorPass, action: PassAction): void {
    switch (action) {
      case 'approve':
        askReason(this.dialog, { title: `Approve pass ${p.passNumber}`, label: 'Comments (optional)', required: false, maxLength: 500, confirmText: 'Approve' })
          .subscribe((r) => this.run(this.service.approve(p.visitorPassId, r.text), `Pass ${p.passNumber} approved.`));
        break;
      case 'checkIn':
        this.run(this.service.checkIn(p.visitorPassId), `${p.visitorName} checked in.`);
        break;
      case 'checkOut':
        this.run(this.service.checkOut(p.visitorPassId), `${p.visitorName} checked out.`);
        break;
      case 'revoke':
        askReason(this.dialog, { title: `Revoke pass ${p.passNumber}`, label: 'Reason', required: true, maxLength: 500, confirmText: 'Revoke', danger: true })
          .subscribe((r) => this.run(this.service.revoke(p.visitorPassId, r.text), `Pass ${p.passNumber} revoked.`));
        break;
    }
  }

  registerVisitor(): void {
    this.dialog
      .open<RegisterVisitorDialogComponent, void, Visitor>(RegisterVisitorDialogComponent, { width: '640px' })
      .afterClosed()
      .pipe(filter((v): v is Visitor => !!v))
      .subscribe((v) => {
        this.notifier.success(`${v.displayName} registered.`);
        if (this.visitors.loaded()) this.visitors.load();
      });
  }

  newPass(visitor?: Visitor): void {
    this.dialog
      .open<NewPassDialogComponent, NewPassDialogData, VisitorPass>(NewPassDialogComponent, { width: '640px', data: { visitor: visitor ?? null } })
      .afterClosed()
      .pipe(filter((p): p is VisitorPass => !!p))
      .subscribe((p) => {
        this.notifier.success(`Pass ${p.passNumber} created${p.status === 'PendingApproval' ? ' and sent for approval' : ''}.`);
        this.passes.load();
        if (this.visitors.loaded()) this.visitors.load();
      });
  }

  private run(op: Observable<unknown>, message: string): void {
    this.passes.loading.set(true);
    op.subscribe({
      next: () => {
        this.notifier.success(message);
        this.passes.load();
      },
      error: (err: unknown) => {
        this.passes.loading.set(false);
        this.notifier.error(err);
      },
    });
  }
}
