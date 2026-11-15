export interface PermissionGroup {
  module: string;
  permissions: string[];
}

/** Groups permission codes such as `Cards.Issue` by their module prefix; actions are sorted. */
export function groupByModule(codes: readonly string[]): PermissionGroup[] {
  const groups = new Map<string, Set<string>>();
  for (const code of codes) {
    const dot = code.indexOf('.');
    const module = dot > 0 ? code.slice(0, dot) : 'General';
    const action = dot > 0 ? code.slice(dot + 1) : code;
    if (!groups.has(module)) {
      groups.set(module, new Set());
    }
    groups.get(module)!.add(action);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, actions]) => ({ module, permissions: [...actions].sort((a, b) => a.localeCompare(b)) }));
}
