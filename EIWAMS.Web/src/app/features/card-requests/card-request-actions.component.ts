import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { CardRequestAction, actionButtons } from './card-requests.models';

/** Action buttons for a card request, driven only by the server's `availableActions`. */
@Component({
  selector: 'eiw-card-request-actions',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .hint { margin: 0; color: var(--lab-muted); font-size: 0.9rem; }
  `,
  template: `
    @if (buttons().length) {
      <div class="actions" role="group" aria-label="Request actions">
        @for (b of buttons(); track b.action) {
          @switch (b.meta.style) {
            @case ('primary') {
              <button mat-flat-button type="button" [attr.data-action]="b.action" [disabled]="busy()" (click)="act.emit(b.action)">
                <mat-icon>{{ b.meta.icon }}</mat-icon>{{ b.meta.label }}
              </button>
            }
            @case ('danger') {
              <button mat-stroked-button type="button" class="danger-action" [attr.data-action]="b.action" [disabled]="busy()" (click)="act.emit(b.action)">
                <mat-icon>{{ b.meta.icon }}</mat-icon>{{ b.meta.label }}
              </button>
            }
            @default {
              <button mat-button type="button" class="danger-action" [attr.data-action]="b.action" [disabled]="busy()" (click)="act.emit(b.action)">
                <mat-icon>{{ b.meta.icon }}</mat-icon>{{ b.meta.label }}
              </button>
            }
          }
        }
      </div>
    } @else {
      <p class="hint">{{ emptyText() }}</p>
    }
  `,
})
export class CardRequestActionsComponent {
  readonly actions = input<readonly string[] | null | undefined>([]);
  readonly busy = input(false);
  readonly emptyText = input('No actions are available to you at this stage.');
  readonly act = output<CardRequestAction>();
  readonly buttons = computed(() => actionButtons(this.actions()));
}
