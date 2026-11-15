import { RolePermission } from './admin.models';

export interface PermissionGroup {
  module: string;
  permissions: RolePermission[];
}

export function groupPermissions(permissions: readonly RolePermission[]): PermissionGroup[] {
  const map = new Map<string, RolePermission[]>();
  for (const p of permissions) {
    const key = p.module || 'General';
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([module, list]) => ({ module, permissions: [...list].sort((a, b) => a.code.localeCompare(b.code)) }));
}

export type SettingKind = 'bool' | 'int' | 'decimal' | 'text';

export function settingKind(dataType: string | null | undefined): SettingKind {
  const t = (dataType ?? '').toLowerCase();
  if (t === 'bool' || t === 'boolean' || t === 'bit') {
    return 'bool';
  }
  if (t === 'int' || t === 'integer' || t === 'long' || t === 'number') {
    return 'int';
  }
  if (t === 'decimal' || t === 'double' || t === 'float') {
    return 'decimal';
  }
  return 'text';
}
