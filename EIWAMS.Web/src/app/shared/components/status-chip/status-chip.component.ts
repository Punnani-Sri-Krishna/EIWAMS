import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { statusIcon, statusTone } from '../../utils/status-tone';

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

  protected readonly tone = computed(() => statusTone(this.status()));
  protected readonly icon = computed(() => statusIcon(this.status()));
  protected readonly label = computed(() =>
    (this.status() ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' '),
  );
}
