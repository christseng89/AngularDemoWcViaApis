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
    expect(component.columnHeaders).toEqual([]);
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

  // "Search — No Match Message" rule (business-directed) — a single shared getter, since every
  // A2–A11/B2–B7 picker routes through this one component: an actively-searched empty result reads as
  // "{query} not found", never the caller's generic emptyText (that stays reserved for the
  // genuinely-nothing-to-search-yet case).
  describe('displayedEmptyText', () => {
    it('falls back to emptyText when no query has been typed', () => {
      component.searchable = true;
      component.searchValue = '';
      component.emptyText = 'Nothing to pick.';
      expect(component.displayedEmptyText).toBe('Nothing to pick.');
    });

    it('reads "{query} not found" once a query is typed, trimmed', () => {
      component.searchable = true;
      component.searchValue = '  AAA  ';
      expect(component.displayedEmptyText).toBe('AAA not found');
    });

    it('falls back to emptyText for a non-searchable picker even if searchValue happens to be set', () => {
      component.searchable = false;
      component.searchValue = 'AAA';
      component.emptyText = 'Nothing to pick.';
      expect(component.displayedEmptyText).toBe('Nothing to pick.');
    });

    it('falls back to emptyText when the query is only whitespace', () => {
      component.searchable = true;
      component.searchValue = '   ';
      component.emptyText = 'Nothing to pick.';
      expect(component.displayedEmptyText).toBe('Nothing to pick.');
    });
  });

  // Stylesheet unification rule (business-directed, "顯示STYLESHEET 應該統一 參考CHECKER")
  describe('isNotFound', () => {
    it('is true once a query is typed on a searchable picker', () => {
      component.searchable = true;
      component.searchValue = 'AAA';
      expect(component.isNotFound).toBe(true);
    });

    it('is false with no query typed', () => {
      component.searchable = true;
      component.searchValue = '';
      expect(component.isNotFound).toBe(false);
    });

    it('is false for a non-searchable picker even if searchValue happens to be set', () => {
      component.searchable = false;
      component.searchValue = 'AAA';
      expect(component.isNotFound).toBe(false);
    });
  });
});
