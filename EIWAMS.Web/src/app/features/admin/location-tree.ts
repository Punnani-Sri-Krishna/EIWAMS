import { Location } from './admin.models';

export interface LocationRow extends Location {
  depth: number;
  hasChildren: boolean;
}

const TYPE_ORDER: Record<string, number> = { Campus: 0, Building: 1, Floor: 2, Zone: 3 };

/**
 * Flattens locations into depth-first order (campus → building → floor → zone) for an indented table.
 * Orphans (parent missing from the list) are treated as roots; cycles are broken.
 */
export function buildLocationTree(locations: readonly Location[]): LocationRow[] {
  const ids = new Set(locations.map((l) => l.locationId));
  const children = new Map<number | null, Location[]>();
  for (const loc of locations) {
    const parent = loc.parentLocationId != null && ids.has(loc.parentLocationId) ? loc.parentLocationId : null;
    const list = children.get(parent) ?? [];
    list.push(loc);
    children.set(parent, list);
  }
  const compare = (a: Location, b: Location) =>
    (TYPE_ORDER[a.locationType] ?? 9) - (TYPE_ORDER[b.locationType] ?? 9) ||
    a.locationName.localeCompare(b.locationName);

  const rows: LocationRow[] = [];
  const visited = new Set<number>();
  const walk = (parent: number | null, depth: number) => {
    for (const loc of [...(children.get(parent) ?? [])].sort(compare)) {
      if (visited.has(loc.locationId)) {
        continue;
      }
      visited.add(loc.locationId);
      rows.push({ ...loc, depth, hasChildren: (children.get(loc.locationId)?.length ?? 0) > 0 });
      walk(loc.locationId, depth + 1);
    }
  };
  walk(null, 0);
  // Anything unvisited is part of a cycle; surface it at the root so it is still editable.
  for (const loc of locations) {
    if (!visited.has(loc.locationId)) {
      visited.add(loc.locationId);
      rows.push({ ...loc, depth: 0, hasChildren: false });
    }
  }
  return rows;
}

/** Ids of a location and all its descendants (a location cannot be re-parented under these). */
export function descendantIds(locations: readonly Location[], rootId: number): Set<number> {
  const result = new Set<number>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const loc of locations) {
      if (loc.parentLocationId != null && result.has(loc.parentLocationId) && !result.has(loc.locationId)) {
        result.add(loc.locationId);
        added = true;
      }
    }
  }
  return result;
}

/** Hides rows whose ancestor is collapsed. */
export function visibleRows(rows: readonly LocationRow[], collapsed: ReadonlySet<number>): LocationRow[] {
  const result: LocationRow[] = [];
  let hideBelow: number | null = null;
  for (const row of rows) {
    if (hideBelow != null) {
      if (row.depth > hideBelow) {
        continue;
      }
      hideBelow = null;
    }
    result.push(row);
    if (collapsed.has(row.locationId)) {
      hideBelow = row.depth;
    }
  }
  return result;
}
