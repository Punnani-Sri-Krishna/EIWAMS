import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { FeatureLookups, Notifier, asApiError, humanize } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';
import { IncidentsService } from './incidents.service';

@Component({
  selector: 'eiw-incident-form',
  imports: [ReactiveFormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule, MatProgressBarModule, ...KIT_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>New security incident</h1>
        <div class="page-actions">
          <a mat-button routerLink="/incidents"><mat-icon>arrow_back</mat-icon>Incidents</a>
        </div>
      </header>
      @if (saving()) {
        <mat-progress-bar mode="indeterminate" />
      }
      <div class="data-card p-3">
        <eiw-error-state [error]="error()" [retryable]="false" />
        <form class="row g-2" [formGroup]="form" (ngSubmit)="save()">
          <mat-form-field class="col-12">
            <mat-label>Title</mat-label>
            <input matInput formControlName="title" maxlength="200" required />
            @if (form.controls.title.hasError('required')) {
              <mat-error>Title is required.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-4">
            <mat-label>Type</mat-label>
            <mat-select formControlName="incidentType" required>
              @for (t of lk.lookups()?.incidentTypes ?? []; track t) {
                <mat-option [value]="t">{{ humanize(t) }}</mat-option>
              }
            </mat-select>
            @if (form.controls.incidentType.hasError('required')) {
              <mat-error>Select a type.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-4">
            <mat-label>Severity</mat-label>
            <mat-select formControlName="severity" required>
              @for (s of lk.lookups()?.severities ?? []; track s) {
                <mat-option [value]="s">{{ s }}</mat-option>
              }
            </mat-select>
            @if (form.controls.severity.hasError('required')) {
              <mat-error>Select a severity.</mat-error>
            }
          </mat-form-field>
          <mat-form-field class="col-md-4">
            <mat-label>Location</mat-label>
            <mat-select formControlName="locationId">
              <mat-option [value]="null">Not specified</mat-option>
              @for (l of lk.lookups()?.locations ?? []; track l.id) {
                <mat-option [value]="l.id">{{ l.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Assign to</mat-label>
            <mat-select formControlName="assignedToUserId">
              <mat-option [value]="null">Unassigned</mat-option>
              @for (u of lk.lookups()?.users ?? []; track u.id) {
                <mat-option [value]="u.id">{{ u.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field class="col-md-6">
            <mat-label>Related violation #</mat-label>
            <input matInput type="number" formControlName="violationId" min="1" />
          </mat-form-field>
          <mat-form-field class="col-12">
            <mat-label>Description</mat-label>
            <textarea matInput formControlName="description" rows="5" maxlength="4000"></textarea>
            <mat-hint align="end">{{ form.controls.description.value.length }}/4000</mat-hint>
          </mat-form-field>
          <div class="col-12 d-flex gap-2 justify-content-end">
            <a mat-button routerLink="/incidents">Cancel</a>
            <button mat-flat-button type="submit" [disabled]="saving()">Create incident</button>
          </div>
        </form>
      </div>
    </section>
  `,
})
export class IncidentFormComponent {
  private readonly service = inject(IncidentsService);
  private readonly router = inject(Router);
  private readonly notifier = inject(Notifier);
  readonly lk = inject(FeatureLookups);
  readonly humanize = humanize;
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(200)] }),
    incidentType: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    severity: new FormControl('Medium', { nonNullable: true, validators: [Validators.required] }),
    locationId: new FormControl<number | null>(null),
    assignedToUserId: new FormControl<number | null>(null),
    violationId: new FormControl<number | null>(null, [Validators.min(1)]),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(4000)] }),
  });

  constructor() {
    this.lk.ensure();
    const violationId = Number(inject(ActivatedRoute).snapshot.queryParamMap.get('violationId'));
    if (violationId > 0) this.form.patchValue({ violationId });
  }

  save(): void {
    if (!this.form.controls.title.value.trim()) this.form.controls.title.setValue('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.service
      .create({
        title: v.title.trim(),
        description: v.description.trim() || null,
        incidentType: v.incidentType,
        severity: v.severity,
        locationId: v.locationId,
        assignedToUserId: v.assignedToUserId,
        violationId: v.violationId || null,
      })
      .subscribe({
        next: (i) => {
          this.notifier.success(`Incident ${i.incidentNumber} created.`);
          this.router.navigate(['/incidents', i.incidentId]);
        },
        error: (err: unknown) => {
          this.saving.set(false);
          this.error.set(asApiError(err));
        },
      });
  }
}
