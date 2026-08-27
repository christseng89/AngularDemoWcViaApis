import { of, throwError } from 'rxjs';
import { InquireDeletePendingService, secondaryReferenceForDeleteAudit } from './inquire-delete-pending.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, DeletePendingAuditPage, DeletePendingAuditRow } from './balance-component-api.service';

function makeRow(overrides: Partial<DeletePendingAuditRow> = {}): DeletePendingAuditRow {
  return {
    auditId: 'audit-1',
    deleteSeq: 1,
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    sourceTransactionRef: null,
    statusBefore: 'PENDING',
    cancelledBy: 'maker1',
    cancelledAt: '2026-08-27T00:00:00.000Z',
    reasonCode: 'MAKER_EC',
    remarks: null,
    instrumentType: 'IPLC_LC',
    lcNumber: 'S001',
    ibNumber: null,
    sgNumber: null,
    ...overrides,
  };
}

function makePage(overrides: Partial<DeletePendingAuditPage> = {}): DeletePendingAuditPage {
  return { items: [], total: 0, page: 1, pageSize: 10, ...overrides };
}

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
    status: 'CANCELLED',
    createdBy: 'maker1',
    createdAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}

function makeCatalogPage(overrides: Partial<{ items: BalanceContract[]; total: number; page: number; pageSize: number }> = {}) {
  return { items: [], total: 0, page: 1, pageSize: 10, ...overrides };
}

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    listDeletePendingAudit: overrides.listDeletePendingAudit ?? jest.fn(() => of(makePage())),
    getContract: overrides.getContract ?? jest.fn(() => of(makeContract())),
    listMovements: overrides.listMovements ?? jest.fn(() => of([makeMovement()])),
    // Used by InquireDeletePendingService's own catalogIndex (LcCatalogIndexService): catalogWithDeletePendingHistory()
    // is the LC Catalog page itself; catalog()/getSnapshot() are used by computeLcIndexRow()'s own per-row
    // decoration (childMovementsOf$()'s own child-catalog lookup, and the row's own Available Balance) —
    // computeLcIndexRow()'s own math is already exhaustively tested via inquire-events.service.spec.ts;
    // these defaults just let the decoration pipeline resolve without erroring in tests that don't care
    // about its exact numeric output.
    catalogWithDeletePendingHistory: overrides.catalogWithDeletePendingHistory ?? jest.fn(() => of(makeCatalogPage())),
    catalog: overrides.catalog ?? jest.fn(() => of(makeCatalogPage())),
    getSnapshot: overrides.getSnapshot ?? jest.fn(() => of(null)),
  } as unknown as BalanceComponentApiService;
}

describe('secondaryReferenceForDeleteAudit', () => {
  it('shows "SG {x}" for SHGT rows', () => {
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'SHGT', sgNumber: 'G01' }))).toBe('SG G01');
  });

  it("shows '—' for SHGT when sgNumber is somehow missing", () => {
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'SHGT', sgNumber: null }))).toBe('—');
  });

  it('shows the bare ibNumber for IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION', () => {
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'IPLC_ACCEPTANCE', ibNumber: 'IB01' }))).toBe('IB01');
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'IB02' }))).toBe('IB02');
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'EPLC_EXAMINATION', ibNumber: 'E01' }))).toBe('E01');
  });

  it('falls back to sourceTransactionRef for IPLC_LC/EPLC_LC/EPLC_CONFIRMATION (Amendment No./IB/EB Number-labeled functions)', () => {
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'IPLC_LC', sourceTransactionRef: 'AMD-01' }))).toBe('AMD-01');
    expect(secondaryReferenceForDeleteAudit(makeRow({ instrumentType: 'EPLC_CONFIRMATION', sourceTransactionRef: null }))).toBe('—');
  });
});

describe('InquireDeletePendingService', () => {
  describe('catalogIndex (LC Catalog step, §11)', () => {
    it('loadIndex() delegates to catalogIndex.load()', () => {
      const catalogWithDeletePendingHistory = jest.fn(() => of(makeCatalogPage()));
      const svc = new InquireDeletePendingService(makeApi({ catalogWithDeletePendingHistory }));

      svc.loadIndex();

      expect(catalogWithDeletePendingHistory).toHaveBeenCalledWith('IPLC_LC', undefined, 1, 10);
    });

    it('catalogIndex is wired to catalogWithDeletePendingHistory(), not the general catalog() browse — resolves EPLC_CONFIRMATION for the EXPORT side', () => {
      const catalogWithDeletePendingHistory = jest.fn(() => of(makeCatalogPage()));
      const catalog = jest.fn(() => of(makeCatalogPage()));
      const svc = new InquireDeletePendingService(makeApi({ catalogWithDeletePendingHistory, catalog }));
      svc.catalogIndex.side = 'EXPORT';

      svc.catalogIndex.load();

      expect(catalogWithDeletePendingHistory).toHaveBeenCalledWith('EPLC_CONFIRMATION', undefined, 1, 10);
      expect(catalog).not.toHaveBeenCalled();
    });

    it('catalogIndex decorates each returned contract into an LcIndexRow (via computeLcIndexRow) — reflects the contract itself, not a raw pass-through', () => {
      const contract = makeContract({ balanceContractId: 'bc-idx-1', naturalKey: { lcNumber: 'S001' } });
      const catalogWithDeletePendingHistory = jest.fn(() => of(makeCatalogPage({ items: [contract], total: 1 })));
      const svc = new InquireDeletePendingService(makeApi({ catalogWithDeletePendingHistory }));

      svc.loadIndex();

      expect(svc.catalogIndex.rows).toHaveLength(1);
      expect(svc.catalogIndex.rows[0].contract).toBe(contract);
      expect(svc.catalogIndex.rows[0]).toHaveProperty('lcAmount');
      expect(svc.catalogIndex.rows[0]).toHaveProperty('lastEventAt');
    });
  });

  describe('selectLcFromIndex / backToIndex', () => {
    it('selectLcFromIndex() sets selectedContract, switches to AUDIT view, scopes lcNumber, resets other filters, and searches', () => {
      const contract = makeContract({ naturalKey: { lcNumber: 'S002' } });
      const listDeletePendingAudit = jest.fn(() => of(makePage()));
      const svc = new InquireDeletePendingService(makeApi({ listDeletePendingAudit }));
      svc.deletedBy = 'stale';
      svc.from = 'stale';
      svc.to = 'stale';
      svc.functionFilter = 'stale';

      svc.selectLcFromIndex(contract);

      expect(svc.selectedContract).toBe(contract);
      expect(svc.indexView).toBe('AUDIT');
      expect(svc.lcNumber).toBe('S002');
      expect(svc.deletedBy).toBe('');
      expect(svc.from).toBe('');
      expect(svc.to).toBe('');
      expect(svc.functionFilter).toBe('');
      expect(listDeletePendingAudit).toHaveBeenCalledWith(expect.objectContaining({ lcNumber: 'S002', page: 1 }));
    });

    it('backToIndex() resets to INDEX view and clears selectedContract/items/viewing', () => {
      const svc = new InquireDeletePendingService(makeApi());
      svc.selectedContract = makeContract();
      svc.indexView = 'AUDIT';
      svc.items = [makeRow()];
      svc.paging.page = 3;
      svc.viewing = { row: makeRow(), function: null, fields: [], form: {} as any, model: {} as any };
      svc.viewError = 'x';

      svc.backToIndex();

      expect(svc.indexView).toBe('INDEX');
      expect(svc.selectedContract).toBeNull();
      expect(svc.items).toEqual([]);
      expect(svc.paging.page).toBe(1);
      expect(svc.viewing).toBeNull();
      expect(svc.viewError).toBeNull();
    });
  });

  describe('search', () => {
    it('passes lcNumber/deletedBy/from/to/page/pageSize through, blank strings become undefined', () => {
      const listDeletePendingAudit = jest.fn(() => of(makePage()));
      const api = makeApi({ listDeletePendingAudit });
      const svc = new InquireDeletePendingService(api);
      svc.lcNumber = 'S001';
      svc.deletedBy = '';
      svc.from = '2026-01-01';
      svc.to = '';

      svc.search();

      expect(listDeletePendingAudit).toHaveBeenCalledWith({
        lcNumber: 'S001',
        deletedBy: undefined,
        from: '2026-01-01',
        to: undefined,
        page: 1,
        pageSize: 10,
      });
    });

    it('populates items/paging on success and clears any open View', () => {
      const row = makeRow();
      const api = makeApi({ listDeletePendingAudit: jest.fn(() => of(makePage({ items: [row], total: 1 }))) });
      const svc = new InquireDeletePendingService(api);
      svc.viewing = { row, function: null, fields: [], form: {} as any, model: {} as any };

      svc.search();

      expect(svc.items).toEqual([row]);
      expect(svc.paging.total).toBe(1);
      expect(svc.loading).toBe(false);
      expect(svc.viewing).toBeNull();
    });

    it('on error, sets a describable error and clears items/total', () => {
      const api = makeApi({ listDeletePendingAudit: jest.fn(() => throwError(() => ({ error: { message: 'boom' } }))) });
      const svc = new InquireDeletePendingService(api);
      svc.items = [makeRow()];

      svc.search();

      expect(svc.loading).toBe(false);
      expect(svc.error).toBe('boom');
      expect(svc.items).toEqual([]);
      expect(svc.paging.total).toBe(0);
    });
  });

  describe('prevPage/nextPage', () => {
    it('nextPage() re-searches at the next page target', () => {
      const listDeletePendingAudit = jest.fn(() => of(makePage({ total: 25, page: 1, pageSize: 10 })));
      const svc = new InquireDeletePendingService(makeApi({ listDeletePendingAudit }));
      svc.search();

      svc.nextPage();

      expect(listDeletePendingAudit).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });

    it('prevPage() no-ops on page 1', () => {
      const listDeletePendingAudit = jest.fn(() => of(makePage()));
      const svc = new InquireDeletePendingService(makeApi({ listDeletePendingAudit }));
      svc.search();
      listDeletePendingAudit.mockClear();

      svc.prevPage();

      expect(listDeletePendingAudit).not.toHaveBeenCalled();
    });
  });

  describe('functionFor / secondaryReferenceFor', () => {
    it('functionFor resolves via the Strategy registry', () => {
      const svc = new InquireDeletePendingService(makeApi());
      expect(svc.functionFor(makeRow({ instrumentType: 'IPLC_LC', movementType: 'ISSUE' }))?.code).toBe('A1');
    });

    it('secondaryReferenceFor delegates to the module-level function', () => {
      const svc = new InquireDeletePendingService(makeApi());
      expect(svc.secondaryReferenceFor(makeRow({ instrumentType: 'SHGT', sgNumber: 'G01' }))).toBe('SG G01');
    });
  });

  describe('filteredItems', () => {
    it('returns every item when functionFilter is blank', () => {
      const svc = new InquireDeletePendingService(makeApi());
      svc.items = [makeRow({ movementId: 'a', instrumentType: 'IPLC_LC', movementType: 'ISSUE' }), makeRow({ movementId: 'b', instrumentType: 'SHGT', movementType: 'ISSUE' })];
      expect(svc.filteredItems).toHaveLength(2);
    });

    it('filters client-side to rows whose resolved Function code matches', () => {
      const svc = new InquireDeletePendingService(makeApi());
      svc.items = [makeRow({ movementId: 'a', instrumentType: 'IPLC_LC', movementType: 'ISSUE' }), makeRow({ movementId: 'b', instrumentType: 'SHGT', movementType: 'ISSUE' })];
      svc.functionFilter = 'A1';
      expect(svc.filteredItems.map((r) => r.movementId)).toEqual(['a']);
    });
  });

  describe('view', () => {
    it('fetches the contract + movements, reconstructs a read-only field set for the matching movement', () => {
      const contract = makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } });
      const movement = makeMovement({ movementId: 'mv-1', movementType: 'ISSUE' });
      const api = makeApi({ getContract: jest.fn(() => of(contract)), listMovements: jest.fn(() => of([movement])) });
      const svc = new InquireDeletePendingService(api);
      const row = makeRow({ movementId: 'mv-1', balanceContractId: 'bc-1' });

      svc.view(row);

      expect(api.getContract).toHaveBeenCalledWith('bc-1');
      expect(api.listMovements).toHaveBeenCalledWith('bc-1');
      expect(svc.viewing?.row).toBe(row);
      expect(svc.viewing?.function?.code).toBe('A1');
      expect(svc.viewing?.fields.length).toBeGreaterThan(0);
      expect(svc.viewError).toBeNull();
    });

    it('sets a viewError when the movement is not found under the fetched contract (data-integrity guard, should never happen live)', () => {
      const api = makeApi({ listMovements: jest.fn(() => of([makeMovement({ movementId: 'some-other-id' })])) });
      const svc = new InquireDeletePendingService(api);

      svc.view(makeRow({ movementId: 'mv-missing' }));

      expect(svc.viewing).toBeNull();
      expect(svc.viewError).toMatch(/mv-missing/);
    });

    it('on API failure, sets a describable viewError', () => {
      const api = makeApi({ getContract: jest.fn(() => throwError(() => ({ error: { message: 'NOT_FOUND' } }))) });
      const svc = new InquireDeletePendingService(api);

      svc.view(makeRow());

      expect(svc.viewing).toBeNull();
      expect(svc.viewError).toBe('NOT_FOUND');
    });

    it('closeView() clears both viewing and viewError', () => {
      const svc = new InquireDeletePendingService(makeApi());
      svc.viewing = { row: makeRow(), function: null, fields: [], form: {} as any, model: {} as any };
      svc.viewError = 'x';

      svc.closeView();

      expect(svc.viewing).toBeNull();
      expect(svc.viewError).toBeNull();
    });
  });
});
