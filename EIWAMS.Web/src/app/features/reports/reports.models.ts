import { ApiError, Lookups, QueryParams } from '../../core/models/api.models';

/** Mirrors EIWAMS.Application ReportResult (GET v1/reports/{reportName}). */
export interface ReportResult {
  columns: string[];
  rows: unknown[][];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ReportDefinition {
  name: string;
  label: string;
  description: string;
  dateLabel: string;
  statusLabel: string;
  /** Options for the `status` filter; null means free text. */
  statusOptions: ((l: Lookups | null) => string[]) | null;
  orgFilters: boolean;
}

export interface ReportFilterValue {
  from: Date | null;
  to: Date | null;
  departmentId: number | null;
  locationId: number | null;
  status: string | null;
}

/** API cap for CSV exports (HttpConstants.MaxExportRows). */
export const REPORT_EXPORT_ROW_CAP = 50000;

/** Report names exposed by the API (ReportNames.ProcedureByName). */
export const REPORTS: ReportDefinition[] = [
  { name: 'employee-register', label: 'Employee register', description: 'Employees with department, location and employment status.', dateLabel: 'Joined', statusLabel: 'Employment status', statusOptions: (l) => l?.employmentStatuses ?? [], orgFilters: true },
  { name: 'card-lifecycle', label: 'Card lifecycle', description: 'Issued cards with status changes and expiry.', dateLabel: 'Issued', statusLabel: 'Card status', statusOptions: (l) => l?.cardStatuses ?? [], orgFilters: true },
  { name: 'access-permissions', label: 'Access permissions', description: 'Who can access which location, and until when.', dateLabel: 'Valid', statusLabel: 'Permission status', statusOptions: (l) => l?.permissionStatuses ?? [], orgFilters: true },
  { name: 'access-activity', label: 'Access activity', description: 'RFID access events with decision and denial reason.', dateLabel: 'Event', statusLabel: 'Decision', statusOptions: () => ['Granted', 'Denied'], orgFilters: true },
  { name: 'request-aging', label: 'Request aging', description: 'Access requests and how long they have been waiting.', dateLabel: 'Created', statusLabel: 'Request status', statusOptions: (l) => l?.accessRequestStatuses ?? [], orgFilters: true },
  { name: 'violations-incidents', label: 'Violations & incidents', description: 'Violations with review outcome and linked incidents.', dateLabel: 'Detected', statusLabel: 'Status', statusOptions: (l) => l?.violationStatuses ?? [], orgFilters: true },
  { name: 'audit-compliance', label: 'Audit compliance', description: 'Audit trail of sensitive actions for compliance review.', dateLabel: 'Occurred', statusLabel: 'Status / entity', statusOptions: null, orgFilters: false },
];

export function findReport(name: string | null | undefined): ReportDefinition {
  return REPORTS.find((r) => r.name === name) ?? REPORTS[0];
}

/** Drops null/undefined/blank values so they are not sent as query params. */
export function cleanParams(params: QueryParams): QueryParams {
  const out: QueryParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

export function startOfDayIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export function endOfDayIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

/** Builds the ReportQuery params shared by preview and CSV export (export ignores paging). */
export function buildReportParams(def: ReportDefinition, f: ReportFilterValue, paging?: { page: number; pageSize: number }): QueryParams {
  return cleanParams({
    from: startOfDayIso(f.from),
    to: endOfDayIso(f.to),
    departmentId: def.orgFilters ? f.departmentId : null,
    locationId: def.orgFilters ? f.locationId : null,
    status: f.status,
    page: paging?.page,
    pageSize: paging?.pageSize,
  });
}

/** "employeeNumber" / "EmployeeNumber" / "employee_number" -> "Employee number". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\bUtc\b/g, '(UTC)')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

export function formatReportCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '\u2014';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string' && ISO_DATE_TIME.test(value)) {
    const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
    return isNaN(d.getTime()) ? value : d.toLocaleString();
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** Picks the first categorical column suitable for a summary chart. */
export function summaryColumnIndex(columns: string[]): number {
  const preferred = [/status$/i, /decision|outcome|result/i, /severity/i, /type$/i, /department|location/i];
  for (const re of preferred) {
    const i = columns.findIndex((c) => re.test(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** Counts rows by value of the given column (top N, rest grouped as "Other"). */
export function countBy(rows: unknown[][], index: number, top = 8): { label: string; count: number }[] {
  if (index < 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const raw = row[index];
    const key = raw === null || raw === undefined || raw === '' ? '(blank)' : String(raw);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  if (sorted.length <= top) return sorted;
  const other = sorted.slice(top - 1).reduce((s, x) => s + x.count, 0);
  return [...sorted.slice(0, top - 1), { label: 'Other', count: other }];
}

export function asApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as Partial<ApiError>;
    return { status: e.status ?? 0, message: e.message ?? 'Something went wrong.', errors: e.errors ?? [], correlationId: e.correlationId ?? null };
  }
  return { status: 0, message: 'Something went wrong. Please try again.', errors: [], correlationId: null };
}
