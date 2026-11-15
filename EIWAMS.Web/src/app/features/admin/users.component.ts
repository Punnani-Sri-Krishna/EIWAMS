import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { Subject, Subscription, debounceTime, distinctUntilChanged, startWith } from 'rxjs';

import { ApiError, Lookups } from '../../core/models/api.models';
import { AdminErrorComponent, AdminLoadingComponent, asApiError } from './admin-shared';
import { AdminUser, GUID_PATTERN, Location, Role, SaveAdminUserRequest } from './admin.models';
import { AdminService } from './admin.service';
import { buildLocationTree } from './location-tree';

type EmployeeOption = Lookups['employees'][number];

interface UserDialogData {
  user: AdminUser | null;
  roles: Role[];
  lookups: Lookups | null;
}

function facilityScope(group: AbstractControl): ValidationErrors | null {
  const all = group.get('allFacilities')?.value as boolean;
  const ids = (group.get('facilityIds')?.value as number[] | null) ?? [];
  return !all && ids.length === 0 ? { facilityRequired: true } : null;
}

function lookupLocationsAsTree(lookups: Lookups | null) {
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
    readerCount: 0,
  }));
  return buildLocationTree(asLocations).map((l) => ({
    id: l.locationId,
    label: `${'\u00A0\u00A0'.repeat(l.depth)}${l.locationName} (${l.locationType})`,
  }));
}

@Component({
  selector: 'app-user-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatAutocompleteModule,
    AdminErrorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.user ? 'Edit user' : 'New user' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()" novalidate>
      <mat-dialog-content>
        @if (error(); as e) {
          <app-admin-error [error]="e" [retryable]="false" />
        }
        <div class="row g-2">
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Display name</mat-label>
            <input matInput formControlName="displayName" maxlength="150" required />
            @if (form.controls.displayName.hasError('required')) { <mat-error>Display name is required.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" maxlength="256" required />
            @if (form.controls.email.hasError('required')) { <mat-error>Email is required.</mat-error> }
            @if (form.controls.email.hasError('email')) { <mat-error>Enter a valid email address.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Linked employee</mat-label>
            <input matInput [formControl]="employeeSearch" [matAutocomplete]="empAuto" placeholder="Search by name or number" />
            <mat-autocomplete #empAuto="matAutocomplete" [displayWith]="employeeLabel" (optionSelected)="pickEmployee($event.option.value)">
              <mat-option [value]="null">— Not linked —</mat-option>
              @for (e of employeeOptions(); track e.id) {
                <mat-option [value]="e">{{ e.name }} ({{ e.employeeNumber }})</mat-option>
              }
            </mat-autocomplete>
            <mat-hint>{{ form.controls.employeeId.value ? 'Linked' : 'Optional' }}</mat-hint>
          </mat-form-field>
          <mat-form-field class="col-12 col-md-6">
            <mat-label>Entra object ID</mat-label>
            <input matInput formControlName="entraObjectId" placeholder="00000000-0000-0000-0000-000000000000" />
            @if (form.controls.entraObjectId.hasError('pattern')) { <mat-error>Enter a valid GUID.</mat-error> }
          </mat-form-field>
          <mat-form-field class="col-12">
            <mat-label>Roles</mat-label>
            <mat-select formControlName="roleIds" multiple required>
              @for (r of data.roles; track r.roleId) {
                <mat-option [value]="r.roleId">{{ r.roleName }}</mat-option>
              }
            </mat-select>
            @if (form.controls.roleIds.hasError('required')) { <mat-error>Assign at least one role.</mat-error> }
          </mat-form-field>
          <div class="col-12">
            <mat-slide-toggle formControlName="allFacilities">Access to all facilities</mat-slide-toggle>
          </div>
          <mat-form-field class="col-12">
            <mat-label>Facility scope</mat-label>
            <mat-select formControlName="facilityIds" multiple>
              @for (l of facilityOptions; track l.id) {
                <mat-option [value]="l.id">{{ l.label }}</mat-option>
              }
            </mat-select>
            @if (form.controls.allFacilities.value) {
              <mat-hint>Not needed: the user can access all facilities.</mat-hint>
            } @else if (form.hasError('facilityRequired') && (form.controls.facilityIds.touched || submitted())) {
              <mat-hint class="text-danger">Select at least one facility or enable all facilities.</mat-hint>
            }
          </mat-form-field>
          <div class="col-12">
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
export class UserDialogComponent {
  readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<UserDialogComponent, AdminUser>);
  private readonly admin = inject(AdminService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly facilityOptions = lookupLocationsAsTree(this.data.lookups);
  private readonly employees = this.data.lookups?.employees ?? [];

  readonly form = this.fb.group(
    {
      displayName: [this.data.user?.displayName ?? '', [Validators.required, Validators.maxLength(150)]],
      email: [this.data.user?.email ?? '', [Validators.required, Validators.email, Validators.maxLength(256)]],
      entraObjectId: [this.data.user?.entraObjectId ?? '', Validators.pattern(GUID_PATTERN)],
      employeeId: [this.data.user?.employeeId ?? (null as number | null)],
      roleIds: [[...(this.data.user?.roleIds ?? [])] as number[], Validators.required],
      allFacilities: [this.data.user?.allFacilities ?? false],
      facilityIds: [[...(this.data.user?.facilityIds ?? [])] as number[]],
      isActive: [this.data.user?.isActive ?? true],
    },
    { validators: facilityScope },
  );

  readonly employeeSearch = new FormControl<EmployeeOption | string | null>(
    this.employees.find((e) => e.id === this.data.user?.employeeId) ??
      (this.data.user?.employeeId ? (this.data.user.employeeNumber ?? `#${this.data.user.employeeId}`) : null),
  );
  private readonly searchText = toSignal(this.employeeSearch.valueChanges.pipe(startWith(this.employeeSearch.value)));
  readonly employeeOptions = computed(() => {
    const v = this.searchText();
    const term = typeof v === 'string' ? v.trim().toLowerCase() : '';
    const list = term
      ? this.employees.filter((e) => `${e.name} ${e.employeeNumber}`.toLowerCase().includes(term))
      : this.employees;
    return list.slice(0, 50);
  });

  constructor() {
    this.syncFacilityState(this.form.controls.allFacilities.value);
    this.form.controls.allFacilities.valueChanges.pipe(takeUntilDestroyed()).subscribe((all) => this.syncFacilityState(all));
    this.employeeSearch.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      if (v === '' || v === null) {
        this.form.controls.employeeId.setValue(null);
      }
    });
  }

  employeeLabel = (e: EmployeeOption | string | null): string =>
    !e ? '' : typeof e === 'string' ? e : `${e.name} (${e.employeeNumber})`;

  pickEmployee(e: EmployeeOption | null): void {
    this.form.controls.employeeId.setValue(e?.id ?? null);
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    const body: SaveAdminUserRequest = {
      displayName: v.displayName.trim(),
      email: v.email.trim(),
      entraObjectId: v.entraObjectId.trim() || null,
      employeeId: v.employeeId,
      isActive: v.isActive,
      allFacilities: v.allFacilities,
      roleIds: v.roleIds,
      facilityIds: v.allFacilities ? [] : v.facilityIds,
    };
    const req = this.data.user ? this.admin.updateUser(this.data.user.userId, body) : this.admin.createUser(body);
    req.subscribe({
      next: (u) => this.ref.close(u),
      error: (e) => {
        this.saving.set(false);
        this.error.set(asApiError(e));
      },
    });
  }

  private syncFacilityState(all: boolean): void {
    const ctrl = this.form.controls.facilityIds;
    if (all) {
      ctrl.disable({ emitEvent: false });
    } else {
      ctrl.enable({ emitEvent: false });
    }
  }
}

@Component({
  selector: 'app-users',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    AdminErrorComponent,
    AdminLoadingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Users</h1>
        <div class="page-actions">
          <button mat-flat-button color="primary" type="button" (click)="edit(null)" [disabled]="!roles().length">
            <mat-icon>person_add</mat-icon> New user
          </button>
        </div>
      </header>

      <div class="data-card">
        <div class="filter-bar row g-2">
          <mat-form-field class="col-12 col-md-6" subscriptSizing="dynamic">
            <mat-label>Search</mat-label>
            <input matInput [formControl]="search" placeholder="Name or email" />
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
        } @else if (!loading() && users().length === 0) {
          <div class="empty-state"><mat-icon>person_search</mat-icon><p>No users match the current filters.</p></div>
        }

        <div class="table-wrap" [hidden]="!users().length">
          <table mat-table [dataSource]="users()" matSort (matSortChange)="onSort($event)" matSortActive="displayName" matSortDirection="asc">
            <ng-container matColumnDef="displayName">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Name</th>
              <td mat-cell *matCellDef="let u">
                <div>{{ u.displayName }}</div>
                <small class="text-muted">{{ u.email }}</small>
              </td>
            </ng-container>
            <ng-container matColumnDef="employee">
              <th mat-header-cell *matHeaderCellDef>Employee</th>
              <td mat-cell *matCellDef="let u">{{ u.employeeNumber ?? '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="roles">
              <th mat-header-cell *matHeaderCellDef>Roles</th>
              <td mat-cell *matCellDef="let u">
                <mat-chip-set [attr.aria-label]="'Roles of ' + u.displayName">
                  @for (r of u.roleNames; track r) {
                    <mat-chip>{{ r }}</mat-chip>
                  } @empty {
                    <span class="text-muted">None</span>
                  }
                </mat-chip-set>
              </td>
            </ng-container>
            <ng-container matColumnDef="scope">
              <th mat-header-cell *matHeaderCellDef>Facility scope</th>
              <td mat-cell *matCellDef="let u">
                {{ u.allFacilities ? 'All facilities' : (u.facilityNames.length ? u.facilityNames.join(', ') : 'None') }}
              </td>
            </ng-container>
            <ng-container matColumnDef="lastLoginAtUtc">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>Last login</th>
              <td mat-cell *matCellDef="let u" class="num">{{ u.lastLoginAtUtc ? (u.lastLoginAtUtc | date: 'medium') : 'Never' }}</td>
            </ng-container>
            <ng-container matColumnDef="isActive">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let u">
                <span class="status-chip" [class.tone-success]="u.isActive" [class.tone-neutral]="!u.isActive">
                  <mat-icon aria-hidden="true">{{ u.isActive ? 'check_circle' : 'block' }}</mat-icon>
                  {{ u.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef><span class="visually-hidden">Actions</span></th>
              <td mat-cell *matCellDef="let u">
                <button mat-icon-button type="button" (click)="edit(u)" [attr.aria-label]="'Edit ' + u.displayName">
                  <mat-icon>edit</mat-icon>
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
        <mat-paginator [length]="total()" [pageIndex]="page() - 1" [pageSize]="pageSize()" [pageSizeOptions]="[10, 20, 50, 100]"
          (page)="onPage($event)" aria-label="Users pages" [hidden]="!total()" />
      </div>
    </section>
  `,
})
export class UsersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private loadSub?: Subscription;
  private readonly reload$ = new Subject<void>();

  readonly columns = ['displayName', 'employee', 'roles', 'scope', 'lastLoginAtUtc', 'isActive', 'actions'];
  readonly search = new FormControl('', { nonNullable: true });
  readonly status = new FormControl('', { nonNullable: true });

  readonly users = signal<AdminUser[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(20);
  readonly sortBy = signal('displayName');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly roles = signal<Role[]>([]);
  private lookups: Lookups | null = null;

  ngOnInit(): void {
    this.admin
      .roles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (r) => this.roles.set(r ?? []), error: () => this.roles.set([]) });
    this.admin
      .lookups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (l) => (this.lookups = l), error: () => (this.lookups = null) });

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetAndLoad());
    this.status.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.resetAndLoad());
    this.reload$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
    this.load();
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const status = this.status.value;
    this.loadSub = this.admin
      .users({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search.value.trim() || undefined,
        isActive: status === '' ? undefined : status === 'true',
        sortBy: this.sortBy() || undefined,
        sortDir: this.sortDir(),
      })
      .subscribe({
        next: (res) => {
          this.users.set(res?.items ?? []);
          this.total.set(res?.totalCount ?? 0);
          this.loading.set(false);
        },
        error: (e) => {
          this.users.set([]);
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

  edit(user: AdminUser | null): void {
    this.dialog
      .open<UserDialogComponent, UserDialogData, AdminUser>(UserDialogComponent, {
        data: { user, roles: this.roles(), lookups: this.lookups },
        width: '760px',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.snack.open(`User ${user ? 'updated' : 'created'}.`, 'Close', { duration: 3000 });
          this.reload$.next();
        }
      });
  }

  private resetAndLoad(): void {
    this.page.set(1);
    this.load();
  }
}
