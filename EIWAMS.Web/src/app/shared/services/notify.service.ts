import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiError } from '../../core/models/api.models';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 4000, panelClass: 'snack-success' });
  }

  error(err: ApiError | string): void {
    const message =
      typeof err === 'string'
        ? err
        : err.correlationId
          ? `${err.message} (Ref: ${err.correlationId})`
          : err.message;
    this.snackBar.open(message, 'Close', { duration: 8000, panelClass: 'snack-error' });
  }
}
