import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ApiError } from '../../core/models/api.models';

/** Normalises anything thrown by ApiService (or elsewhere) into an ApiError. */
export function asApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as Partial<ApiError>;
    return {
      status: e.status ?? 0,
      message: e.message || 'Something went wrong. Please try again.',
      errors: Array.isArray(e.errors) ? e.errors : [],
      correlationId: e.correlationId ?? null,
    };
  }
  return { status: 0, message: 'Something went wrong. Please try again.', errors: [], correlationId: null };
}

/** One-line error text for snackbars, including the correlation id when present. */
export function errorText(e: ApiError): string {
  return e.correlationId ? `${e.message} (Correlation ID: ${e.correlationId})` : e.message;
}

@Component({
  selector: 'app-admin-error',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-state" role="alert">
      <mat-icon aria-hidden="true">error_outline</mat-icon>
      <div>
        <p>{{ error().message }}</p>
        @if (error().errors.length) {
          <ul>
            @for (e of error().errors; track $index) {
              <li>{{ e }}</li>
            }
          </ul>
        }
        @if (error().correlationId) {
          <p class="correlation">Correlation ID: {{ error().correlationId }}</p>
        }
        @if (retryable()) {
          <button mat-stroked-button type="button" (click)="retry.emit()">Retry</button>
        }
      </div>
    </div>
  `,
})
export class AdminErrorComponent {
  readonly error = input.required<ApiError>();
  readonly retryable = input(true);
  readonly retry = output<void>();
}

@Component({
  selector: 'app-admin-loading',
  imports: [MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<mat-progress-bar mode="indeterminate" aria-label="Loading" />`,
})
export class AdminLoadingComponent {}

export interface ConfirmData {
  title: string;
  message: string;
  confirmText?: string;
}

@Component({
  selector: 'app-admin-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false">Cancel</button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">{{ data.confirmText ?? 'Confirm' }}</button>
    </mat-dialog-actions>
  `,
})
export class AdminConfirmDialogComponent {
  readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}
