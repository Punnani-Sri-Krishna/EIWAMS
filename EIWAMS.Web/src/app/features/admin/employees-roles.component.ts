import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Subscription, debounceTime, distinctUntilChanged, startWith } from 'rxjs';

import { ApiError, Lookups } from '../../core/models/api.models';
import { AdminErrorComponent, AdminLoadingComponent, asApiError } from './admin-shared';
import { ASSIGNABLE_ROLES, BASE_ROLE, EmployeeRoleRow, Location, roleLabel } from './admin.models';
import { AdminService } from './admin.service';
import { buildLocationTree } from './location-tree';

type EmployeeOption = Lookups['employees'][number];

interface EditDialogData {
  row: EmployeeRoleRow;
  lookups: Lookups | null;
}

function locationOptions(lookups: Lookups | null): { id: number; label: string }[] {
  const asLocations: Location[] = (lookups?.locations ?? []).map((l) => ({
    locationId: l.id,
    parentLocationId: l.parentLocationId,
    parentLocationName: null,
    locationCode: l.code,
    locationName: l.name,
    locationType: l.locationType,
    isRestricted: l.isRestricted,
    isActive: true,
    timeZone: null,
    path: null,
  }));
  return buildLocationTree(asLocations).map((l) => ({
    id: l.locationId,
    label: `${'\u00A0\u00A0'.repeat(l.depth)}${l.locationName} (${l.locationType})`,
  }));
}

@Component({
  selector: 'app-employee-roles-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatAutocompleteModule,
    MatProgressBarModule,
    AdminErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .who { margin: 0 0 12px; color: var(--lab-muted, #5b6b78); }
    fieldset { border: 0; margin: 0 0 8px; padding: 0; }
    legend { font-weight: 600; font-size: 0.95rem; margin-bottom: 4px; }
    .role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 2px 12px; }
    .role-desc { display: block; font-size: 0.78rem; color: var(--lab-muted, #5b6b78); }
    .section-title { font-weight: 600; font-size: 0.95rem; margin: 12px 0 8px; }
  `,
  template: `
    <h2 mat-dialog-title>Edit employee</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        <p class="who">{{ data.row.displayName }} · {{ data.row.employeeNumber ?? '#' + data.row.employeeId }}@if (data.row.email) { · {{ data.row.email }} }</p>
        @if (prefilling()) {
          <mat-progress-bar mode="indeterminate" aria-label="Loading employee details" />
        }
        @if (error(); as e) {
          <app-admin-error [error]="e" [retryable]="false" />
        }

        <fieldset>
          <legend>Roles</legend>
          <div class="role-grid">
            @for (r of roleOptions; track r.code) {
              <mat-checkbox [checked]="isBase(r.code) || roles().includes(r.code)" [disabled]="isBase(r.code) || saving()"
                (change)="toggleRole(r.code, $event.checked)">
                {{ r.label }}<span class="role-desc">{{ r.description }}</span>
              </mat-checkbox>
            }
          </div>
        </fieldset>

        <div class="section-title">Organisation</div>
        <div class="row g-2">
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Department</mat-label>
            <mat-select formControlName="departmentId" required>
              @for (d of departments; track d.id) {
                <mat-option [value]="d.id">{{ d.name }}</mat-option>
              }
            </mat-select>
            @if (form.controls.departmentId.hasError('required')) { <mat-error>Department is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Designation</mat-label>
            <input matInput formControlName="designation" maxlength="150" />
          </mat-form-field>
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Manager</mat-label>
            <input matInput [formControl]="managerSearch" [matAutocomplete]="mgrAuto" placeholder="Search by name or number" />
            <mat-autocomplete #mgrAuto="matAutocomplete" [displayWith]="employeeLabel" (optionSelected)="pickManager($event.option.value)">
              <mat-option [value]="null">— No manager —</mat-option>
              @for (e of managerOptions(); track e.id) {
                <mat-option [value]="e">{{ e.name }} ({{ e.employeeNumber }})</mat-option>
              }
            </mat-autocomplete>
            <mat-hint>{{ form.controls.managerEmployeeId.value ? 'Selected' : 'Optional' }}</mat-hint>
          </mat-form-field>
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Location</mat-label>
            <mat-select formControlName="locationId" required>
              @for (l of locations; track l.id) {
                <mat-option [value]="l.id">{{ l.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.locationId.hasError('required')) { <mat-error>Location is required.</mat-error> }
          </mat-form-field>
        </div>
        @if (!hasAccount) {
          <p class="who">This employee has no sign-in account yet. Saving creates one with the selected roles.</p>
        }
        <mat-slide-toggle formControlName="isActive">Active (can sign in)</mat-slide-toggle>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close [disabled]="saving()">Cancel</button>
        <button mat-flat-button color="primary" type="submit" [disabled]="saving() || prefilling()">
          {{ saving() ? 'Saving…' : 'Save' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class EmployeeRolesDialogComponent {
  readonly data = inject<EditDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<EmployeeRolesDialogComponent, EmployeeRoleRow | true>);
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder);

  readonly roleOptions = ASSIGNABLE_ROLES;
  readonly hasAccount = this.data.row.userId != null;
  readonly departments = this.data.lookups?.departments ?? [];
  readonly locations = locationOptions(this.data.lookups);
  private readonly employees = (this.data.lookups?.employees ?? []).filter((e) => e.id !== this.data.row.employeeId);

  readonly saving = signal(false);
  readonly prefilling = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly roles = signal<string[]>(this.data.row.roles.filter((r) => r !== BASE_ROLE));

  readonly form = this.fb.group({
    departmentId: [this.data.row.departmentId, Validators.required],
    designation: [this.data.row.designation ?? '', Validators.maxLength(150)],
    managerEmployeeId: [this.data.row.managerEmployeeId],
    locationId: [this.data.row.locationId, Validators.required],
    isActive: this.fb.nonNullable.control(this.data.row.isActive),
  });

  readonly managerSearch = new FormControl<EmployeeOption | string | null>(this.managerOption(this.data.row.managerEmployeeId, this.data.row.managerName));
  private readonly managerText = toSignal(this.managerSearch.valueChanges.pipe(startWith(this.managerSearch.value)));
  readonly managerOptions = computed(() => {
    const v = this.managerText();
    const term = typeof v === 'string' ? v.trim().toLowerCase() : '';
    const list = term ? this.employees.filter((e) => `${e.name} ${e.employeeNumber}`.toLowerCase().includes(term)) : this.employees;
    return list.slice(0, 50);
  });

  constructor() {
    this.managerSearch.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      if (v === '' || v === null) {
        this.form.controls.managerEmployeeId.setValue(null);
      }
    });
    const row = this.data.row;
    // Older list rows may not carry the organisation fields yet: read them from the employee record.
    if (row.departmentId == null || row.locationId == null) {
      this.prefilling.set(true);
      this.admin.employeeOrg(row.employeeId).subscribe({
        next: (o) => {
          this.prefilling.set(false);
          this.form.patchValue({
            departmentId: o.departmentId,
            locationId: o.locationId,
            managerEmployeeId: o.managerEmployeeId,
            designation: o.designation ?? this.form.controls.designation.value,
          });
          this.managerSearch.setValue(this.managerOption(o.managerEmployeeId, null), { emitEvent: false });
        },
        error: () => this.prefilling.set(false),
      });
    }
  }

  isBase(code: string): boolean {
    return code === BASE_ROLE;
  }

  toggleRole(code: string, checked: boolean): void {
    this.roles.update((list) => (checked ? [...new Set([...list, code])] : list.filter((r) => r !== code)));
  }

  employeeLabel = (e: EmployeeOption | string | null): string => (!e ? '' : typeof e === 'string' ? e : `${e.name} (${e.employeeNumber})`);

  pickManager(e: EmployeeOption | null): void {
    this.form.controls.managerEmployeeId.setValue(e?.id ?? null);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.admin
      .updateEmployeeRoles(this.data.row.employeeId, {
        roles: [BASE_ROLE, ...this.roles()],
        managerEmployeeId: v.managerEmployeeId ?? null,
        departmentId: v.departmentId ?? null,
        designation: (v.designation ?? '').trim() || null,
        locationId: v.locationId ?? null,
        isActive: v.isActive,
      })
      .subscribe({
        next: (row) => this.ref.close(row ?? true),
        error: (e) => {
          this.saving.set(false);
          this.error.set(asApiError(e));
        },
      });
  }

  private managerOption(id: number | null, name: string | null): EmployeeOption | string | null {
    if (id == null) {
      return null;
    }
    return this.employees.find((e) => e.id === id) ?? name ?? `#${id}`;
  }
}

@Component({
  selector: 'app-employees-roles',
  imports: [
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    AdminErrorComponent,
    AdminLoadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .role-list { display: flex; flex-wrap: wrap; gap: 4px; }
    .role-pill {
      display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; white-space: nowrap;
      background: color-mix(in srgb, var(--lab-teal, #0FA3B1) 14%, white); color: var(--lab-primary, #0B3C5D);
    }
    .role-pill.base { background: var(--lab-surface, #F4F8FB); color: var(--lab-muted, #5b6b78); font-weight: 500; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Employees &amp; roles</h1>
          <p class="subtitle">Employees come from HR. Assign roles, manager, department and location here.</p>
        </div>
        <div class="page-actions">
          <button mat-stroked-button type="button" (click)="load()"><mat-icon>refresh</mat-icon>Refresh</button>
        </div>
      </header>

      <div class="data-card">
        <div class="filter-bar row g-2">
          <mat-form-field class="col-12 col-md-6" subscriptSizing="dynamic">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="search" placeholder="Name, email or employee number" />
            <mat-icon matSuffix>search</mat-icon>
          </mat-form-field>
          <mat-form-field class="col-12 col-md-3" subscriptSizing="dynamic">
            <mat-label>Status</mat-label>
            <mat-select [formControl]="status">
              <mat-option value="">All</mat-option>
              <mat-option value="true">Active</mat-option>
              <mat-option value="false">Inactive</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        @if (loading()) {
          <app-admin-loading />
        }
        @if (error(); as e) {
          <app-admin-error [error]="e" (retry)="load()" />
        } @else if (!loading() && rows().length === 0) {
          <div class="empty-state"><mat-icon>person_search</mat-icon><p>No employees match the current filters.</p></div>
        }

        <div class="table-wrap" [hidden]="!rows().length">
          <table mat-table [dataSource]="rows()" matSort (matSortChange)="onSort($event)" matSortActive="displayName"
            matSortDirection="asc" aria-label="Employees and roles">
            <ng-container matColumnDef="displayName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Employee</th>
              <td mat-cell *matCellDef="let r">
                <div>{{ r.displayName }}</div>
                <span class="cell-sub">{{ r.employeeNumber ?? '#' + r.employeeId }}@if (r.email) { · {{ r.email }} }</span>
                @if (r.userId === null) { <span class="cell-sub">No sign-in account yet</span> }
              </td>
            </ng-container>
            <ng-container matColumnDef="department">
              <th mat-header-cell *matHeaderCellDef>Department</th>
              <td mat-cell *matCellDef="let r">
                {{ r.departmentName ?? '—' }}
                @if (r.designation) { <span class="cell-sub">{{ r.designation }}</span> }
              </td>
            </ng-container>
            <ng-container matColumnDef="manager">
              <th mat-header-cell *matHeaderCellDef>Manager</th>
              <td mat-cell *matCellDef="let r">{{ r.managerName ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="roles">
              <th mat-header-cell *matHeaderCellDef>Roles</th>
              <td mat-cell *matCellDef="let r">
                <div class="role-list" [attr.aria-label]="'Roles of ' + r.displayName">
                  @for (code of r.roles; track code) {
                    <span class="role-pill" [class.base]="code === baseRole">{{ roleLabel(code) }}</span>
                  }
                </div>
              </td>
            </ng-container>
            <ng-container matColumnDef="isActive">
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
              <td mat-cell *matCellDef="let r" class="text-end">
                <button mat-icon-button type="button" (click)="edit(r)" [attr.aria-label]="'Edit roles of ' + r.displayName">
                  <mat-icon>edit</mat-icon>
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPage($event)" aria-label="Employee pages" [hidden]="!total()" showFirstLastButtons />
      </div>
    </section>
  `,
})
export class EmployeesRolesComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub?: Subscription;
  private lookups: Lookups | null = null;

  readonly baseRole = BASE_ROLE;
  readonly roleLabel = roleLabel;
  readonly columns = ['displayName', 'department', 'manager', 'roles', 'isActive', 'actions'];
  readonly search = new FormControl('', { nonNullable: true });
  readonly status = new FormControl('', { nonNullable: true });

  readonly rows = signal<EmployeeRoleRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly sortBy = signal('displayName');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);

  ngOnInit(): void {
    this.admin
      .lookups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (l) => (this.lookups = l), error: () => (this.lookups = null) });
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetAndLoad());
    this.status.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.resetAndLoad());
    this.destroyRef.onDestroy(() => this.loadSub?.unsubscribe());
    this.load();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const status = this.status.value;
    this.loadSub = this.admin
      .employeeRoles({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search.value.trim() || undefined,
        isActive: status === '' ? undefined : status === 'true',
        sortBy: this.sortBy() || undefined,
        sortDir: this.sortDir(),
      })
      .subscribe({
        next: (res) => {
          this.rows.set(res?.items ?? []);
          this.total.set(res?.totalCount ?? 0);
          this.loading.set(false);
        },
        error: (e) => {
          this.rows.set([]);
          this.total.set(0);
          this.error.set(asApiError(e));
          this.loading.set(false);
        },
      });
  }

  onPage(e: PageEvent): void {
    this.page.set(e.pageIndex + 1);
    this.pageSize.set(e.pageSize);
    this.load();
  }

  onSort(s: Sort): void {
    this.sortBy.set(s.direction ? s.active : '');
    this.sortDir.set(s.direction === 'desc' ? 'desc' : 'asc');
    this.resetAndLoad();
  }

  edit(row: EmployeeRoleRow): void {
    this.dialog
      .open<EmployeeRolesDialogComponent, EditDialogData, EmployeeRoleRow | true>(EmployeeRolesDialogComponent, {
        data: { row, lookups: this.lookups },
        width: '760px',
        maxWidth: '95vw',
        autoFocus: 'first-tabbable',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open(`${row.displayName} updated.`, 'Close', { duration: 3000 });
          this.load();
        }
      });
  }

  private resetAndLoad(): void {
    this.page.set(1);
    this.load();
  }
}
