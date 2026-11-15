import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

import { ApiError } from '../../core/models/api.models';
import { AdminConfirmDialogComponent, AdminErrorComponent, AdminLoadingComponent, ConfirmData, asApiError, errorText } from './admin-shared';
import { PermissionGroup, groupPermissions } from './admin-helpers';
import { Role, RolePermission } from './admin.models';
import { AdminService } from './admin.service';

@Component({
  selector: 'app-roles',
  imports: [MatListModule, MatCheckboxModule, MatButtonModule, MatIconModule, MatChipsModule, AdminErrorComponent, AdminLoadingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .module { border-top: 1px solid rgba(0, 0, 0, 0.08); padding: 12px 0; }
    .module h3 { font-size: 1rem; margin: 0; }
    .perm-code { font-family: monospace; }
    .role-meta { font-size: 0.8rem; opacity: 0.75; }
    .matrix-actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <h1>Roles &amp; permissions</h1>
      </header>

      @if (rolesError(); as e) {
        <app-admin-error [error]="e" (retry)="loadRoles()" />
      }

      <div class="row g-3">
        <div class="col-12 col-lg-4">
          <div class="data-card">
            <h2 class="h6">Roles</h2>
            @if (rolesLoading()) {
              <app-admin-loading />
            } @else if (!roles().length && !rolesError()) {
              <div class="empty-state"><mat-icon>groups</mat-icon><p>No roles found.</p></div>
            }
            <mat-nav-list aria-label="Roles">
              @for (r of roles(); track r.roleId) {
                <a mat-list-item (click)="select(r)" [activated]="selected()?.roleId === r.roleId"
                  (keydown.enter)="select(r)" tabindex="0" [attr.aria-current]="selected()?.roleId === r.roleId">
                  <span matListItemTitle>{{ r.roleName }} @if (r.isSystem) { <small>(system)</small> }</span>
                  <span matListItemLine class="role-meta">{{ r.userCount }} users · {{ r.permissionCount }} permissions</span>
                </a>
              }
            </mat-nav-list>
          </div>
        </div>

        <div class="col-12 col-lg-8">
          <div class="data-card">
            @if (!selected()) {
              <div class="empty-state"><mat-icon>admin_panel_settings</mat-icon><p>Select a role to view its permissions.</p></div>
            } @else {
              <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-2">
                <div>
                  <h2 class="h5 mb-1">{{ selected()!.roleName }}</h2>
                  @if (selected()!.description) { <p class="mb-0 text-muted">{{ selected()!.description }}</p> }
                </div>
                <div class="matrix-actions">
                  <mat-chip-set aria-label="Granted count">
                    <mat-chip>{{ granted().size }} / {{ permissions().length }} granted</mat-chip>
                  </mat-chip-set>
                  <button mat-stroked-button type="button" (click)="revert()" [disabled]="!dirty() || saving()">Revert</button>
                  <button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="!dirty() || saving()">
                    {{ saving() ? 'Saving…' : 'Save changes' }}
                  </button>
                </div>
              </div>

              @if (permsLoading()) {
                <app-admin-loading />
              }
              @if (permsError(); as e) {
                <app-admin-error [error]="e" (retry)="loadPermissions()" />
              } @else if (!permsLoading() && !permissions().length) {
                <div class="empty-state"><p>No permissions are defined.</p></div>
              }

              @for (g of groups(); track g.module) {
                <section class="module" [attr.aria-label]="g.module + ' permissions'">
                  <mat-checkbox [checked]="groupState(g) === 'all'" [indeterminate]="groupState(g) === 'some'"
                    (change)="toggleGroup(g, $event.checked)" [disabled]="saving()">
                    <h3>{{ g.module }}</h3>
                  </mat-checkbox>
                  <div class="row ms-3">
                    @for (p of g.permissions; track p.permissionId) {
                      <div class="col-12 col-md-6">
                        <mat-checkbox [checked]="granted().has(p.permissionId)" (change)="toggle(p.permissionId, $event.checked)"
                          [disabled]="saving()">
                          <span class="perm-code">{{ p.code }}</span>
                          @if (p.description) { <br /><small class="text-muted">{{ p.description }}</small> }
                        </mat-checkbox>
                      </div>
                    }
                  </div>
                </section>
              }
            }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class RolesComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private permsSub?: Subscription;

  readonly roles = signal<Role[]>([]);
  readonly rolesLoading = signal(true);
  readonly rolesError = signal<ApiError | null>(null);
  readonly selected = signal<Role | null>(null);

  readonly permissions = signal<RolePermission[]>([]);
  readonly permsLoading = signal(false);
  readonly permsError = signal<ApiError | null>(null);
  readonly original = signal<ReadonlySet<number>>(new Set());
  readonly granted = signal<ReadonlySet<number>>(new Set());
  readonly saving = signal(false);

  readonly groups = computed(() => groupPermissions(this.permissions()));
  readonly dirty = computed(() => {
    const a = this.original();
    const b = this.granted();
    return a.size !== b.size || [...a].some((id) => !b.has(id));
  });

  ngOnInit(): void {
    this.loadRoles();
  }

  loadRoles(): void {
    this.rolesLoading.set(true);
    this.rolesError.set(null);
    this.admin
      .roles()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roles) => {
          this.roles.set(roles ?? []);
          this.rolesLoading.set(false);
          const current = this.selected();
          const keep = current && roles.find((r) => r.roleId === current.roleId);
          if (keep) {
            this.selected.set(keep);
          } else if (!current && roles.length) {
            this.select(roles[0]);
          }
        },
        error: (e) => {
          this.rolesError.set(asApiError(e));
          this.rolesLoading.set(false);
        },
      });
  }

  select(role: Role): void {
    if (role.roleId === this.selected()?.roleId) {
      return;
    }
    if (!this.dirty()) {
      this.applySelection(role);
      return;
    }
    this.dialog
      .open<AdminConfirmDialogComponent, ConfirmData, boolean>(AdminConfirmDialogComponent, {
        data: { title: 'Discard changes?', message: 'You have unsaved permission changes. Discard them?', confirmText: 'Discard' },
      })
      .afterClosed()
      .subscribe((ok) => ok && this.applySelection(role));
  }

  loadPermissions(): void {
    const role = this.selected();
    if (!role) {
      return;
    }
    this.permsSub?.unsubscribe();
    this.permsLoading.set(true);
    this.permsError.set(null);
    this.permsSub = this.admin
      .rolePermissions(role.roleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (perms) => {
          this.setPermissions(perms ?? []);
          this.permsLoading.set(false);
        },
        error: (e) => {
          this.permissions.set([]);
          this.permsError.set(asApiError(e));
          this.permsLoading.set(false);
        },
      });
  }

  groupState(group: PermissionGroup): 'all' | 'some' | 'none' {
    const granted = this.granted();
    const count = group.permissions.filter((p) => granted.has(p.permissionId)).length;
    return count === 0 ? 'none' : count === group.permissions.length ? 'all' : 'some';
  }

  toggle(id: number, checked: boolean): void {
    const next = new Set(this.granted());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.granted.set(next);
  }

  toggleGroup(group: PermissionGroup, checked: boolean): void {
    const next = new Set(this.granted());
    for (const p of group.permissions) {
      if (checked) {
        next.add(p.permissionId);
      } else {
        next.delete(p.permissionId);
      }
    }
    this.granted.set(next);
  }

  revert(): void {
    this.granted.set(new Set(this.original()));
  }

  save(): void {
    const role = this.selected();
    if (!role) {
      return;
    }
    this.saving.set(true);
    const ids = [...this.granted()].sort((a, b) => a - b);
    this.admin.setRolePermissions(role.roleId, ids).subscribe({
      next: (perms) => {
        if (Array.isArray(perms) && perms.length) {
          this.setPermissions(perms);
        } else {
          this.original.set(new Set(ids));
        }
        this.saving.set(false);
        this.snack.open(`Permissions for ${role.roleName} saved.`, 'Close', { duration: 3000 });
        this.loadRoles();
      },
      error: (e) => {
        this.saving.set(false);
        this.snack.open(errorText(asApiError(e)), 'Close', { duration: 6000 });
      },
    });
  }

  private applySelection(role: Role): void {
    this.selected.set(role);
    this.loadPermissions();
  }

  private setPermissions(perms: RolePermission[]): void {
    const granted = new Set(perms.filter((p) => p.granted).map((p) => p.permissionId));
    this.permissions.set(perms);
    this.original.set(granted);
    this.granted.set(new Set(granted));
  }
}
