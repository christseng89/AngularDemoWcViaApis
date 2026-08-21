import { IndexPickerComponent } from './index-picker.component';

describe('IndexPickerComponent', () => {
  let component: IndexPickerComponent;

  beforeEach(() => {
    component = new IndexPickerComponent();
  });

  it('has the documented @Input defaults', () => {
    expect(component.label).toBe('');
    expect(component.items).toEqual([]);
    expect(component.loading).toBe(false);
    expect(component.selectedId).toBeNull();
    expect(component.emptyText).toBe('Nothing to pick.');
    expect(component.autoPickedHint).toBeNull();
    expect(component.searchable).toBe(false);
    expect(component.searchValue).toBe('');
    expect(component.searchPlaceholder).toBe('Search…');
    expect(component.page).toBe(1);
    expect(component.totalPages).toBe(1);
    expect(component.total).toBe(0);
  });

  it('exposes searchValueChange/search/prevPage/nextPage/pick as EventEmitters', () => {
    expect(component.searchValueChange.emit).toBeInstanceOf(Function);
    expect(component.search.emit).toBeInstanceOf(Function);
    expect(component.prevPage.emit).toBeInstanceOf(Function);
    expect(component.nextPage.emit).toBeInstanceOf(Function);
    expect(component.pick.emit).toBeInstanceOf(Function);
  });

  describe('itemId() — bug fix 2026-08-15: movementId must be checked BEFORE balanceContractId', () => {
    it('returns movementId when only movementId is present (a BalanceMovement)', () => {
      expect(component.itemId({ movementId: 'MV-1' })).toBe('MV-1');
    });

    it('returns balanceContractId when only balanceContractId is present (a BalanceContract)', () => {
      expect(component.itemId({ balanceContractId: 'BC-1' })).toBe('BC-1');
    });

    it('returns movementId — NOT balanceContractId — when a row carries BOTH (the documented regression case)', () => {
      // A BalanceMovement also carries its own parent balanceContractId as an ordinary field.
      // Checking balanceContractId first was the reported bug — a movement row's own id resolved
      // to the parent contract's id, so the selection handlers never found a match.
      const row = { movementId: 'MV-1', balanceContractId: 'BC-1' };
      expect(component.itemId(row)).toBe('MV-1');
      expect(component.itemId(row)).not.toBe('BC-1');
    });

    it('returns empty string when neither id field is present', () => {
      expect(component.itemId({})).toBe('');
    });

    it('returns empty string for a completely unrelated object shape', () => {
      expect(component.itemId({ foo: 'bar' })).toBe('');
    });
  });
});
