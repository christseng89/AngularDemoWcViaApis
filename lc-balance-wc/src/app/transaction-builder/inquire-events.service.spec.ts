import { of, throwError } from 'rxjs';
import { InquireEventsService, InquiredEvent } from './inquire-events.service';
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

  // Inquire Events (2026-08-17, user-requested) — Balance Snapshot/Closing Balance per Event.
  describe('selectEvent — selectedEventBalances (Balance Snapshot per Event)', () => {
    it('produces no rows and issues no API call when this.events is empty', () => {
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.events = [];

      svc.selectEvent({ movement: makeMovement(), contract: makeContract() });

      expect(svc.selectedEventBalances).toEqual([]);
      expect(api.getBalanceAsOfMovement).not.toHaveBeenCalled();
    });

    it('one row per relevant contract, each resolved to that contract\'s own LATEST movement at or before the selected event\'s time — not the selected event\'s own time on every contract', () => {
      const lc = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC' });
      const sg = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      const lcIssue = makeMovement({ movementId: 'mv-lc-issue', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });
      const sgIssue = makeMovement({ movementId: 'mv-sg-issue', balanceContractId: 'bc-sg', movementType: 'ISSUE', createdAt: '2026-08-02T00:00:00.000Z' });
      const lcUtilize = makeMovement({ movementId: 'mv-lc-utilize', balanceContractId: 'bc-lc', movementType: 'UTILIZE', createdAt: '2026-08-03T00:00:00.000Z' });
      const events: InquiredEvent[] = [
        { movement: lcIssue, contract: lc },
        { movement: sgIssue, contract: sg },
        { movement: lcUtilize, contract: lc },
      ];

      const api = makeApi({ getBalanceAsOfMovement: jest.fn((movementId: string) => of(makeSnapshot({ confirmedBalance: movementId }))) });
      const svc = new InquireEventsService(api);
      svc.events = events;

      // Select the SG Issue event (2026-08-02) — the LC's own latest movement AT OR BEFORE that time is
      // the ISSUE (2026-08-01), NOT the later UTILIZE (2026-08-03), which hadn't happened yet.
      svc.selectEvent({ movement: sgIssue, contract: sg });

      expect(api.getBalanceAsOfMovement).toHaveBeenCalledWith('mv-lc-issue');
      expect(api.getBalanceAsOfMovement).toHaveBeenCalledWith('mv-sg-issue');
      expect(api.getBalanceAsOfMovement).not.toHaveBeenCalledWith('mv-lc-utilize');
      expect(svc.selectedEventBalances).toHaveLength(2);
      const lcRow = svc.selectedEventBalances.find((r) => r.instrumentType === 'IPLC_LC');
      expect(lcRow?.label).toBe('LC Balance');
      expect(lcRow?.snapshot?.confirmedBalance).toBe('mv-lc-issue');
      const sgRow = svc.selectedEventBalances.find((r) => r.instrumentType === 'SHGT');
      expect(sgRow?.label).toBe('Shipping Guarantee Balance');
      expect(sgRow?.snapshot?.confirmedBalance).toBe('mv-sg-issue');
    });

    it('a Balance Component not yet created as of the selected event (all its movements are AFTER the cutoff) gets a null-snapshot row and no API call for it', () => {
      const lc = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC' });
      const sg = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      const lcIssue = makeMovement({ movementId: 'mv-lc-issue', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });
      const sgIssue = makeMovement({ movementId: 'mv-sg-issue', balanceContractId: 'bc-sg', movementType: 'ISSUE', createdAt: '2026-08-05T00:00:00.000Z' });
      const events: InquiredEvent[] = [
        { movement: lcIssue, contract: lc },
        { movement: sgIssue, contract: sg },
      ];

      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.events = events;

      // Selecting the LC Issue itself — the SG doesn't exist yet at that point in time.
      svc.selectEvent({ movement: lcIssue, contract: lc });

      expect(api.getBalanceAsOfMovement).toHaveBeenCalledTimes(1);
      expect(api.getBalanceAsOfMovement).toHaveBeenCalledWith('mv-lc-issue');
      const sgRow = svc.selectedEventBalances.find((r) => r.instrumentType === 'SHGT');
      expect(sgRow?.snapshot).toBeNull();
    });

    it('excludes EPLC_EXAMINATION movements from the balance rows entirely — MEMO_ONLY, never a real Balance Component', () => {
      const cnf = makeContract({ balanceContractId: 'bc-cnf', instrumentType: 'EPLC_CONFIRMATION' });
      const exam = makeContract({ balanceContractId: 'bc-exam', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E01' } });
      const cnfIssue = makeMovement({ movementId: 'mv-cnf-issue', balanceContractId: 'bc-cnf', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });
      const examCreate = makeMovement({ movementId: 'mv-exam-create', balanceContractId: 'bc-exam', movementType: 'CREATE', createdAt: '2026-08-02T00:00:00.000Z' });
      const svc = new InquireEventsService(makeApi());
      svc.events = [
        { movement: cnfIssue, contract: cnf },
        { movement: examCreate, contract: exam },
      ];

      svc.selectEvent({ movement: examCreate, contract: exam });

      expect(svc.selectedEventBalances.some((r) => r.instrumentType === 'EPLC_EXAMINATION')).toBe(false);
      expect(svc.selectedEventBalances).toHaveLength(1);
      expect(svc.selectedEventBalances[0].instrumentType).toBe('EPLC_CONFIRMATION');
    });

    it('a getBalanceAsOfMovement() failure for one contract is swallowed (catchError -> null snapshot), not fatal to the other rows', () => {
      const lc = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC' });
      const sg = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      const lcIssue = makeMovement({ movementId: 'mv-lc-issue', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });
      const sgIssue = makeMovement({ movementId: 'mv-sg-issue', balanceContractId: 'bc-sg', movementType: 'ISSUE', createdAt: '2026-08-02T00:00:00.000Z' });
      const api = makeApi({
        getBalanceAsOfMovement: jest.fn((movementId: string) => (movementId === 'mv-sg-issue' ? throwError(() => new Error('boom')) : of(makeSnapshot()))),
      });
      const svc = new InquireEventsService(api);
      svc.events = [
        { movement: lcIssue, contract: lc },
        { movement: sgIssue, contract: sg },
      ];

      svc.selectEvent({ movement: sgIssue, contract: sg });

      expect(svc.selectedEventBalances).toHaveLength(2);
      const lcRow = svc.selectedEventBalances.find((r) => r.instrumentType === 'IPLC_LC');
      expect(lcRow?.snapshot).not.toBeNull();
      const sgRow = svc.selectedEventBalances.find((r) => r.instrumentType === 'SHGT');
      expect(sgRow?.snapshot).toBeNull();
    });
  });

  describe('balanceRowTitle', () => {
    it('plain "{label} — LC {lc}" when the contract has neither an IB nor an SG number', () => {
      const svc = new InquireEventsService(makeApi());
      const row = { instrumentType: 'IPLC_LC' as const, label: 'LC Balance', contract: makeContract({ naturalKey: { lcNumber: 'S001' } }), snapshot: null };
      expect(svc.balanceRowTitle(row)).toBe('LC Balance — LC S001');
    });

    it('appends "/ IB {ib}" when the contract has an IB Number', () => {
      const svc = new InquireEventsService(makeApi());
      const row = {
        instrumentType: 'IPLC_ACCEPTANCE' as const,
        label: 'Acceptance Balance',
        contract: makeContract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } }),
        snapshot: null,
      };
      expect(svc.balanceRowTitle(row)).toBe('Acceptance Balance — LC S001 / IB IB01');
    });

    it('appends "/ SG {sg}" when the contract has an SG Number', () => {
      const svc = new InquireEventsService(makeApi());
      const row = {
        instrumentType: 'SHGT' as const,
        label: 'Shipping Guarantee Balance',
        contract: makeContract({ naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } }),
        snapshot: null,
      };
      expect(svc.balanceRowTitle(row)).toBe('Shipping Guarantee Balance — LC S001 / SG G01');
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
      expect(svc.selectedEventBalances).toEqual([]);
    });
  });
});
