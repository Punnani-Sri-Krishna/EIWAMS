import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { PHOTO_ACCEPT, ProcessedPhoto, processPhoto, validatePhotoFile } from '../../utils/image-resize';

let nextId = 0;

/**
 * Plain file input (no camera) that crops to a square, resizes to <= 600x600 JPEG on the
 * client and previews the result. Emits the processed photo (or null when cleared).
 */
@Component({
  selector: 'app-photo-picker',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker" [class.compact]="compact()">
      <div class="frame" [class.has-image]="!!preview()">
        @if (processing()) {
          <mat-spinner diameter="32" aria-label="Processing photo" />
        } @else if (preview(); as src) {
          <img [src]="src" [alt]="alt()" width="600" height="600" />
        } @else {
          <mat-icon aria-hidden="true">person</mat-icon>
        }
        @if (selected()) {
          <span class="badge">New</span>
        }
      </div>
      <div class="controls">
        <input #file class="visually-hidden" type="file" tabindex="-1" [id]="inputId" [accept]="accept"
               [attr.aria-describedby]="inputId + '-hint'" (change)="onFile($event)" />
        <div class="buttons">
          <button mat-stroked-button type="button" (click)="file.click()" [disabled]="processing() || disabled()"
                  [attr.aria-controls]="inputId">
            <mat-icon>upload</mat-icon>{{ preview() ? 'Change photo' : 'Choose photo' }}
          </button>
          @if (selected()) {
            <button mat-button type="button" (click)="clear()" [disabled]="processing() || disabled()">
              <mat-icon>undo</mat-icon>Discard
            </button>
          }
        </div>
        <p class="hint" [id]="inputId + '-hint'">
          JPEG, PNG or WebP. Cropped to a square and resized to 600 &times; 600 px (max 1 MB).
        </p>
        @if (selected(); as p) {
          <p class="hint ok">Ready: {{ p.width }} &times; {{ p.height }} px, {{ sizeKb(p.sizeBytes) }} KB</p>
        }
        @if (error()) {
          <p class="hint err" role="alert">{{ error() }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .picker { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
    .frame {
      position: relative; width: 160px; height: 160px; flex: none; border-radius: 12px; overflow: hidden;
      display: grid; place-items: center; background: var(--lab-surface); border: 2px dashed var(--lab-border);
      mat-icon { font-size: 64px; width: 64px; height: 64px; color: var(--lab-border); }
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
      &.has-image { border-style: solid; }
    }
    .compact .frame { width: 112px; height: 112px; }
    .badge {
      position: absolute; top: 6px; left: 6px; padding: 0 8px; border-radius: 999px; font-size: 0.7rem; font-weight: 600;
      line-height: 20px; background: var(--lab-teal); color: #fff;
    }
    .controls { flex: 1; min-width: 200px; }
    .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
    .hint { margin: 8px 0 0; font-size: 0.78rem; color: var(--lab-muted); }
    .ok { color: var(--lab-success-fg); }
    .err { color: var(--lab-danger-fg); font-weight: 600; }
  `,
})
export class PhotoPickerComponent {
  readonly currentUrl = input<string | null>(null);
  readonly disabled = input(false);
  readonly compact = input(false);
  readonly alt = input('Employee photo');
  readonly photoChange = output<ProcessedPhoto | null>();

  protected readonly inputId = `photo-input-${++nextId}`;
  protected readonly accept = PHOTO_ACCEPT;
  protected readonly processing = signal(false);
  protected readonly error = signal<string | null>(null);
  readonly selected = signal<ProcessedPhoto | null>(null);
  protected readonly preview = computed(() => this.selected()?.dataUrl ?? this.currentUrl());
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('file');

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const invalid = validatePhotoFile(file);
    if (invalid) {
      this.error.set(invalid);
      this.resetInput();
      return;
    }
    this.processing.set(true);
    this.error.set(null);
    try {
      const photo = await processPhoto(file);
      this.selected.set(photo);
      this.photoChange.emit(photo);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'The photo could not be processed.');
    } finally {
      this.processing.set(false);
      this.resetInput();
    }
  }

  clear(): void {
    this.selected.set(null);
    this.error.set(null);
    this.photoChange.emit(null);
  }

  /** Clears the pending-upload badge after the parent has persisted the selected photo. */
  markSaved(): void {
    this.selected.set(null);
    this.error.set(null);
  }

  protected sizeKb(bytes: number): string {
    return (bytes / 1024).toFixed(0);
  }

  private resetInput(): void {
    const el = this.fileInput()?.nativeElement;
    if (el) el.value = '';
  }
}
