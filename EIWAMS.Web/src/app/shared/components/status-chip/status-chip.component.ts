import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { StatusKind, statusIcon, statusLabel, statusTone } from '../../utils/status-tone';

@Component({
  selector: 'app-status-chip',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span [class]="'status-chip tone-' + tone()">
      <mat-icon aria-hidden="true">{{ icon() }}</mat-icon>
      <span>{{ label() }}</span>
    </span>
  `,
})
export class StatusChipComponent {
  readonly status = input<string | null | undefined>('');
  readonly kind = input<StatusKind>('generic');

  protected readonly tone = computed(() => statusTone(this.status(), this.kind()));
  protected readonly icon = computed(() => statusIcon(this.status(), this.kind()));
  protected readonly label = computed(() => statusLabel(this.status(), this.kind()));
}
