import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { startWith } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { SessionService } from '../../core/services/session.service';
import { AdminConfirmDialogComponent, AdminErrorComponent, AdminLoadingComponent, ConfirmData, asApiError, errorText } from './admin-shared';
import { CODE_PATTERN, LOCATION_TYPES, Location, SaveLocationRequest } from './admin.models';
import { AdminService } from './admin.service';
import { LocationRow, buildLocationTree, descendantIds, visibleRows } from './location-tree';

const TYPE_RANK: Record<string, number> = { Campus: 0, Building: 1, Floor: 2, Wing: 3, Zone: 4 };

interface LocationDialogData {
  location: Location | null;
  parentId: number | null;
  locations: Location[];
}

function parentRequired(group: AbstractControl): ValidationErrors | null {
  const type = group.get('locationType')?.value as string;
  const parent = group.get('parentLocationId')?.value as number | null;
  return type && type !== 'Campus' && parent == null ? { parentRequired: true } : null;
}

@Component({
  selector: 'app-location-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    AdminErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.location ? 'Edit location' : 'New location' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error(); as e) {
          <app-admin-error [error]="e" [retryable]="false" />
        }
        <div class="row g-2">
          <mat-form-field class="col-12 col-sm-5">
            <mat-label>Type</mat-label>
            <mat-select formControlName="locationType" required>
              @for (t of types; track t) {
                <mat-option [value]="t">{{ t }}</mat-option>
              }
            </mat-select>
            @if (form.controls.locationType.hasError('required')) { <mat-error>Type is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-7">
            <mat-label>Parent</mat-label>
            <mat-select formControlName="parentLocationId">
              <mat-option [value]="null">— None (top level) —</mat-option>
              @for (p of parentOptions(); track p.locationId) {
                <mat-option [value]="p.locationId">{{ p.label }}</mat-option>
              }
            </mat-select>
            @if (form.hasError('parentRequired')) {
              <mat-hint class="text-danger">A {{ form.controls.locationType.value }} needs a parent.</mat-hint>
            }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-5">
            <mat-label>Code</mat-label>
            <input matInput formControlName="locationCode" maxlength="30" required />
            @if (form.controls.locationCode.hasError('required')) { <mat-error>Code is required.</mat-error> }
            @if (form.controls.locationCode.hasError('pattern')) { <mat-error>Letters, digits, '-' and '_' only.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-sm-7">
            <mat-label>Name</mat-label>
            <input matInput formControlName="locationName" maxlength="150" required />
            @if (form.controls.locationName.hasError('required')) { <mat-error>Name is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12">
            <mat-label>Time zone</mat-label>
            <input matInput formControlName="timeZone" maxlength="64" placeholder="e.g. India Standard Time" />
          </mat-form-field>
          <div class="col-12 col-sm-6">
            <mat-slide-toggle formControlName="isRestricted">Restricted area</mat-slide-toggle>
          </div>
          <div class="col-12 col-sm-6">
            <mat-slide-toggle formControlName="isActive">Active</mat-slide-toggle>
          </div>
        </div>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class LocationDialogComponent {
  readonly data = inject<LocationDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<LocationDialogComponent, Location>);
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly types = LOCATION_TYPES;
  readonly saving = signal(false);
  readonly error = signal<ApiError | null>(null);

  private readonly parent = this.data.locations.find((l) => l.locationId === this.data.parentId);
  private readonly defaultType =
    this.data.location?.locationType ?? (this.parent ? LOCATION_TYPES[Math.min((TYPE_RANK[this.parent.locationType] ?? 0) + 1, LOCATION_TYPES.length - 1)] : 'Campus');

  readonly form = this.fb.group(
    {
      parentLocationId: [this.data.location?.parentLocationId ?? this.data.parentId ?? (null as number | null)],
      locationType: [this.defaultType as string, Validators.required],
      locationCode: [this.data.location?.locationCode ?? '', [Validators.required, Validators.maxLength(30), Validators.pattern(CODE_PATTERN)]],
      locationName: [this.data.location?.locationName ?? '', [Validators.required, Validators.maxLength(150)]],
      timeZone: [this.data.location?.timeZone ?? '', Validators.maxLength(64)],
      isRestricted: [this.data.location?.isRestricted ?? false],
      isActive: [this.data.location?.isActive ?? true],
    },
    { validators: parentRequired },
  );

  private readonly selectedType = toSignal(
    this.form.controls.locationType.valueChanges.pipe(startWith(this.form.controls.locationType.value)),
    { initialValue: this.defaultType },
  );

  /** Valid parents: higher-level types, excluding this location and its descendants. */
  readonly parentOptions = computed(() => {
    const rank = TYPE_RANK[this.selectedType()] ?? 9;
    const excluded = this.data.location ? descendantIds(this.data.locations, this.data.location.locationId) : new Set<number>();
    return buildLocationTree(this.data.locations)
      .filter((l) => !excluded.has(l.locationId) && (TYPE_RANK[l.locationType] ?? 9) < rank)
      .map((l) => ({ locationId: l.locationId, label: `${'\u00A0\u00A0'.repeat(l.depth)}${l.locationName} (${l.locationType})` }));
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body: SaveLocationRequest = {
      ...v,
      locationCode: v.locationCode.trim(),
      locationName: v.locationName.trim(),
      timeZone: v.timeZone.trim() || null,
    };
    this.admin.saveLocation(this.data.location?.locationId ?? null, body).subscribe({
      next: (l) => this.ref.close(l),
      error: (e) => {
        this.saving.set(false);
        this.error.set(asApiError(e));
      },
    });
  }
}

@Component({
  selector: 'app-locations',
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatSlideToggleModule,
    AdminErrorComponent,
    AdminLoadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tree-cell { display: flex; align-items: center; gap: 4px; }
    .tree-spacer { display: inline-block; width: 40px; }
    .inactive-row td { opacity: 0.6; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Locations</h1>
        <div class="page-actions">
          <mat-slide-toggle [checked]="showInactive()" (change)="showInactive.set($event.checked)">Show inactive</mat-slide-toggle>
          <button mat-stroked-button type="button" (click)="expandAll()">Expand all</button>
          @if (canManage) {
            <button mat-flat-button color="primary" type="button" (click)="edit(null, null)">
              <mat-icon>add</mat-icon> New campus
            </button>
          }
        </div>
      </header>

      <div class="data-card">
        @if (loading()) {
          <app-admin-loading />
        }
        @if (error(); as e) {
          <app-admin-error [error]="e" (retry)="load()" />
        } @else if (!loading() && rows().length === 0) {
          <div class="empty-state"><mat-icon>location_city</mat-icon><p>No locations defined yet.</p></div>
        }

        @if (rows().length) {
          <div class="table-wrap">
            <table mat-table [dataSource]="rows()" aria-label="Location hierarchy">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Name</th>
                <td mat-cell *matCellDef="let r">
                  <div class="tree-cell" [style.padding-left.px]="r.depth * 24">
                    @if (r.hasChildren) {
                      <button mat-icon-button type="button" (click)="toggle(r)"
                        [attr.aria-label]="(collapsed().has(r.locationId) ? 'Expand ' : 'Collapse ') + r.locationName"
                        [attr.aria-expanded]="!collapsed().has(r.locationId)">
                        <mat-icon>{{ collapsed().has(r.locationId) ? 'chevron_right' : 'expand_more' }}</mat-icon>
                      </button>
                    } @else {
                      <span class="tree-spacer"></span>
                    }
                    <mat-icon aria-hidden="true">{{ icon(r.locationType) }}</mat-icon>
                    <span>{{ r.locationName }}</span>
                    @if (r.isRestricted) {
                      <mat-icon aria-label="Restricted" matTooltip="Restricted area" color="warn">lock</mat-icon>
                    }
                  </div>
                </td>
              </ng-container>
              <ng-container matColumnDef="code">
                <th mat-header-cell *matHeaderCellDef>Code</th>
                <td mat-cell *matCellDef="let r">{{ r.locationCode }}</td>
              </ng-container>
              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>Type</th>
                <td mat-cell *matCellDef="let r">{{ r.locationType }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Status</th>
                <td mat-cell *matCellDef="let r">
                  <span class="status-chip" [class.tone-success]="r.isActive" [class.tone-neutral]="!r.isActive">
                    <mat-icon aria-hidden="true">{{ r.isActive ? 'check_circle' : 'block' }}</mat-icon>
                    {{ r.isActive ? 'Active' : 'Inactive' }}
                  </span>
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
                <td mat-cell *matCellDef="let r">
                  @if (canManage) {
                    @if (r.locationType !== 'Zone') {
                      <button mat-icon-button type="button" (click)="edit(null, r.locationId)" matTooltip="Add child"
                        [attr.aria-label]="'Add child under ' + r.locationName"><mat-icon>add</mat-icon></button>
                    }
                    <button mat-icon-button type="button" (click)="edit(r, null)" matTooltip="Edit"
                      [attr.aria-label]="'Edit ' + r.locationName"><mat-icon>edit</mat-icon></button>
                    @if (r.isActive) {
                      <button mat-icon-button type="button" (click)="deactivate(r)" matTooltip="Deactivate"
                        [attr.aria-label]="'Deactivate ' + r.locationName"><mat-icon>block</mat-icon></button>
                    }
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr mat-row *matRowDef="let row; columns: columns" [class.inactive-row]="!row.isActive"></tr>
            </table>
          </div>
        }
      </div>
    </section>
  `,
})
export class LocationsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = inject(SessionService).hasPermission('Reference.Manage');
  readonly columns = ['name', 'code', 'type', 'status', 'actions'];
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly locations = signal<Location[]>([]);
  readonly collapsed = signal<ReadonlySet<number>>(new Set());
  readonly showInactive = signal(false);

  readonly rows = computed(() => {
    const source = this.showInactive() ? this.locations() : this.locations().filter((l) => l.isActive);
    return visibleRows(buildLocationTree(source), this.collapsed());
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.admin
      .locations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.locations.set(rows ?? []);
          this.loading.set(false);
        },
        error: (e) => {
          this.error.set(asApiError(e));
          this.loading.set(false);
        },
      });
  }

  icon(type: string): string {
    const icons: Record<string, string> = { Campus: 'location_city', Building: 'apartment', Floor: 'layers', Zone: 'crop_free' };
    return icons[type] ?? 'place';
  }

  expandAll(): void {
    this.collapsed.set(new Set<number>());
  }

  toggle(row: LocationRow): void {
    const next = new Set(this.collapsed());
    if (next.has(row.locationId)) {
      next.delete(row.locationId);
    } else {
      next.add(row.locationId);
    }
    this.collapsed.set(next);
  }

  edit(location: Location | null, parentId: number | null): void {
    this.dialog
      .open<LocationDialogComponent, LocationDialogData, Location>(LocationDialogComponent, {
        data: { location, parentId, locations: this.locations() },
        width: '640px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open(`Location ${location ? 'updated' : 'created'}.`, 'Close', { duration: 3000 });
          this.load();
        }
      });
  }

  deactivate(location: Location): void {
    const activeChildren = this.locations().filter((l) => l.parentLocationId === location.locationId && l.isActive).length;
    this.dialog
      .open<AdminConfirmDialogComponent, ConfirmData, boolean>(AdminConfirmDialogComponent, {
        data: {
          title: 'Deactivate location',
          message:
            `Deactivate ${location.locationName}?` +
            (activeChildren ? ` It still has ${activeChildren} active child location(s).` : ''),
          confirmText: 'Deactivate',
        },
      })
      .afterClosed()
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        const body: SaveLocationRequest = {
          parentLocationId: location.parentLocationId,
          locationCode: location.locationCode,
          locationName: location.locationName,
          locationType: location.locationType,
          isRestricted: location.isRestricted,
          isActive: false,
          timeZone: location.timeZone,
        };
        this.admin.saveLocation(location.locationId, body).subscribe({
          next: () => {
            this.snack.open('Location deactivated.', 'Close', { duration: 3000 });
            this.load();
          },
          error: (e) => this.snack.open(errorText(asApiError(e)), 'Close', { duration: 6000 }),
        });
      });
  }
}
