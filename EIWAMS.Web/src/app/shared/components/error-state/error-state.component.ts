import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiError } from '../../../core/models/api.models';

@Component({
  selector: 'app-error-state',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error(); as err) {
      <div class="error-state" role="alert">
        <mat-icon aria-hidden="true">error</mat-icon>
        <div class="error-body">
          <p class="error-message">{{ err.message || 'Something went wrong.' }}</p>
          @if (err.errors?.length) {
            <ul>
              @for (e of err.errors; track $index) {
                <li>{{ e }}</li>
              }
            </ul>
          }
          @if (err.correlationId) {
            <span class="correlation">Correlation ID: {{ err.correlationId }}</span>
          }
        </div>
        <button mat-button type="button" (click)="retry.emit()">
          <mat-icon>refresh</mat-icon> Retry
        </button>
      </div>
    }
  `,
})
export class ErrorStateComponent {
  readonly error = input<ApiError | null>(null);
  readonly retry = output<void>();
}
