import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { ApiError } from '../../core/models/api.models';
import { asApiError } from '../reports/reports.models';
import { AuditLog, actionTone, diffAudit, prettyJson, utcDate } from './audit.models';
import { AuditService } from './audit.service';

/** Read-only detail of one immutable audit row: before/after JSON side by side. */
@Component({
  selector: 'eiw-audit-detail-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0 0 1rem; }
    dt { font-weight: 600; }
    dd { margin: 0; word-break: break-word; }
    pre { background: rgba(0, 0, 0, 0.04); padding: 0.75rem; border-radius: 4px; max-height: 320px; overflow: auto; font-size: 0.8rem; margin: 0; white-space: pre-wrap; word-break: break-word; }
    table.diff { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    table.diff th, table.diff td { padding: 0.3rem 0.5rem; border-bottom: 1px solid rgba(0, 0, 0, 0.08); vertical-align: top; text-align: left; word-break: break-word; }
    tr.added td.after, tr.changed td.after { background: rgba(46, 125, 50, 0.12); }
    tr.removed td.before, tr.changed td.before { background: rgba(198, 40, 40, 0.12); text-decoration: line-through; }
    code { font-size: 0.8rem; }
  `,
  template: `
    <h2 mat-dialog-title>Audit entry #{{ log.auditLogId }}</h2>
    <mat-dialog-content>
      <dl>
        <dt>When</dt><dd>{{ occurred | date: 'medium' }}</dd>
        <dt>Actor</dt><dd>{{ log.actorName || 'System' }}@if (log.actorUserId) { (#{{ log.actorUserId }}) }</dd>
        <dt>Action</dt><dd><span class="status-chip" [class]="'status-chip tone-' + tone">{{ log.action }}</span></dd>
        <dt>Entity</dt><dd>{{ log.entityType || '\u2014' }} {{ log.entityId ? '#' + log.entityId : '' }}</dd>
        @if (log.summary) { <dt>Summary</dt><dd>{{ log.summary }}</dd> }
        @if (log.reason) { <dt>Reason</dt><dd>{{ log.reason }}</dd> }
        <dt>Correlation ID</dt><dd><code class="correlation">{{ log.correlationId || '\u2014' }}</code></dd>
        @if (log.ipAddress) { <dt>IP address</dt><dd>{{ log.ipAddress }}</dd> }
      </dl>

      @if (diff.length) {
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h3 class="h6 m-0">Changes ({{ changedCount }} field{{ changedCount === 1 ? '' : 's' }})</h3>
          <mat-slide-toggle [checked]="showAll()" (change)="showAll.set($event.checked)">Show unchanged</mat-slide-toggle>
        </div>
        <table class="diff mb-3" aria-label="Field changes">
          <thead><tr><th scope="col">Field</th><th scope="col">Old value</th><th scope="col">New value</th></tr></thead>
          <tbody>
            @for (d of visibleDiff(); track d.path) {
              <tr [class]="d.kind">
                <td><code>{{ d.path }}</code></td>
                <td class="before">{{ d.before }}</td>
                <td class="after">{{ d.after }}</td>
              </tr>
            } @empty {
              <tr><td colspan="3">No field values changed.</td></tr>
            }
          </tbody>
        </table>
      }

      <div class="row g-2">
        <div class="col-12 col-md-6">
          <h3 class="h6">Old values</h3>
          <pre>{{ before || '(none)' }}</pre>
        </div>
        <div class="col-12 col-md-6">
          <h3 class="h6">New values</h3>
          <pre>{{ after || '(none)' }}</pre>
        </div>
      </div>
      <p class="mt-2 mb-0 small text-muted"><mat-icon inline>lock</mat-icon> Audit entries are immutable and cannot be edited or deleted.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (log.entityType && log.entityId && !data.hideTimeline) {
        <button mat-button type="button" (click)="openTimeline()"><mat-icon>timeline</mat-icon>Entity timeline</button>
      }
      <button mat-flat-button mat-dialog-close type="button">Close</button>
    </mat-dialog-actions>
  `,
})
export class AuditDetailDialogComponent {
  readonly data = inject<{ log: AuditLog; hideTimeline?: boolean }>(MAT_DIALOG_DATA);
  private readonly dialog = inject(MatDialog);
  readonly log = this.data.log;
  readonly occurred = utcDate(this.log.occurredAtUtc);
  readonly tone = actionTone(this.log.action);
  readonly before = prettyJson(this.log.beforeJson);
  readonly after = prettyJson(this.log.afterJson);
  readonly diff = diffAudit(this.log.beforeJson, this.log.afterJson);
  readonly changedCount = this.diff.filter((d) => d.kind !== 'same').length;
  readonly showAll = signal(false);
  readonly visibleDiff = computed(() => (this.showAll() ? this.diff : this.diff.filter((d) => d.kind !== 'same')));

  openTimeline(): void {
    openAuditTimeline(this.dialog, this.log.entityType!, this.log.entityId!);
  }
}

/** Chronological history of one entity (GET v1/audit-logs/timeline). */
@Component({
  selector: 'eiw-audit-timeline-dialog',
  imports: [DatePipe, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    ol { list-style: none; padding: 0; margin: 0; border-left: 2px solid rgba(0, 0, 0, 0.12); }
    li { position: relative; padding: 0 0 1rem 1rem; }
    li::before { content: ''; position: absolute; left: -6px; top: 0.35rem; width: 10px; height: 10px; border-radius: 50%; background: #3f6ad8; }
    button.entry { all: unset; cursor: pointer; display: block; width: 100%; }
    button.entry:focus-visible { outline: 2px solid #3f6ad8; }
    .meta { font-size: 0.8rem; color: rgba(0, 0, 0, 0.6); }
  `,
  template: `
    <h2 mat-dialog-title>Timeline: {{ data.entityType }} #{{ data.entityId }}</h2>
    <mat-dialog-content>
      @if (loading()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error(); as e) {
        <div class="error-state" role="alert">
          <p>{{ e.message }}</p>
          @if (e.correlationId) { <p class="correlation">Reference: {{ e.correlationId }}</p> }
          <button mat-stroked-button type="button" (click)="load()">Retry</button>
        </div>
      }
      @if (items(); as list) {
        @if (list.length) {
          <ol>
            @for (l of list; track l.auditLogId) {
              <li>
                <button class="entry" type="button" (click)="open(l)">
                  <strong>{{ l.action }}</strong> &middot; {{ l.actorName || 'System' }}
                  <div class="meta">{{ when(l) | date: 'medium' }}</div>
                  @if (l.summary) { <div>{{ l.summary }}</div> }
                </button>
              </li>
            }
          </ol>
        } @else {
          <div class="empty-state"><mat-icon>history</mat-icon><p>No audit history for this entity.</p></div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button mat-dialog-close type="button">Close</button></mat-dialog-actions>
  `,
})
export class AuditTimelineDialogComponent {
  readonly data = inject<{ entityType: string; entityId: string }>(MAT_DIALOG_DATA);
  private readonly service = inject(AuditService);
  private readonly dialog = inject(MatDialog);
  readonly items = signal<AuditLog[] | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);

  constructor() {
    this.load();
  }

  when(l: AuditLog): Date | null {
    return utcDate(l.occurredAtUtc);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.timeline(this.data.entityType, this.data.entityId).subscribe({
      next: (list) => {
        this.items.set(list ?? []);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  open(log: AuditLog): void {
    this.dialog.open(AuditDetailDialogComponent, { data: { log, hideTimeline: true }, width: '960px', maxWidth: '95vw' });
  }
}

export function openAuditTimeline(dialog: MatDialog, entityType: string, entityId: string): void {
  dialog.open(AuditTimelineDialogComponent, { data: { entityType, entityId }, width: '640px', maxWidth: '95vw' });
}
