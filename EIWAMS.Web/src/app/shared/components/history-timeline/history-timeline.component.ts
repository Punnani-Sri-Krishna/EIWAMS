import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { TimelineEntry } from '../../utils/stage-steps';

/** Vertical history timeline (newest last). */
@Component({
  selector: 'app-history-timeline',
  imports: [DatePipe, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (entries().length) {
      <ol class="timeline" [attr.aria-label]="label()">
        @for (e of entries(); track e.id) {
          <li class="entry">
            <span [class]="'marker tone-' + e.tone" aria-hidden="true"><mat-icon>{{ e.icon }}</mat-icon></span>
            <div class="body">
              <div class="head">
                <span class="title">{{ e.title }}</span>
                @if (e.at) {
                  <time class="at" [attr.datetime]="e.at">{{ e.at | date: 'd MMM y, HH:mm' }}</time>
                }
              </div>
              @if (e.actor || e.detail) {
                <div class="meta">
                  {{ e.actor }}
                  @if (e.actor && e.detail) {
                    <span aria-hidden="true">&middot;</span>
                  }
                  {{ e.detail }}
                </div>
              }
              @if (e.comments) {
                <blockquote class="comments">{{ e.comments }}</blockquote>
              }
            </div>
          </li>
        }
      </ol>
    } @else {
      <p class="none">{{ emptyText() }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .entry { position: relative; display: flex; gap: 12px; padding-bottom: 16px; }
    .entry:not(:last-child)::before {
      content: ''; position: absolute; left: 13px; top: 28px; bottom: 0; width: 2px; background: var(--lab-border);
    }
    .marker {
      width: 28px; height: 28px; flex: none; border-radius: 50%; display: grid; place-items: center;
      mat-icon { font-size: 16px; width: 16px; height: 16px; }
    }
    .tone-success { background: var(--lab-success-bg); color: var(--lab-success-fg); }
    .tone-warning { background: var(--lab-warning-bg); color: var(--lab-warning-fg); }
    .tone-danger { background: var(--lab-danger-bg); color: var(--lab-danger-fg); }
    .tone-info { background: var(--lab-info-bg); color: var(--lab-info-fg); }
    .tone-neutral { background: var(--lab-neutral-bg); color: var(--lab-neutral-fg); }
    .body { flex: 1; min-width: 0; padding-top: 3px; }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
    .title { font-weight: 600; font-size: 0.9rem; }
    .at { font-size: 0.75rem; color: var(--lab-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .meta { font-size: 0.8rem; color: var(--lab-muted); margin-top: 2px; }
    .comments {
      margin: 6px 0 0; padding: 6px 10px; border-left: 3px solid var(--lab-teal); background: var(--lab-surface);
      border-radius: 0 6px 6px 0; font-size: 0.85rem; white-space: pre-line; overflow-wrap: anywhere;
    }
    .none { margin: 0; color: var(--lab-muted); font-size: 0.9rem; }
  `,
})
export class HistoryTimelineComponent {
  readonly entries = input.required<TimelineEntry[]>();
  readonly label = input('History');
  readonly emptyText = input('No activity yet.');
}
