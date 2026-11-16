import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';

import { ApiError } from '../../core/models/api.models';
import { MeService, MyProfile } from '../../core/services/me.service';
import { SessionService } from '../../core/services/session.service';
import { ContactFieldsComponent, contactValues, createContactForm, patchContactForm } from '../../shared/components/contact-fields/contact-fields.component';
import { PhotoPickerComponent } from '../../shared/components/photo-picker/photo-picker.component';
import { ProcessedPhoto, toDataUrl } from '../../shared/utils/image-resize';
import { Notifier, asApiError } from '../approvals/kit/feature-kit';
import { KIT_IMPORTS } from '../approvals/kit/ui.components';

@Component({
  selector: 'app-profile',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    ContactFieldsComponent,
    PhotoPickerComponent,
    ...KIT_IMPORTS,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .profile-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
    .span-2 { grid-column: 1 / -1; }
    .identity { display: flex; align-items: center; gap: 14px; }
    .avatar { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center;
      background: var(--lab-primary); color: #fff; font-size: 1.15rem; font-weight: 700; }
    .name { font-size: 1.15rem; font-weight: 650; color: var(--lab-ink); }
    h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; font-size: 1.05rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .success-note { color: var(--lab-success-fg); font-weight: 600; margin: 12px 0 0; }
    @media (max-width: 767.98px) { .profile-grid { grid-template-columns: minmax(0, 1fr); } .span-2 { grid-column: auto; } }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>My profile</h1>
          <p class="subtitle">HR information is read-only. Update your contact details and employee photo below.</p>
        </div>
        <div class="page-actions">
          <a mat-button routerLink="/dashboard"><mat-icon>arrow_back</mat-icon>Home</a>
        </div>
      </header>

      @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Loading profile" /> }
      <eiw-error-state [error]="loadError()" (retry)="load()" />

      @if (profile(); as p) {
        <div class="profile-grid">
          <section class="data-card span-2" aria-labelledby="hr-record-heading">
            <h2 id="hr-record-heading"><mat-icon>badge</mat-icon>HR record</h2>
            <div class="identity mb-3">
              <div class="avatar" aria-hidden="true">{{ initials(p.fullName) }}</div>
              <div>
                <div class="name">{{ p.fullName }}</div>
                <div class="text-muted">{{ p.workEmail || 'No work email on record' }}</div>
              </div>
            </div>
            <dl class="kv-grid">
              <dt>Employee number</dt><dd>{{ p.employeeNumber }}</dd>
              <dt>Designation</dt><dd>{{ p.designation || '—' }}</dd>
              <dt>Department</dt><dd>{{ p.departmentName || '—' }}</dd>
              <dt>Manager</dt><dd>{{ p.managerName || '—' }}@if (p.managerEmail) { <span class="text-muted"> · {{ p.managerEmail }}</span> }</dd>
              <dt>Location</dt><dd>{{ p.locationName || '—' }}</dd>
              <dt>Employment status</dt><dd><eiw-status [value]="p.employmentStatus" /></dd>
              <dt>Join date</dt><dd>{{ p.joinDate ? (p.joinDate | date: 'mediumDate') : '—' }}</dd>
            </dl>
          </section>

          <section class="data-card" aria-labelledby="contact-heading">
            <h2 id="contact-heading"><mat-icon>contact_phone</mat-icon>Contact details</h2>
            <form [formGroup]="contact" (ngSubmit)="saveContacts()" novalidate>
              <app-contact-fields [form]="contact" [required]="false" />
              <eiw-error-state [error]="contactError()" [retryable]="false" />
              @if (contactSaved()) { <p class="success-note" role="status">Contact details saved.</p> }
              <div class="actions">
                <button mat-flat-button type="submit" [disabled]="savingContacts() || contact.invalid">
                  <mat-icon>save</mat-icon>{{ savingContacts() ? 'Saving…' : 'Save contact details' }}
                </button>
              </div>
            </form>
          </section>

          <section class="data-card" aria-labelledby="photo-heading">
            <h2 id="photo-heading"><mat-icon>account_box</mat-icon>Employee photo</h2>
            <app-photo-picker [currentUrl]="photoUrl()" [disabled]="savingPhoto()" (photoChange)="onPhoto($event)" />
            <eiw-error-state [error]="photoError()" [retryable]="false" />
            @if (photoSaved()) { <p class="success-note" role="status">Photo saved.</p> }
            <div class="actions">
              <button mat-flat-button type="button" [disabled]="!selectedPhoto() || savingPhoto()" (click)="savePhoto()">
                <mat-icon>cloud_upload</mat-icon>{{ savingPhoto() ? 'Saving…' : 'Save photo' }}
              </button>
            </div>
          </section>

          <section class="data-card span-2" aria-labelledby="card-heading">
            <h2 id="card-heading"><mat-icon>contactless</mat-icon>Current ID card</h2>
            @if (p.activeCard; as card) {
              <dl class="kv-grid">
                <dt>Masked card UID</dt><dd><code>{{ card.maskedUid }}</code></dd>
                <dt>Status</dt><dd><eiw-status [value]="card.status" /></dd>
                <dt>Issued</dt><dd>{{ card.issuedAtUtc ? (card.issuedAtUtc | date: 'mediumDate') : '—' }}</dd>
                <dt>Expires</dt><dd>{{ card.expiresAtUtc ? (card.expiresAtUtc | date: 'mediumDate') : '—' }}</dd>
              </dl>
            } @else {
              <eiw-empty-state message="No active or recently blocked card is linked to your profile." icon="credit_card" />
            }
          </section>
        </div>
      }
    </section>
  `,
})
export class ProfileComponent {
  private readonly me = inject(MeService);
  private readonly session = inject(SessionService);
  private readonly notifier = inject(Notifier);

  readonly contact = createContactForm(false);
  readonly profile = signal<MyProfile | null>(null);
  readonly photoUrl = signal<string | null>(null);
  readonly selectedPhoto = signal<ProcessedPhoto | null>(null);
  private readonly photoPicker = viewChild(PhotoPickerComponent);
  readonly loading = signal(false);
  readonly savingContacts = signal(false);
  readonly savingPhoto = signal(false);
  readonly loadError = signal<ApiError | null>(null);
  readonly contactError = signal<ApiError | null>(null);
  readonly photoError = signal<ApiError | null>(null);
  readonly contactSaved = signal(false);
  readonly photoSaved = signal(false);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.me.profile().subscribe({
      next: (profile) => {
        this.profile.set(profile);
        patchContactForm(this.contact, profile);
        this.loading.set(false);
        if (profile.hasPhoto) {
          this.me.photo().subscribe({
            next: (photo) => this.photoUrl.set(toDataUrl(photo.contentType, photo.photoBase64)),
            error: () => this.photoUrl.set(null),
          });
        } else {
          this.photoUrl.set(null);
        }
      },
      error: (error: unknown) => {
        this.loadError.set(asApiError(error));
        this.loading.set(false);
      },
    });
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }

  onPhoto(photo: ProcessedPhoto | null): void {
    this.selectedPhoto.set(photo);
    this.photoError.set(null);
    this.photoSaved.set(false);
  }

  saveContacts(): void {
    this.contact.markAllAsTouched();
    if (this.contact.invalid) return;
    this.savingContacts.set(true);
    this.contactError.set(null);
    this.contactSaved.set(false);
    this.me.updateProfile(contactValues(this.contact)).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        patchContactForm(this.contact, profile);
        this.contactSaved.set(true);
        this.savingContacts.set(false);
        this.notifier.success('Contact details saved.');
      },
      error: (error: unknown) => {
        this.contactError.set(asApiError(error));
        this.savingContacts.set(false);
      },
    });
  }

  savePhoto(): void {
    const photo = this.selectedPhoto();
    if (!photo) return;
    this.savingPhoto.set(true);
    this.photoError.set(null);
    this.photoSaved.set(false);
    this.me.putPhoto({ photoContentType: photo.photoContentType, photoBase64: photo.photoBase64 }).subscribe({
      next: () => {
        this.photoUrl.set(photo.dataUrl);
        this.selectedPhoto.set(null);
        this.photoPicker()?.markSaved();
        this.profile.update((profile) => profile ? { ...profile, hasPhoto: true } : profile);
        this.session.setPhoto(photo.dataUrl);
        this.photoSaved.set(true);
        this.savingPhoto.set(false);
        this.notifier.success('Employee photo saved.');
      },
      error: (error: unknown) => {
        this.photoError.set(asApiError(error));
        this.savingPhoto.set(false);
      },
    });
  }
}
