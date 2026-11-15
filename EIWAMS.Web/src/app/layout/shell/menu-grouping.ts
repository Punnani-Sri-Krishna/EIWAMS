import { MenuItem } from '../../core/models/api.models';

export interface MenuSection {
  section: string;
  sectionOrder: number;
  items: MenuItem[];
}

/** Groups menu items by section, ordering sections by sectionOrder and items by sortOrder. */
export function groupMenu(items: readonly MenuItem[] | null | undefined): MenuSection[] {
  const map = new Map<string, MenuSection>();
  for (const item of items ?? []) {
    let group = map.get(item.section);
    if (!group) {
      group = { section: item.section, sectionOrder: item.sectionOrder, items: [] };
      map.set(item.section, group);
    }
    group.sectionOrder = Math.min(group.sectionOrder, item.sectionOrder);
    group.items.push(item);
  }
  const sections = [...map.values()];
  for (const s of sections) {
    s.items.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  }
  return sections.sort((a, b) => a.sectionOrder - b.sectionOrder || a.section.localeCompare(b.section));
}
