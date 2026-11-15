import type { ChartConfiguration } from 'chart.js';

import { DashboardSummary, EventsTrendPoint, KpiTile, LabelCount } from './dashboard.models';

export const PALETTE = {
  primary: '#0B3C5D',
  teal: '#0FA3B1',
  cyan: '#3DDCF2',
  violet: '#5B5BD6',
  success: '#1B998B',
  warning: '#F2A541',
  danger: '#D7263D',
} as const;

export const SERIES_COLOURS: readonly string[] = [
  PALETTE.primary,
  PALETTE.teal,
  PALETTE.violet,
  PALETTE.warning,
  PALETTE.success,
  PALETTE.cyan,
  PALETTE.danger,
];

/** Picks a palette colour for index `i`, cycling when there are more points than colours. */
export function seriesColour(i: number): string {
  return SERIES_COLOURS[((i % SERIES_COLOURS.length) + SERIES_COLOURS.length) % SERIES_COLOURS.length];
}

/** Formats an ISO date (yyyy-MM-dd) as a short day label such as "15 Nov". */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) {
    return iso;
  }
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

export function eventsTrendChart(points: readonly EventsTrendPoint[]): ChartConfiguration<'line'> {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const line = (label: string, colour: string, data: number[]) => ({
    label,
    data,
    borderColor: colour,
    backgroundColor: colour + '33',
    tension: 0.3,
    fill: false,
    pointRadius: 2,
  });
  return {
    type: 'line',
    data: {
      labels: sorted.map((p) => shortDate(p.date)),
      datasets: [
        line('Entries', PALETTE.teal, sorted.map((p) => p.entries)),
        line('Exits', PALETTE.violet, sorted.map((p) => p.exits)),
        line('Denied', PALETTE.danger, sorted.map((p) => p.denied)),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  };
}

export function labelCountDoughnut(items: readonly LabelCount[]): ChartConfiguration<'doughnut'> {
  const rows = items.filter((i) => i.count > 0);
  return {
    type: 'doughnut',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{ data: rows.map((r) => r.count), backgroundColor: rows.map((_, i) => seriesColour(i)), borderWidth: 1 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  };
}

export function labelCountBar(items: readonly LabelCount[], label: string): ChartConfiguration<'bar'> {
  const rows = [...items].sort((a, b) => b.count - a.count);
  return {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{ label, data: rows.map((r) => r.count), backgroundColor: rows.map((_, i) => seriesColour(i)), borderRadius: 4 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  };
}

export function hasData(items: readonly (LabelCount | EventsTrendPoint)[]): boolean {
  return items.some((i) => ('count' in i ? i.count > 0 : i.entries + i.exits + i.denied > 0));
}

export function kpiTiles(s: DashboardSummary): KpiTile[] {
  const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('en-US');
  const tiles: KpiTile[] = [
    { label: 'Active employees', value: n(s.activeEmployees), icon: 'badge', tone: 'primary' },
    { label: 'Active cards', value: n(s.activeCards), icon: 'credit_card', tone: 'teal', hint: `${n(s.blockedCards)} blocked` },
    { label: 'Pending access requests', value: n(s.pendingAccessRequests), icon: 'pending_actions', tone: 'warning' },
    { label: 'My pending approvals', value: n(s.myPendingApprovals), icon: 'task_alt', tone: 'violet' },
    {
      label: 'Active permissions',
      value: n(s.activePermissions),
      icon: 'verified_user',
      tone: 'success',
      hint: `${n(s.permissionsExpiring7d)} expiring in 7 days`,
    },
    { label: 'Access events today', value: n(s.eventsToday), icon: 'sensors', tone: 'teal', hint: `${n(s.deniedToday)} denied` },
    { label: 'Open violations', value: n(s.openViolations), icon: 'gpp_maybe', tone: 'danger' },
    { label: 'Open incidents', value: n(s.openIncidents), icon: 'report', tone: 'danger' },
    { label: 'Visitors on site', value: n(s.visitorsOnSite), icon: 'groups', tone: 'primary' },
  ];
  if (s.avgApprovalTurnaroundHours !== null && s.avgApprovalTurnaroundHours !== undefined) {
    tiles.push({
      label: 'Avg approval turnaround',
      value: `${Number(s.avgApprovalTurnaroundHours).toFixed(1)} h`,
      icon: 'timer',
      tone: 'violet',
    });
  }
  return tiles;
}
