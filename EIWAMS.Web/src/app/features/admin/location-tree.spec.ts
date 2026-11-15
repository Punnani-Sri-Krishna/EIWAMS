import { describe, expect, it } from 'vitest';

import { Location } from './admin.models';
import { buildLocationTree, descendantIds, visibleRows } from './location-tree';

function loc(id: number, parent: number | null, type: string, name: string): Location {
  return {
    locationId: id,
    parentLocationId: parent,
    parentLocationName: null,
    locationCode: `L${id}`,
    locationName: name,
    locationType: type,
    isRestricted: false,
    isActive: true,
    timeZone: null,
    path: null,
    readerCount: 0,
  };
}

const data = [
  loc(4, 2, 'Floor', 'Ground'),
  loc(2, 1, 'Building', 'B-Tower'),
  loc(3, 1, 'Building', 'A-Tower'),
  loc(1, null, 'Campus', 'Main'),
  loc(5, 4, 'Zone', 'Lab'),
  loc(6, 99, 'Building', 'Orphan'),
];

describe('buildLocationTree', () => {
  it('orders depth-first with depth and sorted siblings, treating orphans as roots', () => {
    const rows = buildLocationTree(data);
    expect(rows.map((r) => [r.locationId, r.depth])).toEqual([
      [1, 0],
      [3, 1],
      [2, 1],
      [4, 2],
      [5, 3],
      [6, 0],
    ]);
    expect(rows.find((r) => r.locationId === 2)?.hasChildren).toBe(true);
    expect(rows.find((r) => r.locationId === 3)?.hasChildren).toBe(false);
  });

  it('includes cyclic entries instead of dropping them', () => {
    const rows = buildLocationTree([loc(1, 2, 'Zone', 'x'), loc(2, 1, 'Zone', 'y')]);
    expect(rows.map((r) => r.locationId).sort()).toEqual([1, 2]);
  });
});

describe('descendantIds / visibleRows', () => {
  it('collects all descendants of a node', () => {
    expect([...descendantIds(data, 2)].sort()).toEqual([2, 4, 5]);
  });

  it('hides rows under collapsed nodes', () => {
    const rows = buildLocationTree(data);
    expect(visibleRows(rows, new Set([2])).map((r) => r.locationId)).toEqual([1, 3, 2, 6]);
  });
});
