import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { FeatureLookups, Notifier, asApiError, humanize } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { nextSecurityStatuses } from '../violations/violations.models';
import { IncidentDetail, UpdateIncidentBody } from './incidents.models';
import { IncidentsService } from './incidents.service';

@Component({
  selector: 'eiw-incident-detail',
  imports: [ReactiveFormsModule, DatePipe, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .notes { list-style: none; padding: 0; margin: 0; }
    .notes li { padding: 0.75rem 0; border-bottom: 1px solid rgba(0, 0, 0, 0.08); }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>
          Incident {{ incident()?.incidentNumber }}
          @if (incident(); as i) {
            <eiw-status [value]="i.status" />
          }
        </h1>
        <div class="page-actions">
          <a mat-button routerLink="/incidents"><mat-icon>arrow_back</mat-icon>Incidents</a>
        </div>
      </header>
      @if (loading() || saving()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <eiw-error-state [error]="error()" (retry)="load()" />

      @if (incident(); as i) {
        <div class="row g-3">
          <div class="col-lg-7">
            <div class="data-card p-3 mb-3">
              <h2 class="h5">{{ i.title }}</h2>
              <dl class="row mb-0">
                <dt class="col-sm-4">Type</dt><dd class="col-sm-8">{{ humanize(i.incidentType) }}</dd>
                <dt class="col-sm-4">Severity</dt><dd class="col-sm-8"><eiw-status [value]="i.severity" /></dd>
                <dt class="col-sm-4">Location</dt><dd class="col-sm-8">{{ i.locationName ?? '—' }}</dd>
                <dt class="col-sm-4">Assigned to</dt><dd class="col-sm-8">{{ i.assignedToName ?? 'Unassigned' }}</dd>
                <dt class="col-sm-4">Opened</dt><dd class="col-sm-8">{{ i.openedAtUtc | date: 'medium' }} by {{ i.openedByName }}</dd>
                @if (i.closedAtUtc) {
                  <dt class="col-sm-4">Closed</dt><dd class="col-sm-8">{{ i.closedAtUtc | date: 'medium' }}</dd>
                }
                @if (i.violationId) {
                  <dt class="col-sm-4">Violation</dt><dd class="col-sm-8"><a routerLink="/violations">#{{ i.violationId }}</a></dd>
                }
                <dt class="col-sm-4">Description</dt><dd class="col-sm-8" style="white-space: pre-line">{{ i.description || '—' }}</dd>
                @if (i.resolution) {
                  <dt class="col-sm-4">Resolution</dt><dd class="col-sm-8" style="white-space: pre-line">{{ i.resolution }}</dd>
                }
              </dl>
            </div>

            <div class="data-card p-3">
              <h2 class="h5">Notes</h2>
              @if (i.notes.length) {
                <ul class="notes">
                  @for (n of i.notes; track n.noteId) {
                    <li>
                      <div style="white-space: pre-line">{{ n.note }}</div>
                      <div class="text-muted small">{{ n.createdByName }} · {{ n.createdAtUtc | date: 'medium' }}</div>
                    </li>
                  }
                </ul>
              } @else {
                <eiw-empty-state message="No notes yet." icon="sticky_note_2" />
              }
              @if (canManage) {
                <form class="mt-3" [formGroup]="noteForm" (ngSubmit)="addNote(i)">
                  <mat-form-field class="w-100">
                    <mat-label>Add a note</mat-label>
                    <textarea matInput formControlName="note" rows="3" maxlength="4000" required></textarea>
                    @if (noteForm.controls.note.hasError('required')) {
                      <mat-error>Write a note first.</mat-error>
                    }
                  </mat-form-field>
                  <button mat-stroked-button type="submit" [disabled]="saving()"><mat-icon>note_add</mat-icon>Add note</button>
                </form>
              }
            </div>
          </div>

          @if (canManage) {
            <div class="col-lg-5">
              <div class="data-card p-3 mb-3">
                <h2 class="h5">Assignment</h2>
                <form class="d-flex gap-2 align-items-start" [formGroup]="assignForm" (ngSubmit)="assign(i)">
                  <mat-form-field class="flex-grow-1">
                    <mat-label>Assign to</mat-label>
                    <mat-select formControlName="assignedToUserId" required>
                      @for (u of lk.lookups()?.users ?? []; track u.id) {
                        <mat-option [value]="u.id">{{ u.name }}</mat-option>
                      }
                    </mat-select>
                    @if (assignForm.controls.assignedToUserId.hasError('required')) {
                      <mat-error>Select a user.</mat-error>
                    }
                  </mat-form-field>
                  <button mat-stroked-button type="submit" class="mt-2" [disabled]="saving()">Assign</button>
                </form>
              </div>

              <div class="data-card p-3">
                <h2 class="h5">Status</h2>
                @if (nextStatuses().length) {
                  <form [formGroup]="statusForm" (ngSubmit)="changeStatus(i)">
                    <mat-form-field class="w-100">
                      <mat-label>Move to</mat-label>
                      <mat-select formControlName="status" required>
                        @for (s of nextStatuses(); track s) {
                          <mat-option [value]="s">{{ humanize(s) }}</mat-option>
                        }
                      </mat-select>
                      @if (statusForm.controls.status.hasError('required')) {
                        <mat-error>Select a status.</mat-error>
                      }
                    </mat-form-field>
                    <mat-form-field class="w-100">
                      <mat-label>Resolution{{ statusForm.controls.status.value === 'Closed' ? '' : ' (optional)' }}</mat-label>
                      <textarea matInput formControlName="resolution" rows="3" maxlength="4000"></textarea>
                      @if (statusForm.hasError('resolutionRequired')) {
                        <mat-hint class="text-danger">A resolution is required to close an incident.</mat-hint>
                      }
                    </mat-form-field>
                    <mat-form-field class="w-100">
                      <mat-label>Note (optional)</mat-label>
                      <textarea matInput formControlName="note" rows="2" maxlength="4000"></textarea>
                    </mat-form-field>
                    <button mat-flat-button type="submit" [disabled]="saving()">Update status</button>
                  </form>
                } @else {
                  <p class="text-muted mb-0">No further status changes are available.</p>
                }
              </div>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class IncidentDetailComponent {
  private readonly service = inject(IncidentsService);
  private readonly notifier = inject(Notifier);
  readonly lk = inject(FeatureLookups);
  readonly canManage = inject(SessionService).hasPermission('Incidents.Manage');
  readonly id = Number(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  readonly humanize = humanize;

  readonly incident = signal<IncidentDetail | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly nextStatuses = computed(() => {
    const i = this.incident();
    return i ? nextSecurityStatuses(i.status, true) : [];
  });

  readonly noteForm = new FormGroup({
    note: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(4000)] }),
  });
  readonly assignForm = new FormGroup({
    assignedToUserId: new FormControl<number | null>(null, [Validators.required]),
  });
  readonly statusForm = new FormGroup(
    {
      status: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      resolution: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
      note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
    },
    {
      validators: (g) => {
        const v = g.value as { status?: string; resolution?: string };
        return v.status === 'Closed' && !v.resolution?.trim() && !this.incident()?.resolution ? { resolutionRequired: true } : null;
      },
    },
  );

  constructor() {
    this.lk.ensure();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.service.get(this.id).subscribe({
      next: (i) => this.apply(i),
      error: (err: unknown) => {
        this.error.set(asApiError(err));
        this.loading.set(false);
      },
    });
  }

  addNote(i: IncidentDetail): void {
    if (!this.noteForm.controls.note.value.trim()) this.noteForm.controls.note.setValue('');
    if (this.noteForm.invalid) {
      this.noteForm.markAllAsTouched();
      return;
    }
    this.patch(i, { note: this.noteForm.controls.note.value.trim() }, 'Note added.', () => this.noteForm.reset());
  }

  assign(i: IncidentDetail): void {
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }
    this.patch(i, { assignedToUserId: this.assignForm.controls.assignedToUserId.value }, 'Incident assigned.');
  }

  changeStatus(i: IncidentDetail): void {
    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      return;
    }
    const v = this.statusForm.getRawValue();
    this.patch(
      i,
      { status: v.status, resolution: v.resolution.trim() || null, note: v.note.trim() || null },
      `Incident moved to ${humanize(v.status)}.`,
      () => this.statusForm.reset(),
    );
  }

  private patch(i: IncidentDetail, changes: Omit<UpdateIncidentBody, 'version'>, message: string, done?: () => void): void {
    this.saving.set(true);
    this.service.update(i.incidentId, { ...changes, version: i.version }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.notifier.success(message);
        done?.();
        if (res && Array.isArray(res.notes)) this.apply(res);
        else this.load();
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.notifier.error(err);
        const e = asApiError(err);
        if (e.status === 409) this.load();
      },
    });
  }

  private apply(i: IncidentDetail): void {
    this.incident.set(i);
    this.assignForm.patchValue({ assignedToUserId: i.assignedToUserId });
    this.loading.set(false);
  }
}
