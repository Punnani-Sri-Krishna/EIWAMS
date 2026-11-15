import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  requireComment?: boolean;
}

export interface ConfirmDialogResult {
  confirmed: boolean;
  comment: string;
}

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.requireComment) {
        <mat-form-field class="w-100">
          <mat-label>Comments</mat-label>
          <textarea matInput rows="3" [formControl]="comment" required></textarea>
          @if (comment.hasError('required')) {
            <mat-error>Comments are required.</mat-error>
          }
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close(false)">Cancel</button>
      <button mat-flat-button type="button" (click)="close(true)">{{ data.confirmText ?? 'Confirm' }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ConfirmDialogComponent, ConfirmDialogResult>);
  readonly comment = new FormControl('', {
    nonNullable: true,
    validators: this.data.requireComment ? [Validators.required] : [],
  });

  close(confirmed: boolean): void {
    if (confirmed && this.comment.invalid) {
      this.comment.markAsTouched();
      return;
    }
    this.ref.close({ confirmed, comment: this.comment.value.trim() });
  }
}
