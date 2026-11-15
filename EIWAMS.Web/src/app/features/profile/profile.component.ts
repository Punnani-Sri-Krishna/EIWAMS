import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { SessionService } from '../../core/services/session.service';
import { groupByModule } from './profile-helpers';

interface QuickLink {
  label: string;
  icon: string;
  route: string;
}

const QUICK_LINKS: QuickLink[] = [
  { label: 'My cards', icon: 'credit_card', route: '/cards' },
  { label: 'My access requests', icon: 'vpn_key', route: '/access-requests' },
  { label: 'My permissions', icon: 'verified_user', route: '/permissions' },
  { label: 'Notifications', icon: 'notifications', route: '/notifications' },
];

@Component({
  selector: 'app-profile',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .profile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    h2 { font-size: 1rem; margin: 0 0 12px; }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; margin: 0; }
    dt { opacity: 0.7; }
    dd { margin: 0; font-weight: 500; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .module { margin-bottom: 12px; }
    .module h3 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; margin: 0 0 6px; }
    .links { display: flex; flex-wrap: wrap; gap: 8px; }
    .avatar { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center;
      background: #0b3c5d; color: #fff; font-size: 1.3rem; font-weight: 600; }
    .identity { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
  `,
  template: `
    <div class="page">
      <header class="page-header"><h1>My profile</h1></header>
      @if (session.user(); as user) {
        <div class="profile-grid">
          <section class="data-card">
            <div class="identity">
              <div class="avatar" aria-hidden="true">{{ initials() }}</div>
              <div>
                <div class="name">{{ user.displayName }}</div>
                <div>{{ user.email }}</div>
              </div>
            </div>
            <dl>
              <dt>Employee number</dt>
              <dd>{{ user.employeeNumber || 'Not linked' }}</dd>
              <dt>User ID</dt>
              <dd class="num">{{ user.userId }}</dd>
              <dt>Facility scope</dt>
              <dd>{{ facilityScope() }}</dd>
            </dl>
          </section>

          <section class="data-card">
            <h2>Roles</h2>
            <div class="chips">
              @for (role of user.roles; track role) {
                <span class="status-chip tone-info"><mat-icon>shield_person</mat-icon>{{ role }}</span>
              } @empty {
                <span class="empty-state">No roles assigned.</span>
              }
            </div>
            <h2 style="margin-top: 20px">Quick links</h2>
            <div class="links">
              @for (link of quickLinks; track link.route) {
                <a mat-stroked-button [routerLink]="link.route"><mat-icon>{{ link.icon }}</mat-icon>{{ link.label }}</a>
              }
            </div>
          </section>

          <section class="data-card">
            <h2>Permissions ({{ user.permissions.length }})</h2>
            @for (group of permissionGroups(); track group.module) {
              <div class="module">
                <h3>{{ group.module }}</h3>
                <div class="chips">
                  @for (p of group.permissions; track p) {
                    <span class="status-chip tone-neutral">{{ p }}</span>
                  }
                </div>
              </div>
            } @empty {
              <div class="empty-state"><mat-icon>lock</mat-icon><p>No permissions granted.</p></div>
            }
          </section>
        </div>
      } @else {
        <div class="empty-state"><mat-icon>person_off</mat-icon><p>Profile not loaded.</p></div>
      }
    </div>
  `,
})
export class ProfileComponent {
  protected readonly session = inject(SessionService);
  protected readonly quickLinks = QUICK_LINKS;

  protected readonly permissionGroups = computed(() => groupByModule(this.session.user()?.permissions ?? []));

  protected readonly initials = computed(() =>
    (this.session.user()?.displayName ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join(''),
  );

  protected readonly facilityScope = computed(() => {
    const u = this.session.user();
    if (!u) {
      return '';
    }
    if (u.allFacilities) {
      return 'All facilities';
    }
    const n = u.facilityIds.length;
    return n === 0 ? 'No facilities' : `${n} ${n === 1 ? 'facility' : 'facilities'} (IDs ${u.facilityIds.join(', ')})`;
  });
}
