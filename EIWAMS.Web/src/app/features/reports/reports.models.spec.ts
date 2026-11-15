import { REPORTS, buildReportParams, countBy, findReport, summaryColumnIndex } from './reports.models';

describe('report helpers', () => {
  const base = { from: null, to: null, departmentId: 3, locationId: 7, status: '  Active ' };

  it('builds export params without paging and drops blanks', () => {
    const p = buildReportParams(findReport('employee-register'), { ...base, from: new Date(2026, 0, 5), status: ' ' });
    expect(p['departmentId']).toBe(3);
    expect(p['locationId']).toBe(7);
    expect(p['from']).toBe(new Date(2026, 0, 5, 0, 0, 0, 0).toISOString());
    expect('to' in p).toBe(false);
    expect('status' in p).toBe(false);
    expect('page' in p).toBe(false);
  });

  it('omits org filters for reports without them and includes paging for preview', () => {
    const p = buildReportParams(findReport('audit-compliance'), base, { page: 2, pageSize: 50 });
    expect(p).toEqual({ status: 'Active', page: 2, pageSize: 50 });
  });

  it('falls back to the first report for unknown names', () => {
    expect(findReport('nope')).toBe(REPORTS[0]);
  });

  it('picks a status column and counts rows for the chart', () => {
    const cols = ['employeeNumber', 'departmentName', 'cardStatus'];
    const i = summaryColumnIndex(cols);
    expect(i).toBe(2);
    expect(countBy([['1', 'A', 'Active'], ['2', 'A', 'Lost'], ['3', 'B', 'Active'], ['4', 'B', null]], i)).toEqual([
      { label: 'Active', count: 2 },
      { label: 'Lost', count: 1 },
      { label: '(blank)', count: 1 },
    ]);
  });
});
