import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';

import { ApiError } from '../../core/models/api.models';
import { AdminErrorComponent, AdminLoadingComponent, asApiError, errorText } from './admin-shared';
import { SettingKind, settingKind } from './admin-helpers';
import { Setting } from './admin.models';
import { AdminService } from './admin.service';

interface SettingRow {
  setting: Setting;
  kind: SettingKind;
  control: FormControl<string>;
  toggle: FormControl<boolean>;
}

function validatorsFor(kind: SettingKind): ValidatorFn[] {
  const base = [Validators.required, Validators.maxLength(4000)];
  if (kind === 'int') {
    return [...base, Validators.pattern(/^-?\d+$/)];
  }
  if (kind === 'decimal') {
    return [...base, Validators.pattern(/^-?\d+(\.\d+)?$/)];
  }
  return base;
}

@Component({
  selector: 'app-settings',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    AdminErrorComponent,
    AdminLoadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .value-field { width: 100%; min-width: 220px; }
    .key { font-family: monospace; font-weight: 600; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>System settings</h1>
        <div class="page-actions">
          <button mat-stroked-button type="button" (click)="load()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon> Refresh
          </button>
        </div>
      </header>

      <div class="data-card">
        <div class="filter-bar">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Search</mat-label>
            <input matInput (input)="filter.set($any($event.target).value)" placeholder="Key or description" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
        </div>

        @if (loading()) {
          <app-admin-loading />
        }
        @if (error(); as e) {
          <app-admin-error [error]="e" (retry)="load()" />
        } @else if (!loading() && rows().length === 0) {
          <div class="empty-state"><mat-icon>settings</mat-icon><p>No settings found.</p></div>
        }

        @if (filtered().length) {
          <div class="table-wrap">
            <table mat-table [dataSource]="filtered()">
              <ng-container matColumnDef="key">
                <th mat-header-cell *matHeaderCellDef>Setting</th>
                <td mat-cell *matCellDef="let r">
                  <div class="key">{{ r.setting.settingKey }}</div>
                  <small class="text-muted">{{ r.setting.description }}</small>
                </td>
              </ng-container>
              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>Type</th>
                <td mat-cell *matCellDef="let r">{{ r.setting.dataType ?? 'string' }}</td>
              </ng-container>
              <ng-container matColumnDef="value">
                <th mat-header-cell *matHeaderCellDef>Value</th>
                <td mat-cell *matCellDef="let r">
                  @if (r.kind === 'bool') {
                    <mat-slide-toggle [formControl]="r.toggle" [attr.aria-label]="r.setting.settingKey">
                      {{ r.toggle.value ? 'Enabled' : 'Disabled' }}
                    </mat-slide-toggle>
                  } @else {
                    <mat-form-field class="value-field" subscriptSizing="dynamic">
                      <input matInput [formControl]="r.control" [attr.aria-label]="r.setting.settingKey"
                        [attr.inputmode]="r.kind === 'text' ? null : 'decimal'" (keydown.enter)="save(r)" />
                      @if (r.control.hasError('required')) { <mat-error>A value is required.</mat-error> }
                      @if (r.control.hasError('pattern')) {
                        <mat-error>{{ r.kind === 'int' ? 'Enter a whole number.' : 'Enter a number.' }}</mat-error>
                      }
                      @if (r.control.hasError('maxlength')) { <mat-error>Max 4000 characters.</mat-error> }
                    </mat-form-field>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
                <td mat-cell *matCellDef="let r">
                  <button mat-flat-button color="primary" type="button" (click)="save(r)"
                    [disabled]="!isDirty(r) || saving() === r.setting.settingKey">
                    {{ saving() === r.setting.settingKey ? 'Saving…' : 'Save' }}
                  </button>
                  <button mat-icon-button type="button" (click)="reset(r)" [disabled]="!isDirty(r)"
                    [attr.aria-label]="'Undo changes to ' + r.setting.settingKey"><mat-icon>undo</mat-icon></button>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns"></tr>
            </table>
          </div>
        } @else if (rows().length) {
          <div class="empty-state"><p>No settings match the filter.</p></div>
        }
      </div>
    </section>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly columns = ['key', 'type', 'value', 'actions'];
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly saving = signal<string | null>(null);
  readonly rows = signal<SettingRow[]>([]);
  readonly filter = signal('');
  readonly filtered = computed(() => {
    const f = this.filter().trim().toLowerCase();
    return f
      ? this.rows().filter((r) => `${r.setting.settingKey} ${r.setting.description ?? ''}`.toLowerCase().includes(f))
      : this.rows();
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.admin
      .settings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.rows.set((settings ?? []).map((s) => this.toRow(s)));
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(asApiError(e));
          this.loading.set(false);
        },
      });
  }

  isDirty(row: SettingRow): boolean {
    return row.kind === 'bool'
      ? row.toggle.value !== isTrue(row.setting.settingValue)
      : this.valueOf(row) !== (row.setting.settingValue ?? '');
  }

  reset(row: SettingRow): void {
    row.control.setValue(row.setting.settingValue ?? '');
    row.toggle.setValue(isTrue(row.setting.settingValue));
  }

  save(row: SettingRow): void {
    if (row.kind !== 'bool' && row.control.invalid) {
      row.control.markAsTouched();
      return;
    }
    if (!this.isDirty(row)) {
      return;
    }
    const value = this.valueOf(row);
    this.saving.set(row.setting.settingKey);
    this.admin.updateSetting(row.setting.settingKey, value).subscribe({
      next: (updated) => {
        const setting = { ...row.setting, ...(updated ?? {}), settingValue: updated?.settingValue ?? value };
        this.rows.update((rows) => rows.map((r) => (r === row ? this.toRow(setting) : r)));
        this.saving.set(null);
        this.snack.open(`Setting ${row.setting.settingKey} saved.`, 'Close', { duration: 3000 });
      },
      error: (e) => {
        this.saving.set(null);
        this.snack.open(errorText(asApiError(e)), 'Close', { duration: 6000 });
      },
    });
  }

  private valueOf(row: SettingRow): string {
    return row.kind === 'bool' ? (row.toggle.value ? 'true' : 'false') : row.control.value.trim();
  }

  private toRow(setting: Setting): SettingRow {
    const kind = settingKind(setting.dataType);
    return {
      setting,
      kind,
      control: new FormControl(setting.settingValue ?? '', { nonNullable: true, validators: validatorsFor(kind) }),
      toggle: new FormControl(isTrue(setting.settingValue), { nonNullable: true }),
    };
  }
}

function isTrue(value: string | null): boolean {
  return ['true', '1', 'yes'].includes((value ?? '').trim().toLowerCase());
}
