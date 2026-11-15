import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { Observable, filter } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { ApiError } from '../../../core/models/api.models';
import { statusIcon, statusTone } from '../../../shared/utils/status-tone';
import { humanize } from './feature-kit';

/** Status chip: colour + icon + text (never colour alone). */
@Component({
  selector: 'eiw-status',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (value()) {
    <span [class]="'status-chip tone-' + tone()"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon>{{ label() }}</span>
  }`,
})
export class StatusChipComponent {
  readonly value = input<string | null | undefined>(null);
  readonly tone = computed(() => statusTone(this.value()));
  readonly icon = computed(() => statusIcon(this.value()));
  readonly label = computed(() => humanize(this.value()));
}

/** Error panel with message, validation details, correlation id and optional retry. */
@Component({
  selector: 'eiw-error-state',
  imports: [MatIconModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (error(); as e) {
    <div class="error-state" role="alert">
      <mat-icon aria-hidden="true">error_outline</mat-icon>
      <div class="flex-grow-1">
        <strong>{{ e.message }}</strong>
        @if (e.errors.length) {
          <ul class="mb-0">
            @for (m of e.errors; track $index) {
              <li>{{ m }}</li>
            }
          </ul>
        }
        @if (e.correlationId) {
          <div class="correlation">Correlation ID: <code>{{ e.correlationId }}</code></div>
        }
      </div>
      @if (retryable()) {
        <button mat-stroked-button type="button" (click)="retry.emit()"><mat-icon>refresh</mat-icon>Retry</button>
      }
    </div>
  }`,
})
export class ErrorStateComponent {
  readonly error = input<ApiError | null>(null);
  readonly retryable = input(true);
  readonly retry = output<void>();
}

/** Empty state panel. */
@Component({
  selector: 'eiw-empty-state',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="empty-state"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon><p class="mb-0">{{ message() }}</p></div>`,
})
export class EmptyStateComponent {
  readonly message = input('No records match the current filters.');
  readonly icon = input('inbox');
}

export interface ReasonDialogData {
  title: string;
  message?: string;
  /** Label for the free-text field; use `hideText` for a plain confirmation. */
  label?: string;
  required?: boolean;
  hideText?: boolean;
  maxLength?: number;
  confirmText?: string;
  danger?: boolean;
  /** Optional select shown above the text (e.g. target status). */
  options?: { label: string; values: string[]; value?: string };
  initialText?: string;
}

export interface ReasonDialogResult {
  text: string;
  option?: string;
}

/** Generic confirm / comment / reason dialog (comments required for Return / Reject etc.). */
@Component({
  selector: 'eiw-reason-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      @if (data.message) {
        <p>{{ data.message }}</p>
      }
      @if (data.options) {
        <mat-form-field class="w-100">
          <mat-label>{{ data.options.label }}</mat-label>
          <mat-select [formControl]="option" required>
            @for (v of data.options.values; track v) {
              <mat-option [value]="v">{{ humanize(v) }}</mat-option>
            }
          </mat-select>
          @if (option.hasError('required')) {
            <mat-error>{{ data.options.label }} is required.</mat-error>
          }
        </mat-form-field>
      }
      @if (!data.hideText) {
        <mat-form-field class="w-100">
          <mat-label>{{ data.label ?? 'Comments' }}</mat-label>
          <textarea matInput rows="4" [formControl]="text" [required]="!!data.required" cdkFocusInitial></textarea>
          <mat-hint align="end">{{ text.value.length }} / {{ max }}</mat-hint>
          @if (text.hasError('required') || text.hasError('pattern')) {
            <mat-error>{{ data.label ?? 'Comments' }} is required.</mat-error>
          }
          @if (text.hasError('maxlength')) {
            <mat-error>Maximum {{ max }} characters.</mat-error>
          }
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancel</button>
      <button mat-flat-button type="button" [class.danger-action]="!!data.danger" (click)="confirm()">
        {{ data.confirmText ?? 'Confirm' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ReasonDialogComponent {
  readonly data = inject<ReasonDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<ReasonDialogComponent, ReasonDialogResult>>(MatDialogRef);
  readonly max = this.data.maxLength ?? 1000;
  readonly humanize = humanize;
  readonly text = new FormControl(this.data.initialText ?? '', {
    nonNullable: true,
    validators: [
      ...(this.data.required && !this.data.hideText ? [Validators.required, Validators.pattern(/\S/)] : []),
      Validators.maxLength(this.max),
    ],
  });
  readonly option = new FormControl(this.data.options?.value ?? '', {
    nonNullable: true,
    validators: this.data.options ? [Validators.required] : [],
  });

  confirm(): void {
    this.text.markAsTouched();
    this.option.markAsTouched();
    if (this.text.invalid || this.option.invalid) return;
    this.ref.close({ text: this.text.value.trim(), option: this.option.value || undefined });
  }
}

export const KIT_IMPORTS = [StatusChipComponent, ErrorStateComponent, EmptyStateComponent] as const;

/** Opens the reason dialog; emits the result only when confirmed. */
export function askReason(dialog: MatDialog, data: ReasonDialogData): Observable<ReasonDialogResult> {
  return dialog
    .open<ReasonDialogComponent, ReasonDialogData, ReasonDialogResult>(ReasonDialogComponent, { data, width: '520px', autoFocus: 'dialog' })
    .afterClosed()
    .pipe(filter((r): r is ReasonDialogResult => !!r));
}
