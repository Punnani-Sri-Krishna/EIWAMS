import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { approvalTabs } from '../../core/navigation/nav';
import { SessionService } from '../../core/services/session.service';
import { WorkCountsService } from '../../core/services/work-counts.service';

/** Approvals: one page with a tab per approval queue the user owns (SIMPLIFY-SPEC §D). */
@Component({
  selector: 'eiw-approvals-hub',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatTabsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .tab-label { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
    .tab-count {
      display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px;
      background: var(--lab-warning); color: var(--lab-ink); font-size: 0.72rem; font-weight: 700; font-variant-numeric: tabular-nums;
    }
    .tab-body { padding-top: 16px; }
    nav { max-width: 100%; }
  `,
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>Approvals</h1>
          <p class="subtitle">Requests waiting for your decision.</p>
        </div>
      </header>

      <nav mat-tab-nav-bar [tabPanel]="panel" mat-stretch-tabs="false" mat-align-tabs="start" aria-label="Approval queues">
        @for (t of tabs(); track t.key) {
          <a mat-tab-link [routerLink]="t.route" routerLinkActive #rla="routerLinkActive" [active]="rla.isActive">
            <span class="tab-label">
              <mat-icon aria-hidden="true">{{ t.icon }}</mat-icon>{{ t.label }}
              @if (t.count && counts()[t.count]; as n) {
                <span class="tab-count" [attr.aria-label]="n + ' pending'">{{ n }}</span>
              }
            </span>
          </a>
        }
      </nav>
      <mat-tab-nav-panel #panel>
        <div class="tab-body"><router-outlet /></div>
      </mat-tab-nav-panel>
    </section>
  `,
})
export class ApprovalsHubComponent implements OnInit {
  private readonly session = inject(SessionService);
  private readonly work = inject(WorkCountsService);
  readonly counts = this.work.counts;
  readonly tabs = computed(() => {
    const u = this.session.user();
    return approvalTabs({ has: (p) => this.session.hasPermission(p), roles: u?.roles ?? [] });
  });

  ngOnInit(): void {
    this.work.refresh();
  }
}
