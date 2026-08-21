import { PagedListState } from './paged-list-state';

describe('PagedListState', () => {
  it('starts on page 1 with zero total', () => {
    const s = new PagedListState(10);
    expect(s.page).toBe(1);
    expect(s.total).toBe(0);
    expect(s.pageSize).toBe(10);
  });

  describe('totalPages', () => {
    it('is 1 when total is 0 (never fewer than 1 page)', () => {
      const s = new PagedListState(10);
      expect(s.totalPages).toBe(1);
    });

    it('rounds up for a partial last page', () => {
      const s = new PagedListState(10);
      s.total = 25;
      expect(s.totalPages).toBe(3);
    });

    it('does not add an extra page for an exact multiple', () => {
      const s = new PagedListState(10);
      s.total = 20;
      expect(s.totalPages).toBe(2);
    });
  });

  describe('reset', () => {
    it('returns page and total to their defaults', () => {
      const s = new PagedListState(10);
      s.page = 4;
      s.total = 37;
      s.reset();
      expect(s.page).toBe(1);
      expect(s.total).toBe(0);
    });
  });

  describe('prevTarget', () => {
    it('returns null on page 1', () => {
      const s = new PagedListState(10);
      expect(s.prevTarget()).toBeNull();
    });

    it('returns page - 1 when not on page 1', () => {
      const s = new PagedListState(10);
      s.page = 3;
      expect(s.prevTarget()).toBe(2);
    });
  });

  describe('nextTarget', () => {
    it('returns null on the last page', () => {
      const s = new PagedListState(10);
      s.page = 3;
      s.total = 25; // totalPages = 3
      expect(s.nextTarget()).toBeNull();
    });

    it('returns page + 1 when not on the last page', () => {
      const s = new PagedListState(10);
      s.page = 1;
      s.total = 25; // totalPages = 3
      expect(s.nextTarget()).toBe(2);
    });

    it('returns null when total is 0 and page is already 1 (single-page state)', () => {
      const s = new PagedListState(10);
      expect(s.nextTarget()).toBeNull();
    });
  });
});
