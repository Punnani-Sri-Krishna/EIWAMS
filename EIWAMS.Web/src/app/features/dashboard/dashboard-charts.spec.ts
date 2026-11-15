import { describe, expect, it } from 'vitest';

import {
  PALETTE,
  eventsTrendChart,
  hasData,
  kpiTiles,
  labelCountBar,
  labelCountDoughnut,
  seriesColour,
  shortDate,
} from './dashboard-charts';
import { DashboardSummary } from './dashboard.models';

const summary = (over: Partial<DashboardSummary> = {}): DashboardSummary => ({
  activeEmployees: 1200,
  activeCards: 1100,
  blockedCards: 4,
  pendingAccessRequests: 7,
  myPendingApprovals: 2,
  activePermissions: 900,
  permissionsExpiring7d: 3,
  eventsToday: 450,
  deniedToday: 12,
  openViolations: 5,
  openIncidents: 1,
  visitorsOnSite: 9,
  avgApprovalTurnaroundHours: null,
  ...over,
});

describe('dashboard-charts', () => {
  it('sorts the events trend by date and maps three series', () => {
    const cfg = eventsTrendChart([
      { date: '2026-11-15', entries: 5, exits: 4, denied: 1 },
      { date: '2026-11-14', entries: 2, exits: 1, denied: 0 },
    ]);
    expect(cfg.data.labels).toEqual(['14 Nov', '15 Nov']);
    expect(cfg.data.datasets.map((d) => d.label)).toEqual(['Entries', 'Exits', 'Denied']);
    expect(cfg.data.datasets[0].data).toEqual([2, 5]);
    expect(cfg.data.datasets[2].borderColor).toBe(PALETTE.danger);
  });

  it('drops zero slices from doughnut charts', () => {
    const cfg = labelCountDoughnut([
      { label: 'Approved', count: 3 },
      { label: 'Rejected', count: 0 },
    ]);
    expect(cfg.data.labels).toEqual(['Approved']);
    expect(cfg.data.datasets[0].data).toEqual([3]);
  });

  it('orders bar chart rows by descending count', () => {
    const cfg = labelCountBar(
      [
        { label: 'A', count: 1 },
        { label: 'B', count: 4 },
      ],
      'Violations',
    );
    expect(cfg.data.labels).toEqual(['B', 'A']);
    expect(cfg.options?.indexAxis).toBe('y');
  });

  it('cycles the palette', () => {
    expect(seriesColour(0)).toBe(PALETTE.primary);
    expect(seriesColour(7)).toBe(PALETTE.primary);
  });

  it('detects empty data', () => {
    expect(hasData([])).toBe(false);
    expect(hasData([{ label: 'x', count: 0 }])).toBe(false);
    expect(hasData([{ date: '2026-01-01', entries: 0, exits: 0, denied: 1 }])).toBe(true);
  });

  it('formats short dates and tolerates bad input', () => {
    expect(shortDate('2026-01-05T00:00:00')).toBe('05 Jan');
    expect(shortDate('bad')).toBe('bad');
  });

  it('builds KPI tiles and adds turnaround only when present', () => {
    expect(kpiTiles(summary()).some((t) => t.label === 'Avg approval turnaround')).toBe(false);
    const tiles = kpiTiles(summary({ avgApprovalTurnaroundHours: 5.25 }));
    expect(tiles.find((t) => t.label === 'Avg approval turnaround')?.value).toBe('5.3 h');
    expect(tiles.find((t) => t.label === 'Active employees')?.value).toBe('1,200');
    expect(tiles.find((t) => t.label === 'Access events today')?.hint).toBe('12 denied');
  });
});
