/** Mirrors EIWAMS.Application AuditLogDto (GET v1/audit-logs, v1/audit-logs/timeline). */
export interface AuditLog {
  auditLogId: number;
  actorUserId: number | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  beforeJson: string | null;
  afterJson: string | null;
  reason: string | null;
  occurredAtUtc: string;
  correlationId: string | null;
  ipAddress: string | null;
}

export interface AuditDiffRow {
  path: string;
  before: string;
  after: string;
  kind: 'added' | 'removed' | 'changed' | 'same';
}

export function parseJson(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function prettyJson(raw: string | null | undefined): string {
  const v = parseJson(raw);
  if (v === undefined) return '';
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

/** Flattens nested objects/arrays into dotted paths (arrays use [i]). */
export function flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((v, i) => [`[${i}]`, v] as const) : Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v] as const);
    if (entries.length === 0 && prefix) out[prefix] = value;
    for (const [k, v] of entries) {
      const path = k.startsWith('[') ? `${prefix}${k}` : prefix ? `${prefix}.${k}` : k;
      flatten(v, path, out);
    }
  } else if (value !== undefined) {
    out[prefix || '(value)'] = value;
  }
  return out;
}

function show(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

/** Field-level diff of the before/after JSON snapshots stored on an audit row. */
export function diffAudit(beforeJson: string | null | undefined, afterJson: string | null | undefined): AuditDiffRow[] {
  const before = flatten(parseJson(beforeJson));
  const after = flatten(parseJson(afterJson));
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.map((path) => {
    const inBefore = path in before;
    const inAfter = path in after;
    const b = show(before[path]);
    const a = show(after[path]);
    const kind: AuditDiffRow['kind'] = !inBefore ? 'added' : !inAfter ? 'removed' : b === a ? 'same' : 'changed';
    return { path, before: inBefore ? b : '', after: inAfter ? a : '', kind };
  });
}

/** Audit action -> chip tone (falls back to neutral). */
export function actionTone(action: string | null | undefined): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  const a = (action ?? '').toLowerCase();
  if (/delete|revoke|reject|block|deactivat|deny|lost|fail/.test(a)) return 'danger';
  if (/create|approve|issue|grant|activate|provision/.test(a)) return 'success';
  if (/update|edit|change|return|suspend|replace/.test(a)) return 'warning';
  if (/login|view|export|sync|submit/.test(a)) return 'info';
  return 'neutral';
}

/** Interprets API timestamps without an offset as UTC. */
export function utcDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
  return isNaN(d.getTime()) ? null : d;
}
