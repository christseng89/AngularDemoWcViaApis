import { of, throwError } from 'rxjs';
import { MakerQueueService } from './maker-queue.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, MyMovementsPage } from './balance-component-api.service';

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'S001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    exposureNature: 'CONTINGENT',
    amount: '50000',
    ceilingAmount: '50000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function makePage(overrides: Partial<MyMovementsPage> = {}): MyMovementsPage {
  return { items: [], ...overrides };
}

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    listMyMovements: overrides.listMyMovements ?? jest.fn(() => of(makePage())),
    cancel: overrides.cancel ?? jest.fn(() => of(makeMovement({ status: 'CANCELLED' }))),
    withdrawMakerSubmit: overrides.withdrawMakerSubmit ?? jest.fn(() => of(makeMovement({ makerSubmittedAt: null }))),
  } as unknown as BalanceComponentApiService;
}

describe('MakerQueueService', () => {
  describe('load', () => {
    it('does nothing when createdBy is blank', () => {
      const api = makeApi();
      const svc = new MakerQueueService(api);
      svc.createdBy = '';
      svc.load();
      expect(api.listMyMovements).not.toHaveBeenCalled();
    });

    it('defaults to PENDING+REJECTED for the current createdBy and populates items/paging on success', () => {
      const row = { movement: makeMovement(), contract: makeContract() };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [row] }))) });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';

      svc.load();

      expect(api.listMyMovements).toHaveBeenCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], q: undefined });
      expect(svc.items).toEqual([row]);
      expect(svc.paging.total).toBe(1);
      expect(svc.loading).toBe(false);
    });

    it('on error, sets a describable error and clears items/total', () => {
      const api = makeApi({ listMyMovements: jest.fn(() => throwError(() => ({ error: { message: 'boom' } }))) });
      const svc = new MakerQueueService(api);
      svc.items = [{ movement: makeMovement(), contract: makeContract() }];

      svc.load();

      expect(svc.loading).toBe(false);
      expect(svc.error).toBe('boom');
      expect(svc.errorCause).toEqual({ error: { message: 'boom' } });
      expect(svc.items).toEqual([]);
      expect(svc.paging.total).toBe(0);
    });

    it('clears the original error cause before a retry', () => {
      const listMyMovements = jest.fn().mockReturnValueOnce(throwError(() => ({ status: 0, message: 'network' }))).mockReturnValueOnce(of(makePage()));
      const svc = new MakerQueueService(makeApi({ listMyMovements }));

      svc.load();
      expect(svc.errorCause).not.toBeNull();
      svc.load();
      expect(svc.error).toBeNull();
      expect(svc.errorCause).toBeNull();
    });

    // User-directed 2026-08-28 ("Maker Queue 提供 LC Number Search 功能", "支援 LIKE / Partial Match")
    it('passes lcNumberSearch through as the q filter when set', () => {
      const api = makeApi();
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      svc.lcNumberSearch = 'S001';

      svc.load();

      expect(api.listMyMovements).toHaveBeenCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], q: 'S001' });
    });

    it('omits the q filter (undefined) when lcNumberSearch is blank', () => {
      const api = makeApi();
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      svc.lcNumberSearch = '';

      svc.load();

      const call = (api.listMyMovements as jest.Mock).mock.calls[0][0];
      expect(call.q).toBeUndefined();
    });

    // User-directed 2026-08-28 — load() no longer takes/sends page/pageSize at all; pagination is a
    // purely client-side window over the fully-loaded `items` array (see paging/pagedItems below). Uses
    // 25 rows (3 pages at the default pageSize 10) so page 3 is genuinely still in range — an empty/small
    // result set would clamp page back to 1 regardless of resetToFirstPage, confounding this assertion.
    it('resets to page 1 by default; a caller passing resetToFirstPage=false preserves the current page', () => {
      const rows = Array.from({ length: 25 }, (_, i) => ({ movement: makeMovement({ movementId: `mv-${i}`, businessEventId: null }), contract: makeContract({ naturalKey: { lcNumber: `LC-${String(i).padStart(3, '0')}` } }) }));
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: rows }))) });
      const svc = new MakerQueueService(api);
      svc.paging.page = 3;

      svc.load();
      expect(svc.paging.page).toBe(1);

      svc.paging.page = 3;
      svc.load(false);
      expect(svc.paging.page).toBe(3);
    });

    it('clamps paging.page back into range if the freshly-loaded set is now smaller than the page the Maker was viewing', () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({ movement: makeMovement({ movementId: `mv-${i}`, businessEventId: null }), contract: makeContract({ naturalKey: { lcNumber: `LC-${i}` } }) }));
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: rows }))) });
      const svc = new MakerQueueService(api);
      svc.paging.page = 5; // simulate a stale page from before a shrink (3 items / pageSize 10 is always page 1's own single page)

      svc.load(false);

      expect(svc.paging.page).toBe(1); // clamped to totalPages, since 3 items / pageSize 10 = 1 page
    });
  });

  describe('paging (client-side windowing, 2026-08-28)', () => {
    function makeRows(n: number) {
      return Array.from({ length: n }, (_, i) => ({
        movement: makeMovement({ movementId: `mv-${i}`, businessEventId: null }),
        contract: makeContract({ naturalKey: { lcNumber: `LC-${String(i).padStart(3, '0')}` } }),
      }));
    }

    it('pagedItems windows the full sorted items array at the configured pageSize', () => {
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: makeRows(25) }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toHaveLength(25);
      expect(svc.pagedItems).toHaveLength(10);
      expect(svc.paging.total).toBe(25);
      expect(svc.paging.totalPages).toBe(3);
    });

    it('nextPage()/prevPage() move the local window WITHOUT re-fetching', () => {
      const listMyMovements = jest.fn(() => of(makePage({ items: makeRows(25) })));
      const api = makeApi({ listMyMovements });
      const svc = new MakerQueueService(api);
      svc.load();
      listMyMovements.mockClear();

      svc.nextPage();
      expect(svc.paging.page).toBe(2);
      expect(svc.pagedItems).toHaveLength(10);

      svc.prevPage();
      expect(svc.paging.page).toBe(1);
      expect(listMyMovements).not.toHaveBeenCalled(); // no re-fetch for either move
    });

    it('prevPage() no-ops on page 1', () => {
      const listMyMovements = jest.fn(() => of(makePage({ items: makeRows(25) })));
      const api = makeApi({ listMyMovements });
      const svc = new MakerQueueService(api);
      svc.load();
      listMyMovements.mockClear();

      svc.prevPage();

      expect(svc.paging.page).toBe(1);
      expect(listMyMovements).not.toHaveBeenCalled();
    });

    it('nextPage() no-ops on the last page', () => {
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: makeRows(5) }))) });
      const svc = new MakerQueueService(api);
      svc.load();

      svc.nextPage();

      expect(svc.paging.page).toBe(1);
    });
  });

  // User-directed 2026-08-28 ("Maker Queue進口 出口 分開 (similar as Inquire Events)") — a purely
  // client-side filter over the already-loaded `items` array (no re-fetch on selectSide()), since every
  // row already resolves a TransactionFunction with its own `side` field.
  describe('side (Import LC／Export Confirmed split, 2026-08-28)', () => {
    const importRow = { movement: makeMovement({ movementId: 'mv-a1', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }) };
    const exportRow = { movement: makeMovement({ movementId: 'mv-b1', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'E001' } }) };

    it('defaults to IMPORT', () => {
      const svc = new MakerQueueService(makeApi());
      expect(svc.side).toBe('IMPORT');
    });

    it('sideFilteredItems returns only the current side\'s own rows', () => {
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [importRow, exportRow] }))) });
      const svc = new MakerQueueService(api);
      svc.load();

      expect(svc.sideFilteredItems.map((r) => r.movement.movementId)).toEqual(['mv-a1']);
      svc.selectSide('EXPORT');
      expect(svc.sideFilteredItems.map((r) => r.movement.movementId)).toEqual(['mv-b1']);
    });

    it('a row whose Function cannot be resolved is invisible on BOTH sides, never guessed onto one', () => {
      const unresolved = { movement: makeMovement({ movementId: 'mv-unresolved', movementType: 'REVERSAL', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [unresolved] }))) });
      const svc = new MakerQueueService(api);
      svc.load();

      expect(svc.sideFilteredItems).toEqual([]);
      svc.selectSide('EXPORT');
      expect(svc.sideFilteredItems).toEqual([]);
    });

    // "Search — No Match Message" rule (business-directed, applies to every Search button)
    describe('emptyStateMessage', () => {
      it('reads "{query} not found" once an LC Number search was typed', () => {
        const svc = new MakerQueueService(makeApi());
        svc.lcNumberSearch = '  AAA  ';
        expect(svc.emptyStateMessage).toBe('AAA not found');
      });

      it('falls back to the generic "Nothing PENDING or REJECTED..." wording when no search was typed', () => {
        const svc = new MakerQueueService(makeApi());
        svc.lcNumberSearch = '';
        expect(svc.emptyStateMessage).toBe('Nothing PENDING or REJECTED under this Maker on the Import LC side right now.');
        svc.side = 'EXPORT';
        expect(svc.emptyStateMessage).toBe('Nothing PENDING or REJECTED under this Maker on the Export Confirmed side right now.');
      });

      it('is unaffected by the createdBy field — that always carries a default actor value, never treated as a search query', () => {
        const svc = new MakerQueueService(makeApi());
        svc.createdBy = 'maker2';
        svc.lcNumberSearch = '';
        expect(svc.emptyStateMessage).toContain('Nothing PENDING or REJECTED');
      });
    });

    // Stylesheet unification rule (business-directed, "顯示STYLESHEET 應該統一 參考CHECKER")
    describe('emptyStateIsError', () => {
      it('is true once an LC Number search was typed', () => {
        const svc = new MakerQueueService(makeApi());
        svc.lcNumberSearch = 'AAA';
        expect(svc.emptyStateIsError).toBe(true);
      });

      it('is false when no search was typed (or only whitespace)', () => {
        const svc = new MakerQueueService(makeApi());
        expect(svc.emptyStateIsError).toBe(false);
        svc.lcNumberSearch = '   ';
        expect(svc.emptyStateIsError).toBe(false);
      });
    });

    it('selectSide() never re-fetches — items is already fully loaded (both sides) by load()', () => {
      const listMyMovements = jest.fn(() => of(makePage({ items: [importRow, exportRow] })));
      const api = makeApi({ listMyMovements });
      const svc = new MakerQueueService(api);
      svc.load();
      listMyMovements.mockClear();

      svc.selectSide('EXPORT');

      expect(listMyMovements).not.toHaveBeenCalled();
    });

    it('selectSide() resets to page 1 (from a non-1 page) and re-derives paging.total for the newly-selected side', () => {
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [importRow, exportRow] }))) });
      const svc = new MakerQueueService(api);
      svc.load();
      expect(svc.paging.total).toBe(1); // IMPORT side: only importRow
      svc.paging.page = 2; // simulate having navigated away from page 1 on the IMPORT side

      svc.selectSide('EXPORT');

      expect(svc.paging.page).toBe(1);
      expect(svc.paging.total).toBe(1); // EXPORT side: only exportRow
    });

    it('load() itself sets paging.total to the CURRENT side\'s own count, not the combined total', () => {
      const rows = [
        importRow,
        { movement: makeMovement({ movementId: 'mv-a2', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S002' } }) },
        exportRow,
      ];
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: rows }))) });
      const svc = new MakerQueueService(api);

      svc.load(); // still IMPORT (default)

      expect(svc.paging.total).toBe(2);
      expect(svc.items).toHaveLength(3); // items itself always holds both sides
    });

    it('pagedItems windows over sideFilteredItems, not the combined items array', () => {
      const importRows = Array.from({ length: 3 }, (_, i) => ({
        movement: makeMovement({ movementId: `mv-a${i}`, movementType: 'ISSUE', businessEventId: null }),
        contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: `S00${i}` } }),
      }));
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [...importRows, exportRow] }))) });
      const svc = new MakerQueueService(api);
      svc.load();

      expect(svc.pagedItems).toHaveLength(3); // 3 IMPORT rows, EXPORT's own row excluded

      svc.selectSide('EXPORT');
      expect(svc.pagedItems.map((r) => r.movement.movementId)).toEqual(['mv-b1']);
    });
  });

  // User-directed 2026-08-28 ("Order by Function ASC → LC Number ASC → Secondary Reference Number ASC")
  describe('load — sort order (Function ASC → LC Number ASC → Secondary Reference Number ASC)', () => {
    it('sorts by Function ASC using registry order, not lexicographic string order (A2 before A10/A11)', () => {
      const a10 = { movement: makeMovement({ movementId: 'mv-a10', movementType: 'CLOSE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'ZZZ' } }) };
      const a2 = { movement: makeMovement({ movementId: 'mv-a2', movementType: 'AMEND_INCREASE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'AAA' } }) };
      const a1 = { movement: makeMovement({ movementId: 'mv-a1', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'MMM' } }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [a10, a2, a1] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items.map((r) => r.movement.movementId)).toEqual(['mv-a1', 'mv-a2', 'mv-a10']);
    });

    it('within the same Function, sorts by LC Number ASC', () => {
      const b = { movement: makeMovement({ movementId: 'mv-b', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'BBB' } }) };
      const a = { movement: makeMovement({ movementId: 'mv-a', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'AAA' } }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [b, a] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items.map((r) => r.movement.movementId)).toEqual(['mv-a', 'mv-b']);
    });

    it('within the same Function and LC Number, sorts by Secondary Reference Number (sourceTransactionRef) ASC', () => {
      const b02 = { movement: makeMovement({ movementId: 'mv-b02', movementType: 'UTILIZE', businessEventId: null, sourceTransactionRef: 'B02' }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }) };
      const b01 = { movement: makeMovement({ movementId: 'mv-b01', movementType: 'UTILIZE', businessEventId: null, sourceTransactionRef: 'B01' }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [b02, b01] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items.map((r) => r.movement.movementId)).toEqual(['mv-b01', 'mv-b02']);
    });

    it('is a stable no-op tiebreaker when both rows have no sourceTransactionRef at all (e.g. A1 ISSUE, which never carries one)', () => {
      const b = { movement: makeMovement({ movementId: 'mv-b', movementType: 'ISSUE', businessEventId: null, sourceTransactionRef: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }) };
      const a = { movement: makeMovement({ movementId: 'mv-a', movementType: 'ISSUE', businessEventId: null, sourceTransactionRef: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [b, a] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toHaveLength(2); // neither throws nor drops a row when both secondary refs are absent
    });

    it('a row whose Function cannot be resolved sorts last, not first', () => {
      const unresolved = { movement: makeMovement({ movementId: 'mv-unresolved', movementType: 'REVERSAL', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'AAA' } }) };
      const a1 = { movement: makeMovement({ movementId: 'mv-a1', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'ZZZ' } }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [unresolved, a1] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items.map((r) => r.movement.movementId)).toEqual(['mv-a1', 'mv-unresolved']);
    });

    it('a search (q set) produces the SAME ordering as the unfiltered default index — both run through the same load() pipeline', () => {
      const b = { movement: makeMovement({ movementId: 'mv-b', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'BBB' } }) };
      const a = { movement: makeMovement({ movementId: 'mv-a', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'AAA' } }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [b, a] }))) });
      const svc = new MakerQueueService(api);

      svc.lcNumberSearch = 'anything';
      svc.load();

      expect(svc.items.map((r) => r.movement.movementId)).toEqual(['mv-a', 'mv-b']);
    });
  });

  describe('functionFor', () => {
    it('resolves the producing TransactionFunction via the Strategy registry', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'ISSUE' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.functionFor(row)?.code).toBe('A1');
    });

    it('returns undefined (never throws) when no function can be resolved for the row', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'REVERSAL' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.functionFor(row)).toBeUndefined();
    });

    // Unified Earmarking display model (lc-balance/CLAUDE.md) — once makerSubmittedAt is set, this
    // queue's own "which screen owns this" question is A4's, not A3's.
    it('resolves to A4 once makerSubmittedAt is set on a Sight IPLC_LC/UTILIZE row', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' }) };
      expect(svc.functionFor(row)?.code).toBe('A4');
    });

    // Business-confirmed 2026-08-27 ("A6 必須... 承接並正式轉換 A3/A3S 的 EARMARKED exposure") — same
    // makerSubmittedAt-driven relabeling, but to A6 for a Usance-tenor row.
    it('resolves to A6 once makerSubmittedAt is set on a Usance IPLC_LC/UTILIZE row', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' }) };
      expect(svc.functionFor(row)?.code).toBe('A6');
    });

    it('still resolves to A3 (first registry match) when acknowledged but not yet makerSubmitted', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.functionFor(row)?.code).toBe('A3');
    });
  });

  describe('displayPhaseFor (unified Earmarking display model)', () => {
    it('returns "finalize" once makerSubmittedAt is set on a Sight IPLC_LC/UTILIZE row (Function has already relabeled to A4)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' }) };
      expect(svc.displayPhaseFor(row)).toBe('finalize');
    });

    it('returns "finalize" once makerSubmittedAt is set on a Usance IPLC_LC/UTILIZE row (Function has already relabeled to A6)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' }) };
      expect(svc.displayPhaseFor(row)).toBe('finalize');
    });

    it('returns null when acknowledged but not yet makerSubmitted (still A3\'s own EARMARKED business)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.displayPhaseFor(row)).toBeNull();
    });

    it('returns null for an instrumentType with no finalizing function (e.g. SHGT)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'ISSUE', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }), contract: makeContract({ instrumentType: 'SHGT' }) };
      expect(svc.displayPhaseFor(row)).toBeNull();
    });
  });

  describe('isCompoundShape', () => {
    // Deliberately keyed off businessEventId, NOT resolveFunctionForMovement() — see isCompoundShape()'s
    // own doc comment for why the Strategy-lookup route is ambiguous for exactly this shape (IPLC_LC/
    // UTILIZE always resolves to plain A3, the first registry match, never A3S).
    it('is false for a plain single-leg movement (no businessEventId)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', businessEventId: null }), contract: makeContract() };
      expect(svc.isCompoundShape(row)).toBe(false);
    });

    it('is true for a compound-submission leg (businessEventId set, e.g. an A3S/B4 leg)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', businessEventId: 'be-1' }), contract: makeContract() };
      expect(svc.isCompoundShape(row)).toBe(true);
    });
  });

  describe('fixPendingSupported (2026-08-28, "Maker Queue Need to provide Fix Pending button as well")', () => {
    it('is true for a plain A1 ISSUE row (fixPendingEnabled, non-compound)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    it('is true for a plain A3 UTILIZE row (fixPendingEnabled, non-compound, not yet makerSubmittedAt)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', businessEventId: null, makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    // Phase 4 (2026-08-28, "使用同樣方式處理A3 A35 A4 & B2") — reverses the former "every compound row
    // excluded" posture specifically for the documentArrivalWithSg (A3S) shape: BalanceService's own
    // applyArrivalWithSgCompoundEdit() now correctly cascades the SG's own matched leg alongside this
    // UTILIZE, so this row is safe to Fix Pending even though its own leg structurally resolves to A3
    // (IPLC_LC/UTILIZE) rather than "A3S" by name.
    it('is TRUE for a documentArrivalWithSg (A3S) compound row — Phase 4 cascade support', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', businessEventId: 'be-1' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    // A genuinely DIFFERENT compound shape (B4's own ACCEPT+CREATE Acceptance pairing, sharing
    // businessEventId the same way A3S's own pair does) stays excluded — Phase 4 only ever scoped/
    // implemented the ONE documentArrivalWithSg cascade, not every compound shape indiscriminately.
    it('is true for a B4 compound row because Remarks-only mode cannot desynchronize monetary legs', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'ACCEPT', businessEventId: 'be-2' }), contract: makeContract({ instrumentType: 'EPLC_CONFIRMATION' }) };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    it('is true once the row has moved on to A4; A4 uses Remarks-only mode on the existing A3 movement', () => {
      const svc = new MakerQueueService(makeApi());
      const row = {
        movement: makeMovement({ movementType: 'UTILIZE', businessEventId: null, acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z' }),
        contract: makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' }),
      };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    // A2 was widened INTO the trial scope 2026-08-28 ("把這A1 A3 修改要求放置B1 A2試試看") — see the
    // now-true case just above this describe block's own A1/A3 tests. A6 remains outside it.
    it('is true for A2 AMEND_INCREASE (widened trial scope, 2026-08-28)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'AMEND_INCREASE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    it('is true for A6 CREATE in Remarks-only mode', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'CREATE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_ACCEPTANCE' }) };
      expect(svc.fixPendingSupported(row)).toBe(true);
    });

    it('is false when functionFor() resolves to nothing at all (an unrecognized movementType)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'SOME_UNKNOWN_TYPE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.fixPendingSupported(row)).toBe(false);
    });
  });

  describe('isWithdrawMakerSubmitCase (business-confirmed 2026-08-27, unified under the "Delete Pending" name)', () => {
    it('is true once makerSubmittedAt is set on an IPLC_LC/UTILIZE row, regardless of status (PENDING)', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.isWithdrawMakerSubmitCase(row)).toBe(true);
    });

    it('is ALSO true once REJECTED — the "revert to before Submit" rule applies regardless', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'REJECTED' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.isWithdrawMakerSubmitCase(row)).toBe(true);
    });

    it('is false when never Maker-Submitted (still A3\'s own EARMARKED business, uses plain cancel())', () => {
      const svc = new MakerQueueService(makeApi());
      const row = { movement: makeMovement({ movementType: 'UTILIZE', acknowledgedAt: '2026-08-27T00:00:00.000Z', makerSubmittedAt: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      expect(svc.isWithdrawMakerSubmitCase(row)).toBe(false);
    });
  });

  // Business-confirmed 2026-08-28 ("1 只應該顯示一筆 2 一筆刪全部") — reverses the former Phase-2 posture
  // (3 separate rows, Delete Pending disabled) once `findByBusinessEventId()` made cross-session sibling
  // reconstruction possible; see MakerQueueService's own updated isCompoundShape()/groupCompoundRows() doc
  // comments for the full history.
  describe('load — groupCompoundRows() merges every leg sharing one businessEventId into ONE row', () => {
    it('a B4 Usance triple (Confirmation ACCEPT + Acceptance CREATE + Receivable CREATE) collapses to one row, representative = the direct-match leg (EPLC_CONFIRMATION/ACCEPT), carrying every sibling movementId', () => {
      const confirmationAccept = { movement: makeMovement({ movementId: 'mv-confirm', movementType: 'ACCEPT', businessEventId: 'be-1', sourceTransactionRef: 'E02', createdAt: '2026-08-28T00:00:02.000Z' }), contract: makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' }) };
      const acceptanceCreate = { movement: makeMovement({ movementId: 'mv-acceptance', movementType: 'CREATE', businessEventId: 'be-1', createdAt: '2026-08-28T00:00:01.000Z' }), contract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE' }) };
      const receivableCreate = { movement: makeMovement({ movementId: 'mv-receivable', movementType: 'CREATE', businessEventId: 'be-1', createdAt: '2026-08-28T00:00:00.000Z' }), contract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE' }) };
      // server order is created_at DESC — Confirmation first (most recent leg created), then Acceptance, then Receivable.
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [confirmationAccept, acceptanceCreate, receivableCreate] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toHaveLength(1);
      expect(svc.items[0].movement.movementId).toBe('mv-confirm');
      expect(svc.items[0].movement.sourceTransactionRef).toBe('E02');
      expect(svc.items[0].siblingMovementIds).toEqual(['mv-confirm', 'mv-acceptance', 'mv-receivable']);
      expect(svc.functionFor(svc.items[0])?.code).toBe('B4');
    });

    it('a plain single-leg row (no businessEventId) is left untouched, no siblingMovementIds', () => {
      const row = { movement: makeMovement({ movementId: 'mv-1', businessEventId: null }), contract: makeContract() };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [row] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toEqual([row]);
      expect(svc.items[0].siblingMovementIds).toBeUndefined();
    });

    it('a businessEventId-carrying row whose sibling legs are NOT in this query\'s own result (e.g. already RELEASED, excluded by the status filter) is left with only itself as its own siblingMovementIds', () => {
      const row = { movement: makeMovement({ movementId: 'mv-1', businessEventId: 'be-lonely' }), contract: makeContract() };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [row] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toEqual([row]); // group.length === 1 — returned as-is, no siblingMovementIds added
      expect(svc.items[0].siblingMovementIds).toBeUndefined();
    });

    it('two DIFFERENT compound events (different businessEventId) merge independently, not into each other', () => {
      const eventA1 = { movement: makeMovement({ movementId: 'a-1', businessEventId: 'be-a', movementType: 'ACCEPT', createdAt: '2026-08-28T00:00:03.000Z' }), contract: makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' }) };
      const eventA2 = { movement: makeMovement({ movementId: 'a-2', businessEventId: 'be-a', movementType: 'CREATE', createdAt: '2026-08-28T00:00:02.000Z' }), contract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE' }) };
      const eventB1 = { movement: makeMovement({ movementId: 'b-1', businessEventId: 'be-b', movementType: 'UTILIZE', createdAt: '2026-08-28T00:00:01.000Z' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      const eventB2 = { movement: makeMovement({ movementId: 'b-2', businessEventId: 'be-b', movementType: 'FULL_REDEEM', createdAt: '2026-08-28T00:00:00.000Z' }), contract: makeContract({ instrumentType: 'SHGT' }) };
      const api = makeApi({ listMyMovements: jest.fn(() => of(makePage({ items: [eventA1, eventA2, eventB1, eventB2] }))) });
      const svc = new MakerQueueService(api);

      svc.load();

      expect(svc.items).toHaveLength(2);
      const siblingSets = svc.items.map((r) => r.siblingMovementIds?.slice().sort());
      expect(siblingSets).toContainEqual(['a-1', 'a-2']);
      expect(siblingSets).toContainEqual(['b-1', 'b-2']);
    });
  });

  describe('deletePending', () => {
    it('calls api.cancel with createdBy/MAKER_EC and reloads WITHOUT resetting to page 1 on success', () => {
      const cancel = jest.fn(() => of(makeMovement({ status: 'CANCELLED' })));
      // 25 rows (3 pages) so page 2 is genuinely still in range post-reload — an empty result would clamp
      // page back to 1 regardless of resetToFirstPage, confounding this assertion.
      const rows = Array.from({ length: 25 }, (_, i) => ({ movement: makeMovement({ movementId: `mv-${i}`, businessEventId: null }), contract: makeContract({ naturalKey: { lcNumber: `LC-${String(i).padStart(3, '0')}` } }) }));
      const listMyMovements = jest.fn(() => of(makePage({ items: rows })));
      const api = makeApi({ cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      svc.paging.page = 2;
      const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };

      svc.deletePending(row);

      expect(cancel).toHaveBeenCalledWith('mv-9', 'maker1', 'MAKER_EC');
      expect(listMyMovements).toHaveBeenCalledWith({ createdBy: 'maker1', statuses: ['PENDING', 'REJECTED'], q: undefined });
      expect(svc.paging.page).toBe(2); // stayed on the same page — see load()'s own resetToFirstPage doc comment
    });

    it('on failure, sets a describable error and does not reload', () => {
      const cancel = jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };

      svc.deletePending(row);

      expect(svc.error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(listMyMovements).not.toHaveBeenCalled();
    });

    it('routes to api.withdrawMakerSubmit (not cancel) for an A4 row (makerSubmittedAt set), even if still PENDING', () => {
      const withdrawMakerSubmit = jest.fn(() => of(makeMovement({ makerSubmittedAt: null })));
      const cancel = jest.fn(() => of(makeMovement({ status: 'CANCELLED' })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ withdrawMakerSubmit, cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      svc.deletePending(row);

      expect(withdrawMakerSubmit).toHaveBeenCalledWith('mv-9', 'maker1');
      expect(cancel).not.toHaveBeenCalled();
    });

    it('routes to api.withdrawMakerSubmit for an A4 row even when REJECTED', () => {
      const withdrawMakerSubmit = jest.fn(() => of(makeMovement({ makerSubmittedAt: null, status: 'PENDING' })));
      const cancel = jest.fn(() => of(makeMovement({ status: 'CANCELLED' })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ withdrawMakerSubmit, cancel, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'REJECTED' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      svc.deletePending(row);

      expect(withdrawMakerSubmit).toHaveBeenCalledWith('mv-9', 'maker1');
      expect(cancel).not.toHaveBeenCalled();
    });

    it('on withdrawMakerSubmit failure (A4 row), sets a describable error and does not reload', () => {
      const withdrawMakerSubmit = jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } })));
      const listMyMovements = jest.fn(() => of(makePage()));
      const api = makeApi({ withdrawMakerSubmit, listMyMovements });
      const svc = new MakerQueueService(api);
      svc.createdBy = 'maker1';
      const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      svc.deletePending(row);

      expect(svc.error).toBe('ILLEGAL_STATE_TRANSITION');
      expect(listMyMovements).not.toHaveBeenCalled();
    });

    // 2026-08-28, "Maker Queue Delete Pending 也要顯示交易畫面 確認刪除與否" — the optional onSettled
    // callback lets TransactionBuilderComponent.onDeletePendingReviewConfirmed() know when it's safe to
    // navigate back from the review screen, without this method needing any knowledge of that navigation.
    describe('onSettled callback', () => {
      it('is called with true on a plain (non-compound) success', () => {
        const api = makeApi({ cancel: jest.fn(() => of(makeMovement({ status: 'CANCELLED' }))), listMyMovements: jest.fn(() => of(makePage())) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };
        const onSettled = jest.fn();

        svc.deletePending(row, onSettled);

        expect(onSettled).toHaveBeenCalledWith(true);
      });

      it('is called with false on a plain (non-compound) failure', () => {
        const api = makeApi({ cancel: jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };
        const onSettled = jest.fn();

        svc.deletePending(row, onSettled);

        expect(onSettled).toHaveBeenCalledWith(false);
      });

      it('is called with true on an A4 (withdrawMakerSubmit) success', () => {
        const api = makeApi({ withdrawMakerSubmit: jest.fn(() => of(makeMovement({ makerSubmittedAt: null }))), listMyMovements: jest.fn(() => of(makePage())) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
        const onSettled = jest.fn();

        svc.deletePending(row, onSettled);

        expect(onSettled).toHaveBeenCalledWith(true);
      });

      it('is called with false on an A4 (withdrawMakerSubmit) failure', () => {
        const api = makeApi({ withdrawMakerSubmit: jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-9', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-27T01:00:00.000Z', status: 'PENDING' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
        const onSettled = jest.fn();

        svc.deletePending(row, onSettled);

        expect(onSettled).toHaveBeenCalledWith(false);
      });

      it('is called with true exactly once, after every leg, for a successful compound cascade', () => {
        const api = makeApi({ cancel: jest.fn((id: string) => of(makeMovement({ movementId: id, status: 'CANCELLED' }))), listMyMovements: jest.fn(() => of(makePage())) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-confirm' }), contract: makeContract(), siblingMovementIds: ['mv-confirm', 'mv-acceptance'] };
        const onSettled = jest.fn();

        svc.deletePending(row, onSettled);

        expect(onSettled).toHaveBeenCalledTimes(1);
        expect(onSettled).toHaveBeenCalledWith(true);
      });

      it('is called with false when a compound cascade fails partway', () => {
        const api = makeApi({ cancel: jest.fn((id: string) => (id === 'mv-acceptance' ? throwError(() => ({ error: { message: 'CANNOT_CANCEL_RELEASED' } })) : of(makeMovement({ movementId: id, status: 'CANCELLED' })))) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-confirm' }), contract: makeContract(), siblingMovementIds: ['mv-confirm', 'mv-acceptance'] };
        const onSettled = jest.fn();

        svc.deletePending(row, onSettled);

        expect(onSettled).toHaveBeenCalledWith(false);
      });

      it('deletePending(row) without a callback still works (onSettled is optional)', () => {
        const api = makeApi({ cancel: jest.fn(() => of(makeMovement({ status: 'CANCELLED' }))), listMyMovements: jest.fn(() => of(makePage())) });
        const svc = new MakerQueueService(api);
        const row = { movement: makeMovement({ movementId: 'mv-9' }), contract: makeContract() };

        expect(() => svc.deletePending(row)).not.toThrow();
      });
    });

    // Business-confirmed 2026-08-28 ("1 只應該顯示一筆 2 一筆刪全部") — a merged compound row (built by
    // groupCompoundRows() at load time, see the describe block above) cascades: every sibling first, THEN
    // the representative's own movement last, same "never leave a later leg orphaned" ordering
    // checker-actions.service.ts's own same-session deleteMakerPending() uses.
    describe('cascades across every sibling for a merged compound row (siblingMovementIds set)', () => {
      it('cancels every sibling THEN the representative last, then reloads once', () => {
        const calls: string[] = [];
        const cancel = jest.fn((id: string) => {
          calls.push(id);
          return of(makeMovement({ movementId: id, status: 'CANCELLED' }));
        });
        const listMyMovements = jest.fn(() => of(makePage()));
        const api = makeApi({ cancel, listMyMovements });
        const svc = new MakerQueueService(api);
        svc.createdBy = 'maker1';
        const row = { movement: makeMovement({ movementId: 'mv-confirm' }), contract: makeContract(), siblingMovementIds: ['mv-confirm', 'mv-acceptance', 'mv-receivable'] };

        svc.deletePending(row);

        expect(calls).toEqual(['mv-acceptance', 'mv-receivable', 'mv-confirm']); // siblings first, representative last.
        expect(cancel).toHaveBeenCalledTimes(3);
        cancel.mock.calls.forEach((call) => expect(call.slice(1)).toEqual(['maker1', 'MAKER_EC']));
        expect(listMyMovements).toHaveBeenCalledTimes(1); // reloads once at the end, not once per leg.
      });

      it('stops the chain on the first failure and reports it — siblings already cancelled before the failure stay cancelled, no reload', () => {
        const cancel = jest.fn((id: string) => (id === 'mv-acceptance' ? throwError(() => ({ error: { message: 'CANNOT_CANCEL_RELEASED' } })) : of(makeMovement({ movementId: id, status: 'CANCELLED' }))));
        const listMyMovements = jest.fn(() => of(makePage()));
        const api = makeApi({ cancel, listMyMovements });
        const svc = new MakerQueueService(api);
        svc.createdBy = 'maker1';
        const row = { movement: makeMovement({ movementId: 'mv-confirm' }), contract: makeContract(), siblingMovementIds: ['mv-confirm', 'mv-acceptance', 'mv-receivable'] };

        svc.deletePending(row);

        expect(svc.error).toBe('CANNOT_CANCEL_RELEASED');
        expect(cancel).toHaveBeenCalledTimes(1); // stopped after the first (failing) sibling — never reached the representative.
        expect(listMyMovements).not.toHaveBeenCalled();
      });

      it('a compound row with only itself in siblingMovementIds (single-leg group) behaves exactly like a plain row', () => {
        const cancel = jest.fn((id: string) => of(makeMovement({ movementId: id, status: 'CANCELLED' })));
        const listMyMovements = jest.fn(() => of(makePage()));
        const api = makeApi({ cancel, listMyMovements });
        const svc = new MakerQueueService(api);
        svc.createdBy = 'maker1';
        const row = { movement: makeMovement({ movementId: 'mv-1' }), contract: makeContract(), siblingMovementIds: ['mv-1'] };

        svc.deletePending(row);

        expect(cancel).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledWith('mv-1', 'maker1', 'MAKER_EC');
      });
    });
  });
});
