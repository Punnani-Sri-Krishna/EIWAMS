import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { StageState, StageStep } from '../../utils/stage-steps';

const ICON: Record<StageState, string> = {
  done: 'check',
  current: 'more_horiz',
  pending: '',
  rejected: 'close',
  cancelled: 'block',
  returned: 'undo',
  skipped: 'remove',
};

const STATE_TEXT: Record<StageState, string> = {
  done: 'Completed',
  current: 'In progress',
  pending: 'Not started',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  returned: 'Returned',
  skipped: 'Skipped',
};

/** Horizontal workflow progress (vertical on small screens). */
@Component({
  selector: 'app-stage-stepper',
  imports: [DatePipe, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="stepper" [attr.aria-label]="label()">
      @for (s of steps(); track s.key; let i = $index) {
        <li [class]="'step state-' + s.state" [attr.aria-current]="s.state === 'current' ? 'step' : null">
          <span class="dot" aria-hidden="true">
            @if (icon[s.state]) {
              <mat-icon>{{ icon[s.state] }}</mat-icon>
            } @else {
              {{ i + 1 }}
            }
          </span>
          <span class="text">
            <span class="name">{{ s.label }}</span>
            <span class="visually-hidden">: {{ stateText[s.state] }}</span>
            @if (s.caption) {
              <span class="caption">{{ s.caption }}</span>
            }
            @if (s.at) {
              <span class="caption num-inline">{{ s.at | date: 'd MMM, HH:mm' }}</span>
            }
          </span>
        </li>
      }
    </ol>
  `,
  styles: `
    :host { display: block; }
    .stepper {
      list-style: none; margin: 0; padding: 4px 0 0;
      display: grid; grid-auto-flow: column; grid-auto-columns: minmax(104px, 1fr);
      overflow-x: auto; scrollbar-width: thin;
    }
    .step { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 0 6px 6px; min-width: 0; }
    .step::before {
      content: ''; position: absolute; top: 15px; right: 50%; width: 100%; height: 2px;
      background: var(--lab-border); z-index: 0;
    }
    .step:first-child::before { display: none; }
    .state-done::before, .state-current::before, .state-rejected::before,
    .state-cancelled::before, .state-returned::before { background: var(--lab-teal); }
    .dot {
      position: relative; z-index: 1; width: 32px; height: 32px; flex: none; border-radius: 50%;
      display: grid; place-items: center; font-size: 0.8rem; font-weight: 600; font-variant-numeric: tabular-nums;
      background: var(--lab-card); color: var(--lab-muted); border: 2px solid var(--lab-border);
      mat-icon { font-size: 18px; width: 18px; height: 18px; }
    }
    .state-done .dot { background: var(--lab-success); border-color: var(--lab-success); color: #fff; }
    .state-current .dot { background: var(--lab-warning); border-color: var(--lab-warning); color: #fff; box-shadow: 0 0 0 4px var(--lab-warning-bg); }
    .state-rejected .dot { background: var(--lab-danger); border-color: var(--lab-danger); color: #fff; }
    .state-returned .dot { background: var(--lab-warning-bg); border-color: var(--lab-warning); color: var(--lab-warning-fg); }
    .state-cancelled .dot, .state-skipped .dot { background: var(--lab-neutral-bg); border-color: var(--lab-neutral-fg); color: var(--lab-neutral-fg); }
    .text { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; min-width: 0; }
    .name { font-size: 0.82rem; font-weight: 600; color: var(--lab-ink); line-height: 1.25; }
    .state-pending .name { color: var(--lab-muted); font-weight: 500; }
    .caption { font-size: 0.72rem; color: var(--lab-muted); line-height: 1.3; overflow-wrap: anywhere; }
    .num-inline { font-variant-numeric: tabular-nums; }
    @media (max-width: 575.98px) {
      .stepper { grid-auto-flow: row; grid-auto-columns: auto; overflow: visible; }
      .step { flex-direction: row; align-items: flex-start; text-align: left; gap: 12px; padding: 0 0 16px; }
      .step::before { display: none; }
      .step:not(:last-child)::after {
        content: ''; position: absolute; left: 15px; top: 32px; bottom: 0; width: 2px; background: var(--lab-border);
      }
      .state-done:not(:last-child)::after { background: var(--lab-teal); }
      .text { margin-top: 6px; }
    }
  `,
})
export class StageStepperComponent {
  readonly steps = input.required<StageStep[]>();
  readonly label = input('Request progress');
  protected readonly icon = ICON;
  protected readonly stateText = STATE_TEXT;
}
