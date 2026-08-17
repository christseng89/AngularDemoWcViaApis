import { of, throwError } from 'rxjs';
import { InquireEventsService } from './inquire-events.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';

/**
 * Inquire Events (2026-08-17) — mirrors checker-actions.service.spec.ts's own mock-factory convention
 * (makeMovement()/makeContract()/makeApi() helpers, plain `new InquireEventsService(mockApi)`
 * construction, no TestBed) — same testability posture as this project's other extracted services.
 */

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-lc',
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
    balanceContractId: 'bc-lc',
    eventSeq: 1,
    movementType: 'ISSUE',
    exposureNature: 'CONTINGENT',
    amount: '50000',
    ceilingAmount: '50000',
    currency: 'USD',
    status: 'RELEASED',
    createdBy: 'maker1',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function emptyCatalog(): CatalogPage {
  return { items: [], total: 0, page: 1, pageSize: 50 };
}

function makeSnapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: 'bc-lc',
    logicalContractId: 'lc-1',
    currency: 'USD',
    confirmedBalance: '50000',
    availableBalance: '50000',
    pendingEarmarkTotal: '0',
    ...overrides,
  };
}

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    resolveContract: jest.fn(() => of(makeContract())),
    listMovements: jest.fn(() => of([] as BalanceMovement[])),
    catalog: jest.fn(() => of(emptyCatalog())),
    getBalanceAsOfMovement: jest.fn(() => of(makeSnapshot())),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('InquireEventsService', () => {
  describe('selectSide', () => {
    it('sets side, clears lcNumber, and clears any prior search results/selection', () => {
      const svc = new InquireEventsService(makeApi());
      svc.side = 'IMPORT';
      svc.lcNumber = 'S001';
      svc.rootContract = makeContract();
      svc.events = [{ movement: makeMovement(), contract: makeContract() }];
      svc.selectedEvent = svc.events[0];

      svc.selectSide('EXPORT');

      expect(svc.side).toBe('EXPORT');
      expect(svc.lcNumber).toBe('');
      expect(svc.rootContract).toBeNull();
      expect(svc.events).toEqual([]);
      expect(svc.selectedEvent).toBeNull();
    });
  });

  describe('search', () => {
    it('does nothing for a blank/whitespace-only LC Number — no API call', () => {
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.lcNumber = '   ';
      svc.search();
      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(svc.searching).toBe(false);
    });

    it('resolves against IPLC_LC for IMPORT and EPLC_CONFIRMATION for EXPORT (defaultLcInstrumentTypeForSide reuse)', () => {
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.side = 'EXPORT';
      svc.lcNumber = 'CNF01';
      svc.search();
      expect(api.resolveContract).toHaveBeenCalledWith('EPLC_CONFIRMATION', { lcNumber: 'CNF01' });
    });

    it('on resolveContract error, sets searchError via describeApiError and leaves events empty', () => {
      const api = makeApi({ resolveContract: jest.fn(() => throwError(() => ({ error: { message: 'not found' } }))) });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S404';
      svc.search();
      expect(svc.searching).toBe(false);
      expect(svc.searchError).toBe('not found');
      expect(svc.rootContract).toBeNull();
      expect(svc.events).toEqual([]);
    });

    it('merges the root contract\'s own movements with every child ledger\'s (IPLC_LC -> IPLC_ACCEPTANCE + SHGT), sorted by createdAt ascending', () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC' });
      const sg = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      const rootMovement = makeMovement({ movementId: 'mv-root', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-02T00:00:00.000Z' });
      const sgMovement = makeMovement({ movementId: 'mv-sg', balanceContractId: 'bc-sg', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });

      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn((contractId: string) => of(contractId === 'bc-lc' ? [rootMovement] : contractId === 'bc-sg' ? [sgMovement] : [])),
        catalog: jest.fn((instrumentType: string) => of(instrumentType === 'SHGT' ? { items: [sg], total: 1, page: 1, pageSize: 50 } : emptyCatalog())),
      });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.rootContract).toBe(root);
      expect(svc.eventsLoading).toBe(false);
      // sgMovement (2026-08-01) sorts before rootMovement (2026-08-02) — true Event Date/Time order,
      // not registration/array order.
      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-sg', 'mv-root']);
      expect(svc.events.find((e) => e.movement.movementId === 'mv-sg')?.contract).toBe(sg);
    });

    it('a child listMovements() failure for one candidate is swallowed (catchError -> []), not fatal to the whole merge', () => {
      const root = makeContract();
      const badChild = makeContract({ balanceContractId: 'bc-bad', instrumentType: 'SHGT' });
      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn((contractId: string) => (contractId === 'bc-bad' ? throwError(() => new Error('boom')) : of([makeMovement()]))),
        catalog: jest.fn((instrumentType: string) => of(instrumentType === 'SHGT' ? { items: [badChild], total: 1, page: 1, pageSize: 50 } : emptyCatalog())),
      });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();
      expect(svc.events.length).toBe(1);
    });

    it('a child catalog() call itself failing (e.g. network error) is swallowed (catchError -> []) — the root\'s own movements still come back', () => {
      const root = makeContract();
      const rootMovement = makeMovement();
      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn(() => of([rootMovement])),
        catalog: jest.fn((instrumentType: string) => (instrumentType === 'SHGT' ? throwError(() => new Error('boom')) : of(emptyCatalog()))),
      });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();
      expect(svc.eventsLoading).toBe(false);
      expect(svc.events.map((e) => e.movement.movementId)).toEqual([rootMovement.movementId]);
    });
  });

  describe('selectEvent', () => {
    it('resolves the producing function, reconstructs a read-only field set, and stashes a fresh FormGroup', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tolerancePct: '10', tenorType: 'SIGHT', tenorDays: 0 });
      const movement = makeMovement({ movementType: 'ISSUE', amount: '50000', currency: 'USD', sourceTransactionRef: null });

      svc.selectEvent({ movement, contract });

      expect(svc.selectedEvent?.movement).toBe(movement);
      expect(svc.selectedEventFunction?.code).toBe('A1');
      expect(svc.selectedEventModel.amount).toBe('50000');
      expect(svc.selectedEventModel.currency).toBe('USD');
      expect(svc.selectedEventModel.tolerancePct).toBe('10');
      expect(svc.selectedEventModel.tenorType).toBe('SIGHT');
      expect(svc.selectedEventFields.length).toBeGreaterThan(0);
      expect(svc.selectedEventFields.every((f) => f.props?.disabled === true)).toBe(true);
      expect(svc.selectedEventForm.value).toEqual({});
    });

    it('falls back to a generic "Reference No." label when the resolved function has no secondaryRefLabel of its own but the movement did carry a reference (A1 has none; sourceTransactionRef still shown rather than silently dropped)', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementType: 'ISSUE', sourceTransactionRef: 'AMD-01' });

      svc.selectEvent({ movement, contract });

      expect(svc.selectedEventFunction?.code).toBe('A1');
      const secondaryRef = svc.selectedEventFields.find((f) => f.key === 'secondaryRef');
      expect(secondaryRef?.hide).toBe(false);
      expect(secondaryRef?.props?.label).toBe('Reference No.');
    });

    it('falls back to a null selectedEventFunction (generic fields, no crash) when nothing in the registry matches', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'EPLC_EXAMINATION' });
      const movement = makeMovement({ movementType: 'AMEND' });

      svc.selectEvent({ movement, contract });

      expect(svc.selectedEventFunction).toBeNull();
      expect(svc.selectedEventFields.length).toBeGreaterThan(0);
    });
  });

  // Inquire Events (2026-08-17, user-requested, simplified same day — "VIEW EVENT 只需 EVENT SNAPSHOT
  // 即可") — exactly ONE point-in-time snapshot per Event, for the ledger it actually belongs to.
  describe('selectEvent — selectedEventSnapshot (Event Snapshot)', () => {
    it('fetches the snapshot for the event\'s own movement via getBalanceAsOfMovement() (exact, same-contract, no cross-contract cutoff needed)', () => {
      const api = makeApi();
      const svc = new InquireEventsService(api);
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementId: 'mv-1' });

      svc.selectEvent({ movement, contract });

      expect(api.getBalanceAsOfMovement).toHaveBeenCalledWith('mv-1');
      expect(svc.selectedEventSnapshot).toEqual(makeSnapshot());
    });

    it('title is "Event Snapshot — {label} — LC {lc}" for a plain LC contract', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } });
      svc.selectEvent({ movement: makeMovement(), contract });
      expect(svc.selectedEventSnapshotTitle).toBe('Event Snapshot — LC Balance — LC S001');
    });

    it('title appends "/ IB {ib}" for an Acceptance contract', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } });
      svc.selectEvent({ movement: makeMovement(), contract });
      expect(svc.selectedEventSnapshotTitle).toBe('Event Snapshot — Acceptance Balance — LC S001 / IB IB01');
    });

    it('title appends "/ SG {sg}" for a Shipping Guarantee contract', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      svc.selectEvent({ movement: makeMovement(), contract });
      expect(svc.selectedEventSnapshotTitle).toBe('Event Snapshot — Shipping Guarantee Balance — LC S001 / SG G01');
    });

    it('falls back to the bare instrumentType in the title for EPLC_EXAMINATION (not one of BALANCE_SNAPSHOT_LABEL\'s own keys — MEMO_ONLY, never a real Balance Component) — still renders, no crash', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E01' } });
      svc.selectEvent({ movement: makeMovement(), contract });
      expect(svc.selectedEventSnapshotTitle).toBe('Event Snapshot — EPLC_EXAMINATION — LC S001 / IB E01');
    });

    it('a getBalanceAsOfMovement() failure sets selectedEventSnapshot to null rather than leaving a stale value from a prior selection', () => {
      const api = makeApi({ getBalanceAsOfMovement: jest.fn(() => throwError(() => new Error('boom'))) });
      const svc = new InquireEventsService(api);
      svc.selectEvent({ movement: makeMovement(), contract: makeContract() });
      expect(svc.selectedEventSnapshot).toBeNull();
    });

    it('a second selectEvent() call replaces the previous snapshot, not merges with it', () => {
      const api = makeApi({
        getBalanceAsOfMovement: jest.fn((movementId: string) => of(makeSnapshot({ confirmedBalance: movementId }))),
      });
      const svc = new InquireEventsService(api);
      svc.selectEvent({ movement: makeMovement({ movementId: 'mv-first' }), contract: makeContract() });
      expect(svc.selectedEventSnapshot?.confirmedBalance).toBe('mv-first');

      svc.selectEvent({ movement: makeMovement({ movementId: 'mv-second' }), contract: makeContract() });
      expect(svc.selectedEventSnapshot?.confirmedBalance).toBe('mv-second');
    });
  });

  describe('closeEvent', () => {
    it('clears the selection back to its initial empty state', () => {
      const svc = new InquireEventsService(makeApi());
      svc.selectEvent({ movement: makeMovement(), contract: makeContract() });
      expect(svc.selectedEvent).not.toBeNull();

      svc.closeEvent();

      expect(svc.selectedEvent).toBeNull();
      expect(svc.selectedEventFunction).toBeNull();
      expect(svc.selectedEventFields).toEqual([]);
      expect(svc.selectedEventModel).toEqual({});
      expect(svc.selectedEventSnapshotTitle).toBe('');
      expect(svc.selectedEventSnapshot).toBeNull();
    });
  });
});
