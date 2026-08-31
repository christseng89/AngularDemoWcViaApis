import { TbIconComponent, TbIconName } from './tb-icon.component';

describe('TbIconComponent', () => {
  it('accepts every documented TbIconName without narrowing', () => {
    const component = new TbIconComponent();
    const names: TbIconName[] = ['issue', 'amend', 'utilize', 'redeem', 'checker', 'lookup', 'ok', 'pending', 'cross', 'dash', 'sun', 'moon', 'system'];
    for (const name of names) {
      component.name = name;
      expect(component.name).toBe(name);
    }
  });
});
