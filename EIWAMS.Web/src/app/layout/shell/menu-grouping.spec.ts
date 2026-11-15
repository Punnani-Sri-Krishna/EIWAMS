import { MenuItem } from '../../core/models/api.models';
import { groupMenu } from './menu-grouping';

const item = (menuId: number, section: string, sectionOrder: number, sortOrder: number, label = `Item ${menuId}`): MenuItem => ({
  menuId,
  section,
  sectionOrder,
  label,
  icon: 'circle',
  route: `/r${menuId}`,
  sortOrder,
});

describe('groupMenu', () => {
  it('groups by section ordered by sectionOrder then items by sortOrder', () => {
    const result = groupMenu([
      item(1, 'Security', 3, 2),
      item(2, 'Home', 1, 1),
      item(3, 'Security', 3, 1),
      item(4, 'People', 2, 1),
    ]);

    expect(result.map((s) => s.section)).toEqual(['Home', 'People', 'Security']);
    expect(result[2].items.map((i) => i.menuId)).toEqual([3, 1]);
  });

  it('returns an empty list for null or empty input', () => {
    expect(groupMenu(null)).toEqual([]);
    expect(groupMenu([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [item(1, 'A', 1, 2), item(2, 'A', 1, 1)];
    groupMenu(input);
    expect(input.map((i) => i.menuId)).toEqual([1, 2]);
  });
});
