import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import {
  FeatureLookups, Notifier, PagedList, asApiError, endOfDayIso, localInputToIso, startOfDayIso, toLocalInput,
} from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { AccessLog, RFID_POLL_INTERVAL_MS, RfidIngestResult, isFutureBeyondSkew } from './rfid-monitor.models';
import { RfidMonitorService } from './rfid-monitor.service';

function notTooFarInFuture(control: AbstractControl): ValidationErrors | null {
  const iso = localInputToIso(control.value as string);
  if (!iso) return null;
  return isFutureBeyondSkew(new Date(iso)) ? { future: true } : null;
}

@Component({
  selector: 'eiw-rfid-monitor',
  imports: [
    ReactiveFormsModule, DatePipe, RouterLink, MatTableModule, MatSortModule, MatPaginatorModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatSlideToggleModule,
    MatDatepickerModule, MatExpansionModule, ...KIT_IMPORTS,
  ],
  providers: [provideNativeDateAdapter()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>RFID monitor</h1>
        <div class="page-actions align-items-center">
          <mat-slide-toggle [checked]="autoRefresh()" (change)="setAutoRefresh($event.checked)">Auto refresh (15s)</mat-slide-toggle>
          @if (lastRefreshed(); as t) {
            <span class="text-muted small" aria-live="polite">Updated {{ t | date: 'mediumTime' }}</span>
          }
          <button mat-stroked-button type="button" (click)="refresh()"><mat-icon>refresh</mat-icon>Refresh</button>
        </div>
      </header>

      @if (session.hasPermission('Rfid.Ingest')) {
        <mat-expansion-panel class="mb-3">
          <mat-expansion-panel-header>
            <mat-panel-title><mat-icon class="me-2">contactless</mat-icon>Simulate card swipe</mat-panel-title>
          </mat-expansion-panel-header>
          <form class="row g-2" [formGroup]="swipe" (ngSubmit)="simulate()">
            <mat-form-field class="col-12 col-md-3">
              <mat-label>Reader</mat-label>
              <mat-select formControlName="readerId" required>
                @for (r of lk.lookups()?.readers ?? []; track r.id) {
                  <mat-option [value]="readerKey(r.id)">{{ r.name }}</mat-option>
                }
              </mat-select>
              @if (swipe.controls.readerId.hasError('required')) {
                <mat-error>Select a reader.</mat-error>
              }
            </mat-form-field>
            <mat-form-field class="col-12 col-md-3">
              <mat-label>Card UID (hex)</mat-label>
              <input matInput formControlName="cardUid" autocomplete="off" required />
              @if (swipe.controls.cardUid.hasError('required')) {
                <mat-error>Card UID is required.</mat-error>
              } @else if (swipe.controls.cardUid.hasError('pattern')) {
                <mat-error>Use 4–32 hexadecimal characters.</mat-error>
              }
            </mat-form-field>
            <mat-form-field class="col-6 col-md-2">
              <mat-label>Event</mat-label>
              <mat-select formControlName="eventType">
                <mat-option value="Entry">Entry</mat-option>
                <mat-option value="Exit">Exit</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field class="col-6 col-md-2">
              <mat-label>Event time</mat-label>
              <input matInput type="datetime-local" formControlName="eventAt" required />
              @if (swipe.controls.eventAt.hasError('future')) {
                <mat-error>Cannot be more than 5 minutes in the future.</mat-error>
              } @else if (swipe.controls.eventAt.hasError('required')) {
                <mat-error>Required.</mat-error>
              }
            </mat-form-field>
            <mat-form-field class="col-12 col-md-2">
              <mat-label>External event id</mat-label>
              <input matInput formControlName="externalEventId" required maxlength="100" />
              @if (swipe.controls.externalEventId.hasError('required')) {
                <mat-error>Required.</mat-error>
              }
            </mat-form-field>
            <div class="col-12 d-flex gap-2 align-items-center flex-wrap">
              <button mat-flat-button type="submit" [disabled]="swiping()"><mat-icon>send</mat-icon>Send swipe</button>
              <button mat-button type="button" (click)="resetSwipe()">New event id</button>
              @if (swiping()) {
                <mat-progress-bar class="flex-grow-1" mode="indeterminate" />
              }
              @if (swipeResult(); as res) {
                <span aria-live="polite">
                  <eiw-status [value]="res.decision ?? res.processingStatus" />
                  {{ res.isDuplicate ? 'Duplicate event (already processed).' : '' }}
                  {{ res.denialReason }}
                  @if (res.violationId) {
                    <a routerLink="/violations">Violation #{{ res.violationId }} raised</a>
                  }
                </span>
              }
            </div>
            <div class="col-12"><eiw-error-state [error]="swipeError()" [retryable]="false" /></div>
          </form>
        </mat-expansion-panel>
      }

      <form class="filter-bar row g-2 align-items-center" [formGroup]="filters" (ngSubmit)="list.search()">
        <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
          <mat-label>Search</mat-label>
          <input matInput formControlName="search" placeholder="Employee, reader, event id" />
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
          <mat-label>Reader</mat-label>
          <mat-select formControlName="readerId">
            <mat-option [value]="null">All</mat-option>
            @for (r of lk.lookups()?.readers ?? []; track r.id) {
              <mat-option [value]="readerKey(r.id)">{{ r.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-1" subscriptSizing="dynamic">
          <mat-label>Result</mat-label>
          <mat-select formControlName="decision">
            <mat-option [value]="null">All</mat-option>
            <mat-option value="Granted">Granted</mat-option>
            <mat-option value="Denied">Denied</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field class="col-6 col-md-2" subscriptSizing="dynamic">
          <mat-label>Date range</mat-label>
          <mat-date-range-input [rangePicker]="picker">
            <input matStartDate formControlName="from" placeholder="From" />
            <input matEndDate formControlName="to" placeholder="To" />
          </mat-date-range-input>
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-date-range-picker #picker />
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
          <table mat-table [dataSource]="list.items()" matSort matSortActive="eventAtUtc" matSortDirection="desc" (matSortChange)="list.onSort($event)">
            <ng-container matColumnDef="eventAtUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Time</th>
              <td mat-cell *matCellDef="let e">{{ e.eventAtUtc | date: 'medium' }}</td>
            </ng-container>
            <ng-container matColumnDef="readerName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Reader</th>
              <td mat-cell *matCellDef="let e">{{ e.readerName ?? e.readerId }}</td>
            </ng-container>
            <ng-container matColumnDef="locationName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Location</th>
              <td mat-cell *matCellDef="let e">{{ e.locationName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="maskedCardUid">
              <th mat-header-cell *matHeaderCellDef>Card</th>
              <td mat-cell *matCellDef="let e"><code>{{ e.maskedCardUid ?? '—' }}</code></td>
            </ng-container>
            <ng-container matColumnDef="employeeName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
              <td mat-cell *matCellDef="let e">{{ e.employeeName ?? 'Unknown' }}</td>
            </ng-container>
            <ng-container matColumnDef="eventType">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Event</th>
              <td mat-cell *matCellDef="let e">{{ e.eventType }}</td>
            </ng-container>
            <ng-container matColumnDef="decision">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Result</th>
              <td mat-cell *matCellDef="let e">
                <eiw-status [value]="e.decision ?? e.processingStatus" />
                @if (e.denialReason) {
                  <div class="text-muted small">{{ e.denialReason }}</div>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        @if (list.empty()) {
          <eiw-empty-state message="No access events match the current filters." icon="sensors_off" />
        }
        <mat-paginator [length]="list.total()" [pageIndex]="list.page() - 1" [pageSize]="list.pageSize()"
          [pageSizeOptions]="list.pageSizeOptions" (page)="list.onPage($event)" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class RfidMonitorComponent {
  private readonly service = inject(RfidMonitorService);
  private readonly notifier = inject(Notifier);
  readonly session = inject(SessionService);
  readonly lk = inject(FeatureLookups);
  readonly columns = ['eventAtUtc', 'readerName', 'locationName', 'maskedCardUid', 'employeeName', 'eventType', 'decision'];

  readonly autoRefresh = signal(false);
  readonly lastRefreshed = signal<Date | null>(null);
  readonly swiping = signal(false);
  readonly swipeResult = signal<RfidIngestResult | null>(null);
  readonly swipeError = signal<ApiError | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly filters = new FormGroup({
    search: new FormControl<string | null>(null),
    locationId: new FormControl<number | null>(null),
    readerId: new FormControl<string | null>(null),
    decision: new FormControl<string | null>(null),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  readonly swipe = new FormGroup({
    readerId: new FormControl<string>('', { nonNullable: true, validators: [Validators.required] }),
    cardUid: new FormControl<string>('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[0-9A-Fa-f]{4,32}$/)] }),
    eventType: new FormControl<'Entry' | 'Exit'>('Entry', { nonNullable: true }),
    eventAt: new FormControl<string>(toLocalInput(new Date()), { nonNullable: true, validators: [Validators.required, notTooFarInFuture] }),
    externalEventId: new FormControl<string>(this.newEventId(), { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
  });

  readonly list = new PagedList<AccessLog>(
    (q) => this.service.events(q),
    () => {
      const f = this.filters.getRawValue();
      return { search: f.search, locationId: f.locationId, readerId: f.readerId, decision: f.decision, from: startOfDayIso(f.from), to: endOfDayIso(f.to) };
    },
    { sortBy: 'eventAtUtc', sortDir: 'desc' },
  );

  constructor() {
    this.lk.ensure();
    this.refresh();
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  /** API reader ids are strings (lookup model types them as numbers). */
  readerKey(id: unknown): string {
    return String(id);
  }

  refresh(silent = false): void {
    this.list.load(silent);
    this.lastRefreshed.set(new Date());
  }

  setAutoRefresh(on: boolean): void {
    this.autoRefresh.set(on);
    this.stopTimer();
    if (on) this.timer = setInterval(() => this.refresh(true), RFID_POLL_INTERVAL_MS);
  }

  simulate(): void {
    if (this.swipe.invalid) {
      this.swipe.markAllAsTouched();
      return;
    }
    const v = this.swipe.getRawValue();
    this.swiping.set(true);
    this.swipeError.set(null);
    this.swipeResult.set(null);
    this.service
      .ingest({
        readerId: v.readerId,
        cardUid: v.cardUid.trim().toUpperCase(),
        eventType: v.eventType,
        eventAtUtc: localInputToIso(v.eventAt) ?? new Date().toISOString(),
        externalEventId: v.externalEventId.trim(),
      })
      .subscribe({
        next: (res) => {
          this.swiping.set(false);
          this.swipeResult.set(res);
          this.notifier.success(res.isDuplicate ? 'Duplicate event ignored.' : `Swipe processed: ${res.decision ?? res.processingStatus}.`);
          this.swipe.patchValue({ externalEventId: this.newEventId(), eventAt: toLocalInput(new Date()) });
          this.refresh(true);
        },
        error: (err: unknown) => {
          this.swiping.set(false);
          this.swipeError.set(asApiError(err));
        },
      });
  }

  resetSwipe(): void {
    this.swipe.patchValue({ externalEventId: this.newEventId(), eventAt: toLocalInput(new Date()) });
    this.swipeResult.set(null);
    this.swipeError.set(null);
  }

  private newEventId(): string {
    return `SIM-${Date.now()}`;
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
