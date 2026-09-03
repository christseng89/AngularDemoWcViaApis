import { Subject, of, throwError } from 'rxjs';
import { InquireEventsService, InquiredEvent, LcIndexRow, computeLcIndexRow, functionForEvent, mergeAccountingEventRows } from './inquire-events.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';

/** Mirrors checker-actions.service.spec.ts's own mock-factory convention (no TestBed). */

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

/** Wraps a bare {movement, contract} pair with the ordinary 'primary'-phase defaults most test sites expect. */
function makeEvent(overrides: Partial<InquiredEvent> & Pick<InquiredEvent, 'movement' | 'contract'>): InquiredEvent {
  return { eventTime: overrides.movement.createdAt, eventStatus: overrides.movement.status, phase: 'primary', ...overrides };
}

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    resolveContract: jest.fn(() => of(makeContract())),
    listMovements: jest.fn(() => of([] as BalanceMovement[])),
    catalog: jest.fn(() => of(emptyCatalog())),
    getBalanceAsOfMovement: jest.fn(() => of(makeSnapshot())),
    getSnapshot: jest.fn(() => of(makeSnapshot())),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

describe('InquireEventsService', () => {
  describe('tightenLcBalanceFor', () => {
    it('uses the root LC create-time snapshot for an ordinary root event', () => {
      const svc = new InquireEventsService(makeApi());
      const root = makeContract({ balanceContractId: 'bc-root' });
      svc.rootContract = root;
      const event = makeEvent({
        contract: root,
        movement: makeMovement({ eventSnapshot: makeSnapshot({ tightAvailableBalance: '73000' }) }),
      });

      expect(svc.tightenLcBalanceFor(event)).toBe('73000');
    });

    it('uses the later finalize snapshot for an A4 finalize row', () => {
      const svc = new InquireEventsService(makeApi());
      const root = makeContract({ balanceContractId: 'bc-root' });
      svc.rootContract = root;
      const event = makeEvent({
        contract: root,
        phase: 'finalize',
        movement: makeMovement({
          eventSnapshot: makeSnapshot({ tightAvailableBalance: '73000' }),
          finalizeEventSnapshot: makeSnapshot({ tightAvailableBalance: '61000' }),
        }),
      });

      expect(svc.tightenLcBalanceFor(event)).toBe('61000');
    });

    it('falls back to the create snapshot for a legacy finalize row without finalizeEventSnapshot', () => {
      const svc = new InquireEventsService(makeApi());
      const root = makeContract({ balanceContractId: 'bc-root' });
      svc.rootContract = root;
      const event = makeEvent({
        contract: root,
        phase: 'finalize',
        movement: makeMovement({
          eventSnapshot: makeSnapshot({ tightAvailableBalance: '73000' }),
          finalizeEventSnapshot: null,
        }),
      });

      expect(svc.tightenLcBalanceFor(event)).toBe('73000');
    });

    it('uses rootEventSnapshot for a child-ledger event, not the child eventSnapshot', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ balanceContractId: 'bc-root' });
      const child = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT' });
      const event = makeEvent({
        contract: child,
        movement: makeMovement({
          balanceContractId: 'bc-sg',
          eventSnapshot: makeSnapshot({ tightAvailableBalance: '99999' }),
          rootEventSnapshot: makeSnapshot({ tightAvailableBalance: '42000' }),
        }),
      });

      expect(svc.tightenLcBalanceFor(event)).toBe('42000');
    });

    it('shows an em dash when legacy event data has no frozen LC snapshot value', () => {
      const svc = new InquireEventsService(makeApi());
      const root = makeContract();
      svc.rootContract = root;

      expect(svc.tightenLcBalanceFor(makeEvent({ contract: root, movement: makeMovement() }))).toBe('—');
    });

    it('shows an em dash when no root contract has been resolved', () => {
      const svc = new InquireEventsService(makeApi());

      expect(svc.tightenLcBalanceFor(makeEvent({ contract: makeContract(), movement: makeMovement() }))).toBe('—');
    });
  });

  describe('selectSide', () => {
    it('sets side, clears lcNumber, and clears any prior search results/selection', () => {
      const svc = new InquireEventsService(makeApi());
      svc.side = 'IMPORT';
      svc.lcNumber = 'S001';
      svc.rootContract = makeContract();
      svc.events = [makeEvent({ movement: makeMovement(), contract: makeContract() })];
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

    it("merges the root contract's own movements with every child ledger's (IPLC_LC -> IPLC_ACCEPTANCE + SHGT), sorted by createdAt ascending", () => {
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
      // sgMovement (earlier createdAt) sorts before rootMovement — true Event Date/Time order.
      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-sg', 'mv-root']);
      expect(svc.events.find((e) => e.movement.movementId === 'mv-sg')?.contract).toBe(sg);
    });

    /** Reproduces LC S01's real chronological order — A1 Issue, A3 Document Arrival, A8 SG Issue, A4 Sight Settlement — see InquiredEvent's own doc comment. */
    it('splits a finalized Sight-tenor Document Arrival (A3/A4) into 2 rows and sorts the WHOLE merged timeline by true Event Date/Time — reproduces LC S01 exactly: A1, A3(create), A8, A4(finalize)', () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S01' } });
      const sg = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S01', sgNumber: 'G01' } });
      const issueMovement = makeMovement({ movementId: 'mv-issue', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-17T11:30:08.658Z' });
      // A3's own frozen Create-time snapshot vs. A4's own separate finalize-time snapshot.
      const a3CreateSnapshot = makeSnapshot({ confirmedBalance: '100000', availableBalance: '77655' });
      const a4FinalizeSnapshot = makeSnapshot({ confirmedBalance: '60000', availableBalance: '60000' });
      const utilizeMovement = makeMovement({
        movementId: 'mv-utilize',
        balanceContractId: 'bc-lc',
        movementType: 'UTILIZE',
        status: 'RELEASED',
        sourceTransactionRef: 'B01',
        createdAt: '2026-08-17T11:30:35.361Z',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-17T15:37:01.932Z',
        releasedBy: 'checker1',
        releasedAt: '2026-08-17T15:37:08.014Z',
        eventSnapshot: a3CreateSnapshot,
        finalizeEventSnapshot: a4FinalizeSnapshot,
      });
      const sgMovement = makeMovement({ movementId: 'mv-sg', balanceContractId: 'bc-sg', movementType: 'ISSUE', createdAt: '2026-08-17T11:31:01.100Z' });

      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn((contractId: string) =>
          of(contractId === 'bc-lc' ? [issueMovement, utilizeMovement] : contractId === 'bc-sg' ? [sgMovement] : []),
        ),
        catalog: jest.fn((instrumentType: string) => of(instrumentType === 'SHGT' ? { items: [sg], total: 1, page: 1, pageSize: 50 } : emptyCatalog())),
      });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S01';
      svc.search();

      // 4 rows, not 3 — the UTILIZE's own later Release (A4) is no longer invisible.
      expect(svc.events.length).toBe(4);
      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-issue', 'mv-utilize', 'mv-sg', 'mv-utilize']);
      expect(svc.events.map((e) => e.phase)).toEqual(['primary', 'create', 'primary', 'finalize']);
      // eventStatus is the movement's real current status on EVERY row, never a frozen 'PENDING' — see toEventRows().
      expect(svc.events.map((e) => e.eventStatus)).toEqual(['RELEASED', 'RELEASED', 'RELEASED', 'RELEASED']);
      expect(svc.events.map((e) => e.eventTime)).toEqual([
        issueMovement.createdAt,
        utilizeMovement.createdAt,
        sgMovement.createdAt,
        utilizeMovement.releasedAt,
      ]);

      // 'create' resolves to A3 with the movement's real status/impact — same real impact 'finalize' (A4) shows.
      const createRow = svc.events.find((e) => e.phase === 'create')!;
      svc.selectEvent(createRow);
      expect(svc.selectedEventFunction?.code).toBe('A3');
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.impact).toEqual({ before: utilizeMovement.balanceBefore, after: utilizeMovement.balanceAfter });
      // A3's own snapshot stays what createMovement() captured, never A4's later finalizeEventSnapshot.
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(a3CreateSnapshot);

      const finalizeRow = svc.events.find((e) => e.phase === 'finalize')!;
      svc.selectEvent(finalizeRow);
      expect(svc.selectedEventFunction?.code).toBe('A4');
      // The 'finalize' row shows the SEPARATE finalizeEventSnapshot, not the (unchanged) eventSnapshot.
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(a4FinalizeSnapshot);
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.impact).toEqual({ before: utilizeMovement.balanceBefore, after: utilizeMovement.balanceAfter });
    });

    it('identifies both unmerged legs of one documentArrivalWithSg business event as A3S, not standalone A3 and A9', () => {
      const businessEventId = 'be-a3s-1';
      const lcEvent: InquiredEvent = {
        movement: makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', businessEventId }),
        contract: makeContract({ instrumentType: 'IPLC_LC' }),
        eventTime: '2026-09-03T00:00:00.000Z',
        eventStatus: 'PENDING',
        phase: 'primary',
      };
      const sgEvent: InquiredEvent = {
        movement: makeMovement({ movementId: 'mv-redeem', balanceContractId: 'bc-sg', movementType: 'FULL_REDEEM', businessEventId }),
        contract: makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'U01', sgNumber: 'G01' } }),
        eventTime: '2026-09-03T00:00:00.000Z',
        eventStatus: 'RELEASED',
        phase: 'primary',
      };

      const rows = mergeAccountingEventRows([lcEvent, sgEvent]);

      expect(rows).toHaveLength(2); // two economic legs remain independently visible
      expect(rows.map((row) => functionForEvent(row)?.code)).toEqual(['A3S', 'A3S']);
      expect(rows.every((row) => row.functionOverride?.code === 'A3S')).toBe(true);
    });

    it('does not reclassify unrelated standalone A3 and A9 movements without a shared compound event id', () => {
      const lcEvent: InquiredEvent = {
        movement: makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', businessEventId: null }),
        contract: makeContract({ instrumentType: 'IPLC_LC' }),
        eventTime: '2026-09-03T00:00:00.000Z',
        eventStatus: 'PENDING',
        phase: 'primary',
      };
      const sgEvent: InquiredEvent = {
        movement: makeMovement({ movementId: 'mv-redeem', balanceContractId: 'bc-sg', movementType: 'FULL_REDEEM', businessEventId: null }),
        contract: makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'U01', sgNumber: 'G01' } }),
        eventTime: '2026-09-03T00:00:01.000Z',
        eventStatus: 'RELEASED',
        phase: 'primary',
      };

      const rows = mergeAccountingEventRows([lcEvent, sgEvent]);

      expect(rows.map((row) => functionForEvent(row)?.code)).toEqual(['A3', 'A9']);
      expect(rows.every((row) => row.functionOverride === undefined)).toBe(true);
    });

    /**
     * Business-confirmed 2026-08-27 ("A6應該也只有一筆" / "都在同一筆A6 EVENT上 保持數據一致性" / "SHOW兩套帳即可")
     * — reproduces LC U01's own reported shape: A1, A3(create, EARMARKED), then A6's own separate
     * IPLC_ACCEPTANCE/CREATE — WITHOUT this merge, the referenced UTILIZE's own 'finalize' row (A6, on the
     * LC ledger) and A6's own CREATE row (on the Acceptance ledger) would both appear, reading as two rows
     * for one business event.
     */
    it("mergeAccountingEventRows() folds the UTILIZE's own finalize row into A6's own referencing CREATE row — ONE row for the cascade event, carrying the UTILIZE's own contingentAccountEntry as linkedMovement", () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE', naturalKey: { lcNumber: 'U01' } });
      const acceptance = makeContract({ balanceContractId: 'bc-acc', instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'U01', ibNumber: 'B01' } });
      const issueMovement = makeMovement({ movementId: 'mv-issue', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-27T15:00:00.000Z' });
      const lcEntry = {
        drAccount: "Documentary Credits Outstanding — Seller's Usance",
        crAccount: "Customers' Liability under DC — Seller's Usance",
        currency: 'USD',
        amount: '1000',
      };
      const utilizeMovement = makeMovement({
        movementId: 'mv-utilize',
        balanceContractId: 'bc-lc',
        movementType: 'UTILIZE',
        status: 'PENDING',
        amount: '1000',
        sourceTransactionRef: 'B01',
        createdAt: '2026-08-27T15:00:10.000Z',
        acknowledgedBy: 'checker1',
        acknowledgedAt: '2026-08-27T15:00:20.000Z',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-27T15:22:00.000Z',
        contingentAccountEntry: lcEntry,
      });
      const acceptanceEntry = {
        drAccount: "Acceptances & DPU — Customers' Liability (memo)",
        crAccount: 'Acceptances & DPU — Outstanding (memo)',
        currency: 'USD',
        amount: '1000',
      };
      const acceptanceMovement = makeMovement({
        movementId: 'mv-acceptance',
        balanceContractId: 'bc-acc',
        movementType: 'CREATE',
        status: 'PENDING',
        amount: '1000',
        createdAt: '2026-08-27T15:22:00.000Z',
        referencedTransactionId: 'mv-utilize',
        contingentAccountEntry: acceptanceEntry,
      });

      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn((contractId: string) =>
          of(contractId === 'bc-lc' ? [issueMovement, utilizeMovement] : contractId === 'bc-acc' ? [acceptanceMovement] : []),
        ),
        catalog: jest.fn((instrumentType: string) =>
          of(instrumentType === 'IPLC_ACCEPTANCE' ? { items: [acceptance], total: 1, page: 1, pageSize: 50 } : emptyCatalog()),
        ),
      });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'U01';
      svc.search();

      // 3 rows, not 4 — A1, A3(create, historical), A6(the Acceptance's own CREATE, carrying linkedMovement). No standalone 'finalize' row.
      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-issue', 'mv-utilize', 'mv-acceptance']);
      expect(svc.events.map((e) => e.phase)).toEqual(['primary', 'create', 'primary']);
      expect(svc.events.some((e) => e.phase === 'finalize')).toBe(false);

      const a6Row = svc.events.find((e) => e.movement.movementId === 'mv-acceptance')!;
      expect(a6Row.linkedMovement).toBe(utilizeMovement);
      expect(a6Row.movement.contingentAccountEntry).toEqual(acceptanceEntry);
      expect(a6Row.linkedMovement!.contingentAccountEntry).toEqual(lcEntry);

      // The 'create' (A3) row is untouched — still its own separate, historical, EARMARKED-shaped row.
      const a3Row = svc.events.find((e) => e.phase === 'create')!;
      expect(a3Row.linkedMovement).toBeUndefined();
    });

    /**
     * Business-reported gap 2026-08-28 ("A6 B4 Usance沒有顯示兩套帳務 對嗎?") — live-verified to still show
     * TWO separate "B4 · Honour / Acceptance" rows even after the A6 fix above, since B4's own compound
     * pair correlates via `businessEventId`, a structurally different mechanism from A6's own
     * `referencedTransactionId` cascade. Reproduces the live repro exactly: B1, B3(EARMARKED), then B4's
     * own two `businessEventId`-linked legs (EPLC_CONFIRMATION/ACCEPT + EPLC_ACCEPTANCE/CREATE).
     */
    it("mergeAccountingEventRows() ALSO folds B4's own primary EPLC_CONFIRMATION/ACCEPT leg into its businessEventId-linked EPLC_ACCEPTANCE/CREATE leg — same Ownership Rule, different correlation mechanism", () => {
      const root = makeContract({
        balanceContractId: 'bc-cnf',
        instrumentType: 'EPLC_CONFIRMATION',
        tenorType: 'SELLERS_USANCE',
        naturalKey: { lcNumber: 'B4-01' },
      });
      const acceptance = makeContract({ balanceContractId: 'bc-acc', instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'B4-01', ibNumber: 'E01' } });
      const issueMovement = makeMovement({ movementId: 'mv-issue', balanceContractId: 'bc-cnf', movementType: 'ISSUE', createdAt: '2026-08-28T00:00:00.000Z' });
      const cnfEntry = {
        drAccount: 'Confirmation Undertakings Outstanding — Usance',
        crAccount: 'Issuing Bank Confirmation Exposure — Usance',
        currency: 'USD',
        amount: '1000',
      };
      const acceptMovement = makeMovement({
        movementId: 'mv-accept',
        balanceContractId: 'bc-cnf',
        movementType: 'ACCEPT',
        status: 'PENDING',
        amount: '1000',
        sourceTransactionRef: 'E01',
        createdAt: '2026-08-28T00:00:10.000Z',
        businessEventId: 'be-1',
        contingentAccountEntry: cnfEntry,
      });
      const acceptanceEntry = {
        drAccount: "Confirmed Acceptances & DPU — Customers' Liability (memo)",
        crAccount: 'Confirmed Acceptances & DPU — Outstanding (memo)',
        currency: 'USD',
        amount: '1000',
      };
      const acceptanceCreate = makeMovement({
        movementId: 'mv-acceptance-create',
        balanceContractId: 'bc-acc',
        movementType: 'CREATE',
        status: 'PENDING',
        amount: '1000',
        createdAt: '2026-08-28T00:00:10.000Z',
        businessEventId: 'be-1',
        contingentAccountEntry: acceptanceEntry,
      });

      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn((contractId: string) =>
          of(contractId === 'bc-cnf' ? [issueMovement, acceptMovement] : contractId === 'bc-acc' ? [acceptanceCreate] : []),
        ),
        catalog: jest.fn((instrumentType: string) =>
          of(instrumentType === 'EPLC_ACCEPTANCE' ? { items: [acceptance], total: 1, page: 1, pageSize: 50 } : emptyCatalog()),
        ),
      });

      const svc = new InquireEventsService(api);
      svc.side = 'EXPORT';
      svc.lcNumber = 'B4-01';
      svc.search();

      // 2 rows, not 3 — B1, then ONE B4 row (the Acceptance's own CREATE, carrying the ACCEPT leg as linkedMovement).
      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-issue', 'mv-acceptance-create']);

      const b4Row = svc.events.find((e) => e.movement.movementId === 'mv-acceptance-create')!;
      expect(b4Row.linkedMovement).toBe(acceptMovement);
      expect(b4Row.movement.contingentAccountEntry).toEqual(acceptanceEntry);
      expect(b4Row.linkedMovement!.contingentAccountEntry).toEqual(cnfEntry);
    });

    it('mergeAccountingEventRows() leaves an orphaned/standalone EPLC_CONFIRMATION/ACCEPT (no matching businessEventId partner) as its own row — never silently dropped', () => {
      const root = makeContract({ balanceContractId: 'bc-cnf', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'B4-02' } });
      const acceptMovement = makeMovement({ movementId: 'mv-accept-orphan', balanceContractId: 'bc-cnf', movementType: 'ACCEPT', status: 'PENDING' });

      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn((contractId: string) => of(contractId === 'bc-cnf' ? [acceptMovement] : [])),
      });

      const svc = new InquireEventsService(api);
      svc.side = 'EXPORT';
      svc.lcNumber = 'B4-02';
      svc.search();

      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-accept-orphan']);
      expect(svc.events[0].linkedMovement).toBeUndefined();
    });

    /** Reproduces the reviewer-reported bug verbatim: "A1 ISSUE S05 -> APPROVE. A3 S05 B01 -> Submit, Checker Reject 為何出現兩筆REJECTED?" */
    it('does NOT split a REJECTED Sight IPLC_LC/UTILIZE into 2 rows — reject() sets releasedAt/releasedBy too, but this is never a real A4 finalize', () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S05' } });
      const rejectedUtilize = makeMovement({
        movementId: 'mv-utilize',
        balanceContractId: 'bc-lc',
        movementType: 'UTILIZE',
        status: 'REJECTED',
        sourceTransactionRef: 'B01',
        createdAt: '2026-08-26T09:00:00.000Z',
        releasedBy: 'checker1',
        releasedAt: '2026-08-26T09:05:00.000Z',
        reasonCode: 'MANUAL_QUEUE_REJECT',
      });

      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([rejectedUtilize])) });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S05';
      svc.search();

      expect(svc.events.length).toBe(1);
      expect(svc.events[0].phase).toBe('primary');
      expect(svc.events[0].eventStatus).toBe('REJECTED');
    });

    it('still splits a genuinely RELEASED Sight IPLC_LC/UTILIZE into 2 rows (create/finalize) — confirms the REJECTED fix above did not also break the real A4 finalize case', () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S05' } });
      const releasedUtilize = makeMovement({
        movementId: 'mv-utilize',
        balanceContractId: 'bc-lc',
        movementType: 'UTILIZE',
        status: 'RELEASED',
        sourceTransactionRef: 'B01',
        createdAt: '2026-08-26T09:00:00.000Z',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-26T09:03:00.000Z',
        releasedBy: 'checker1',
        releasedAt: '2026-08-26T09:05:00.000Z',
      });

      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([releasedUtilize])) });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S05';
      svc.search();

      expect(svc.events.length).toBe(2);
      expect(svc.events.map((e) => e.phase)).toEqual(['create', 'finalize']);
    });

    it('orders a primary-phase RELEASED event by Checker Release Time, not Maker Submit Time — reproduces the business-directed EB001/EB002 example verbatim (2026-08-26)', () => {
      // Business example: EB001 Submit 10:00 / Approve 10:30; EB002 Submit 10:10 / Approve 10:20 — EB002
      // approved FIRST despite submitting SECOND, so it must be listed first.
      const root = makeContract({ instrumentType: 'IPLC_LC' });
      const eb001 = makeMovement({
        movementId: 'mv-eb001',
        status: 'RELEASED',
        createdAt: '2026-08-26T10:00:00.000Z',
        releasedAt: '2026-08-26T10:30:00.000Z',
      });
      const eb002 = makeMovement({
        movementId: 'mv-eb002',
        status: 'RELEASED',
        createdAt: '2026-08-26T10:10:00.000Z',
        releasedAt: '2026-08-26T10:20:00.000Z',
      });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([eb001, eb002])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-eb002', 'mv-eb001']);
      expect(svc.events.map((e) => e.eventTime)).toEqual([eb002.releasedAt, eb001.releasedAt]);
    });

    it('a still-PENDING primary-phase event (no releasedAt/cancelledAt yet) keeps ordering by Maker Submit Time', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC' });
      const pending = makeMovement({ movementId: 'mv-pending', status: 'PENDING', createdAt: '2026-08-26T09:00:00.000Z', releasedAt: undefined });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([pending])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events[0].eventTime).toBe(pending.createdAt);
    });

    it("a CANCELLED movement (Delete Pending / Maker EC) produces ZERO rows — Inquire Events / Inquire Delete Pending rule (business-directed 2026-08-27, 'Deleted Pending records 不應顯示在 INQUIRE EVENTS 中'); superseded a prior test that expected cancelledAt to drive ordering here (removed 2026-08-26 event-ordering feature — that rule is now moot since the row itself never appears)", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC' });
      const pending = makeMovement({ movementId: 'mv-pending', status: 'PENDING', createdAt: '2026-08-26T09:00:00.000Z' });
      const cancelled = makeMovement({
        movementId: 'mv-cancelled',
        status: 'CANCELLED',
        createdAt: '2026-08-26T09:00:00.000Z',
        cancelledAt: '2026-08-26T09:05:00.000Z',
        releasedAt: undefined,
      });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([pending, cancelled])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events).toHaveLength(1);
      expect(svc.events[0].movement.movementId).toBe('mv-pending');
    });

    it("a 'finalize' row falls back to eventSnapshot when finalizeEventSnapshot is null (a movement created before that field existed)", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        status: 'RELEASED',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-17T14:00:00.000Z',
        releasedAt: '2026-08-17T15:00:00.000Z',
        eventSnapshot: makeSnapshot({ confirmedBalance: '55555' }),
        finalizeEventSnapshot: null,
      });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      const finalizeRow = svc.events.find((e) => e.phase === 'finalize')!;
      svc.selectEvent(finalizeRow);
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toEqual(makeSnapshot({ confirmedBalance: '55555' }));
    });

    // Widened 2026-08-27 (business-confirmed, "A6 必須... 承接並正式轉換 A3/A3S 的 EARMARKED exposure") — a
    // Usance UTILIZE that has genuinely been RELEASED (via A6's own release() cascade, see
    // BalanceService.applyReleaseSideEffects()'s own doc comment) now splits into 'create'(A3)/
    // 'finalize'(A6) rows too, same as Sight/A4 already did — it is no longer "always a single row".
    it('DOES split a genuinely RELEASED Usance-tenor UTILIZE into create(A3)/finalize(A6) rows, same as Sight/A4', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        status: 'RELEASED',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-17T14:00:00.000Z',
        releasedAt: '2026-08-17T15:00:00.000Z',
      });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.length).toBe(2);
      expect(svc.events.map((e) => e.phase).sort()).toEqual(['create', 'finalize']);
      expect(svc.events.find((e) => e.phase === 'finalize')?.eventTime).toBe('2026-08-17T15:00:00.000Z');
    });

    // Business-confirmed 2026-08-27 ("A6 Submit 時應該出兩套帳 但現在只出一套帳(ACCEPTANCE)... 出在同一個
    // 交易") — the split must fire the MOMENT A6 is Maker-Submitted, not only once genuinely RELEASED:
    // before this fix, a still-PENDING A6-in-progress UTILIZE showed as one plain "EARMARKED" row, so
    // only the Acceptance's own separate PENDING entry was visible — one set of books instead of two.
    it('splits a still-PENDING Usance UTILIZE into create(EARMARKED)/finalize(PENDING) rows the moment A6 is Maker-Submitted, before Checker Release', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        status: 'PENDING',
        acknowledgedAt: '2026-08-27T13:00:00.000Z',
        acknowledgedBy: 'checker1',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-27T14:00:00.000Z',
        releasedAt: null,
      });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.length).toBe(2);
      const createRow = svc.events.find((e) => e.phase === 'create')!;
      const finalizeRow = svc.events.find((e) => e.phase === 'finalize')!;
      expect(createRow.eventStatus).toBe('PENDING');
      expect(finalizeRow.eventStatus).toBe('PENDING');
      // finalize row falls back to makerSubmittedAt for its own eventTime — releasedAt doesn't exist yet.
      expect(finalizeRow.eventTime).toBe('2026-08-27T14:00:00.000Z');
    });

    it('a REJECTED A4/A6 attempt still splits (makerSubmittedAt survives reject()) — consistent with Maker Queue, which already shows a rejected A4/A6 row the same way', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        status: 'REJECTED',
        acknowledgedAt: '2026-08-27T13:00:00.000Z',
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-27T14:00:00.000Z',
        releasedBy: 'checker1',
        releasedAt: '2026-08-27T15:00:00.000Z',
      });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.length).toBe(2);
      expect(svc.events.find((e) => e.phase === 'finalize')?.eventStatus).toBe('REJECTED');
    });

    it('still does NOT split a Usance UTILIZE whose parent contract never declared an explicit tenorType (null) — legacy Business Case Runner state', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: null });
      const utilizeMovement = makeMovement({ movementType: 'UTILIZE', status: 'RELEASED', releasedAt: '2026-08-17T15:00:00.000Z' });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.length).toBe(1);
      expect(svc.events[0].phase).toBe('primary');
    });

    it("does NOT split a still-PENDING Sight UTILIZE — Document Arrival hasn't been Sight-Settled yet, so there is only the one row", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const utilizeMovement = makeMovement({ movementType: 'UTILIZE', status: 'PENDING', releasedAt: null });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.length).toBe(1);
      expect(svc.events[0].phase).toBe('primary');
      expect(svc.events[0].eventStatus).toBe('PENDING');
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

    it("a child catalog() call itself failing (e.g. network error) is swallowed (catchError -> []) — the root's own movements still come back", () => {
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

  /** Side-agnostic — mostly exercises Import LC; a dedicated Export case covers deriveLcAmount()'s side-specific AMEND branching. */
  describe('LC Master Records Index (loadIndex / searchIndex / paging / selectLcFromIndex / backToIndex)', () => {
    function s001(): BalanceContract {
      return makeContract({
        balanceContractId: 'bc-s001',
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'S001' },
        status: 'ACTIVE',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
      });
    }
    function s002(): BalanceContract {
      return makeContract({
        balanceContractId: 'bc-s002',
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'S002' },
        status: 'ACTIVE',
        currency: 'EUR',
        tenorType: 'SIGHT',
      });
    }
    function sgUnderS001(): BalanceContract {
      return makeContract({ balanceContractId: 'bc-sg-s001', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
    }

    it("loadIndex() populates indexRows — lcAmount sums RELEASED ISSUE(+)/AMEND_INCREASE(+)/AMEND_DECREASE(-) only (a PENDING UTILIZE contributes nothing), availableBalance comes from getSnapshot(), and lastEventAt is the max eventTime across the root AND every child ledger (a later SHGT event wins over the root's own latest movement)", () => {
      const issueS001 = makeMovement({
        movementId: 'mv-issue-1',
        balanceContractId: 'bc-s001',
        movementType: 'ISSUE',
        amount: '100000',
        createdAt: '2026-08-01T00:00:00.000Z',
      });
      const incS001 = makeMovement({
        movementId: 'mv-inc-1',
        balanceContractId: 'bc-s001',
        movementType: 'AMEND_INCREASE',
        amount: '20000',
        createdAt: '2026-08-02T00:00:00.000Z',
      });
      const decS001 = makeMovement({
        movementId: 'mv-dec-1',
        balanceContractId: 'bc-s001',
        movementType: 'AMEND_DECREASE',
        amount: '10000',
        createdAt: '2026-08-03T00:00:00.000Z',
      });
      const pendingUtilizeS001 = makeMovement({
        movementId: 'mv-utl-1',
        balanceContractId: 'bc-s001',
        movementType: 'UTILIZE',
        amount: '5000',
        status: 'PENDING',
        createdAt: '2026-08-04T00:00:00.000Z',
      });
      // A RELEASED but non-face-amount movementType — proves deriveLcAmount() filters by type too, not just status.
      const releasedUtilizeS001 = makeMovement({
        movementId: 'mv-utl-2',
        balanceContractId: 'bc-s001',
        movementType: 'UTILIZE',
        amount: '7000',
        status: 'RELEASED',
        createdAt: '2026-08-04T12:00:00.000Z',
      });
      const sgIssue = makeMovement({
        movementId: 'mv-sg-issue',
        balanceContractId: 'bc-sg-s001',
        movementType: 'ISSUE',
        amount: '12345',
        createdAt: '2026-08-05T00:00:00.000Z',
      });
      const issueS002 = makeMovement({
        movementId: 'mv-issue-2',
        balanceContractId: 'bc-s002',
        movementType: 'ISSUE',
        amount: '9999',
        createdAt: '2026-07-01T00:00:00.000Z',
      });

      const api = makeApi({
        catalog: jest.fn((instrumentType: string, _status?: string, _q?: string, _page?: number, _pageSize?: number, lcNumber?: string) => {
          if (instrumentType === 'IPLC_LC') return of({ items: [s001(), s002()], total: 2, page: 1, pageSize: 10 });
          if (instrumentType === 'SHGT' && lcNumber === 'S001') return of({ items: [sgUnderS001()], total: 1, page: 1, pageSize: 50 });
          return of(emptyCatalog());
        }),
        listMovements: jest.fn((contractId: string) =>
          of(
            contractId === 'bc-s001'
              ? [issueS001, incS001, decS001, pendingUtilizeS001, releasedUtilizeS001]
              : contractId === 'bc-sg-s001'
                ? [sgIssue]
                : contractId === 'bc-s002'
                  ? [issueS002]
                  : [],
          ),
        ),
        getSnapshot: jest.fn((id: string) =>
          of(
            makeSnapshot({
              balanceContractId: id,
              availableBalance: id === 'bc-s001' ? '77000' : '5000',
              tightAvailableBalance: id === 'bc-s001' ? '65000' : '4000',
            }),
          ),
        ),
      });

      const svc = new InquireEventsService(api);
      svc.loadIndex(1);

      expect(svc.indexLoading).toBe(false);
      expect(svc.indexPaging.total).toBe(2);
      expect(svc.indexRows.length).toBe(2);

      const row1 = svc.indexRows.find((r) => r.contract.naturalKey.lcNumber === 'S001')!;
      expect(row1.lcAmount).toBe('110000'); // 100000 + 20000 - 10000; neither UTILIZE counts.
      expect(row1.availableBalance).toBe('77000');
      expect(row1.tightLcBalance).toBe('65000');
      expect(row1.currency).toBe('USD');
      expect(row1.status).toBe('ACTIVE');
      expect(row1.tenorType).toBe("Buyer's Usance");
      expect(row1.lastEventAt).toBe(sgIssue.createdAt); // later than S001's own latest movement.

      const row2 = svc.indexRows.find((r) => r.contract.naturalKey.lcNumber === 'S002')!;
      expect(row2.lcAmount).toBe('9999');
      expect(row2.availableBalance).toBe('5000');
      expect(row2.tightLcBalance).toBe('4000');
      expect(row2.tenorType).toBe('Sight');
      expect(row2.lastEventAt).toBe(issueS002.createdAt);
    });

    // Bug found live 2026-08-29 (user-reported, Inquire Delete Pending catalog showing "LC Amount 0 /
    // Last Event Date/Time —" for a real cancelled LC) — a root ISSUE Delete-Pending'd (CANCELLED) before
    // ever being Released is exactly the shape Inquire Delete Pending's own LC Catalog exists to surface
    // (InquireEventsService's own catalog never passes a CANCELLED contract here at all, so this case was
    // previously unexercised for computeLcIndexRow()). toEventRows() deliberately excludes CANCELLED from
    // the true Event Timeline, which left `root`/`allEvents` empty — lastEventAt fell back to `null`
    // ("—" in the template) even though a real Delete Pending action clearly happened.
    it('computeLcIndexRow() (shared with Inquire Delete Pending): a contract whose ONLY movement is CANCELLED still shows a real Last Event Date/Time, not null — lcAmount correctly stays 0 (never confirmed)', () => {
      const cancelledIssue = makeMovement({
        movementId: 'mv-cancelled-issue',
        balanceContractId: 'bc-s001',
        movementType: 'ISSUE',
        amount: '80000',
        status: 'CANCELLED',
        createdAt: '2026-08-01T00:00:00.000Z',
        cancelledAt: '2026-08-01T01:00:00.000Z',
      });
      const api = makeApi({
        catalog: jest.fn(() => of(emptyCatalog())), // no child SHGT contracts under this LC
        listMovements: jest.fn(() => of([cancelledIssue])),
        getSnapshot: jest.fn(() => of(null)),
      });

      let row: LcIndexRow | undefined;
      computeLcIndexRow(api, s001(), 'IMPORT').subscribe((r) => (row = r));

      expect(row!.lastEventAt).toBe('2026-08-01T01:00:00.000Z'); // NOT null — the Delete Pending action's own timestamp
      expect(row!.lcAmount).toBe('0'); // 'released' (default) mode — still correctly excludes CANCELLED, nothing was ever confirmed
    });

    // User-directed follow-up 2026-08-29 ("是我看錯了 Inquire Delete Pending Amount 是當筆交易的輸入金額嗎"
    // -> "YES 這會比較USER FRIENDLY一些") — the RELEASED-only figure above is always "0" for exactly the
    // shape Inquire Delete Pending's own catalog surfaces, telling a reviewer nothing about what was
    // actually typed. `amountSource: 'input'` shows the typed amount instead, regardless of status.
    it("computeLcIndexRow(..., 'input'): Inquire Delete Pending's own amountSource shows the typed ISSUE amount even though it was CANCELLED, not the RELEASED-only 0", () => {
      const cancelledIssue = makeMovement({
        movementId: 'mv-cancelled-issue-2',
        balanceContractId: 'bc-s001',
        movementType: 'ISSUE',
        amount: '80000',
        status: 'CANCELLED',
        createdAt: '2026-08-01T00:00:00.000Z',
        cancelledAt: '2026-08-01T01:00:00.000Z',
      });
      const api = makeApi({
        catalog: jest.fn(() => of(emptyCatalog())),
        listMovements: jest.fn(() => of([cancelledIssue])),
        getSnapshot: jest.fn(() => of(null)),
      });

      let row: LcIndexRow | undefined;
      computeLcIndexRow(api, s001(), 'IMPORT', 'input').subscribe((r) => (row = r));

      expect(row!.lcAmount).toBe('80000'); // the typed amount, unconditional on status
    });

    it("computeLcIndexRow(..., 'input') falls back to '0' when no ISSUE movement exists at all", () => {
      const api = makeApi({
        catalog: jest.fn(() => of(emptyCatalog())),
        listMovements: jest.fn(() => of([])),
        getSnapshot: jest.fn(() => of(null)),
      });

      let row: LcIndexRow | undefined;
      computeLcIndexRow(api, s001(), 'IMPORT', 'input').subscribe((r) => (row = r));

      expect(row!.lcAmount).toBe('0');
    });

    /** EPLC_CONFIRMATION has no AMEND_INCREASE/AMEND_DECREASE split — direction is the sign of AMEND's own amount. */
    it('loadIndex() on the Export Confirmed side derives lcAmount from ISSUE + signed AMEND (not AMEND_INCREASE/AMEND_DECREASE, which never apply to EPLC_CONFIRMATION)', () => {
      const confirmation = makeContract({
        balanceContractId: 'bc-cnf01',
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CNF01' },
        status: 'ACTIVE',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
      });
      const issue = makeMovement({
        movementId: 'mv-cnf-issue',
        balanceContractId: 'bc-cnf01',
        movementType: 'ISSUE',
        amount: '100000',
        createdAt: '2026-08-01T00:00:00.000Z',
      });
      const amendIncrease = makeMovement({
        movementId: 'mv-cnf-amend-inc',
        balanceContractId: 'bc-cnf01',
        movementType: 'AMEND',
        amount: '20000',
        createdAt: '2026-08-02T00:00:00.000Z',
      });
      const amendDecrease = makeMovement({
        movementId: 'mv-cnf-amend-dec',
        balanceContractId: 'bc-cnf01',
        movementType: 'AMEND',
        amount: '-15000',
        createdAt: '2026-08-03T00:00:00.000Z',
      });
      // A PENDING AMEND must not contribute (same RELEASED-only rule as Import).
      const pendingAmend = makeMovement({
        movementId: 'mv-cnf-amend-pending',
        balanceContractId: 'bc-cnf01',
        movementType: 'AMEND',
        amount: '99999',
        status: 'PENDING',
        createdAt: '2026-08-04T00:00:00.000Z',
      });

      const api = makeApi({
        catalog: jest.fn((instrumentType: string) =>
          of(instrumentType === 'EPLC_CONFIRMATION' ? { items: [confirmation], total: 1, page: 1, pageSize: 10 } : emptyCatalog()),
        ),
        listMovements: jest.fn(() => of([issue, amendIncrease, amendDecrease, pendingAmend])),
        getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '105000' }))),
      });

      const svc = new InquireEventsService(api);
      svc.side = 'EXPORT';
      svc.loadIndex(1);

      expect(svc.indexRows.length).toBe(1);
      expect(svc.indexRows[0].lcAmount).toBe('105000'); // 100000 + 20000 - 15000; PENDING AMEND excluded.
      expect(svc.indexRows[0].contract.naturalKey.lcNumber).toBe('CNF01');
      // Export labels SELLERS_USANCE as plain "Usance" (tenorTypeLabel()'s side-aware rule), not Import's "Seller's Usance".
      expect(svc.indexRows[0].tenorType).toBe('Usance');
    });

    it('a getSnapshot() failure for one row degrades to a placeholder Available Balance rather than failing the whole index', () => {
      const issue = makeMovement({ movementType: 'ISSUE', amount: '1000', createdAt: '2026-08-01T00:00:00.000Z' });
      const api = makeApi({
        catalog: jest.fn(() => of({ items: [s001()], total: 1, page: 1, pageSize: 10 })),
        listMovements: jest.fn(() => of([issue])),
        getSnapshot: jest.fn(() => throwError(() => new Error('boom'))),
      });
      const svc = new InquireEventsService(api);
      svc.loadIndex(1);
      expect(svc.indexRows.length).toBe(1);
      expect(svc.indexRows[0].availableBalance).toBe('—');
      expect(svc.indexRows[0].tightLcBalance).toBe('—');
      expect(svc.indexRows[0].lcAmount).toBe('1000');
    });

    it('a row whose instrumentType has no child ledger types (childInstrumentTypesOf() returns []) skips the child fan-out entirely and derives lastEventAt from its own movements alone', () => {
      const noChildContract = makeContract({ balanceContractId: 'bc-nc', instrumentType: 'EPLC_LC', naturalKey: { lcNumber: 'NC01' } });
      const issue = makeMovement({ balanceContractId: 'bc-nc', movementType: 'ISSUE', amount: '4000', createdAt: '2026-08-01T00:00:00.000Z' });
      const catalog = jest.fn(() => of({ items: [noChildContract], total: 1, page: 1, pageSize: 10 }));
      const api = makeApi({ catalog, listMovements: jest.fn(() => of([issue])) });
      const svc = new InquireEventsService(api);

      svc.loadIndex(1);

      expect(svc.indexRows.length).toBe(1);
      expect(svc.indexRows[0].lastEventAt).toBe(issue.createdAt);
      // Only one catalog() call — no child-catalog lookups attempted.
      expect(catalog).toHaveBeenCalledTimes(1);
    });

    // 2026-08-22, "U03 應該是CLOSING狀態" — ContractStatus itself stays ACTIVE the whole time a CLOSE
    // movement is only Maker-Submitted (see closeEligibility.ts/markClosed() — only Release flips it),
    // so loadIndexRow() must derive closingPending from the root movements themselves, not from
    // contract.status. Deliberately a single describe covering all three status outcomes together, since
    // they're one state machine (SUBMIT -> CLOSING -> APPROVE/CLOSED or REJECT/back to ACTIVE), not three
    // unrelated facts.
    describe('closingPending (LC Master Records Index — CLOSING while a Close movement is genuinely still PENDING)', () => {
      const noChildContract = () => makeContract({ balanceContractId: 'bc-nc', instrumentType: 'EPLC_LC', naturalKey: { lcNumber: 'NC01' }, status: 'ACTIVE' });

      it('a still-PENDING CLOSE movement -> closingPending true, even though contract.status itself already reads ACTIVE', () => {
        const contract = noChildContract();
        const issue = makeMovement({ movementId: 'mv-issue', balanceContractId: 'bc-nc', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });
        const close = makeMovement({
          movementId: 'mv-close',
          balanceContractId: 'bc-nc',
          movementType: 'CLOSE',
          status: 'PENDING',
          createdAt: '2026-08-02T00:00:00.000Z',
        });
        const api = makeApi({
          catalog: jest.fn(() => of({ items: [contract], total: 1, page: 1, pageSize: 10 })),
          listMovements: jest.fn(() => of([issue, close])),
        });
        const svc = new InquireEventsService(api);

        svc.loadIndex(1);

        expect(svc.indexRows[0].status).toBe('ACTIVE');
        expect(svc.indexRows[0].closingPending).toBe(true);
      });

      it('once the Checker Releases it, contract.status itself flips to CLOSED — closingPending is false (CLOSED already says everything CLOSING was foreshadowing)', () => {
        const contract = makeContract({ balanceContractId: 'bc-nc', instrumentType: 'EPLC_LC', naturalKey: { lcNumber: 'NC01' }, status: 'CLOSED' });
        const close = makeMovement({ movementId: 'mv-close', balanceContractId: 'bc-nc', movementType: 'CLOSE', status: 'RELEASED' });
        const api = makeApi({ catalog: jest.fn(() => of({ items: [contract], total: 1, page: 1, pageSize: 10 })), listMovements: jest.fn(() => of([close])) });
        const svc = new InquireEventsService(api);

        svc.loadIndex(1);

        expect(svc.indexRows[0].status).toBe('CLOSED');
        expect(svc.indexRows[0].closingPending).toBe(false);
      });

      it('the Checker REJECTs the Close instead -> contract.status stays ACTIVE and closingPending reverts to false (the row shows plain ACTIVE again, not stuck on CLOSING)', () => {
        const contract = noChildContract();
        const close = makeMovement({ movementId: 'mv-close', balanceContractId: 'bc-nc', movementType: 'CLOSE', status: 'REJECTED' });
        const api = makeApi({ catalog: jest.fn(() => of({ items: [contract], total: 1, page: 1, pageSize: 10 })), listMovements: jest.fn(() => of([close])) });
        const svc = new InquireEventsService(api);

        svc.loadIndex(1);

        expect(svc.indexRows[0].status).toBe('ACTIVE');
        expect(svc.indexRows[0].closingPending).toBe(false);
      });

      it('B6 (EPLC_CONFIRMATION, Export side) — the same still-PENDING-CLOSE detection applies, confirming this is not an Import-only (A10) fix', () => {
        const confirmation = makeContract({
          balanceContractId: 'bc-cnf',
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: 'CNF01' },
          status: 'ACTIVE',
        });
        const issue = makeMovement({ movementId: 'mv-cnf-issue', balanceContractId: 'bc-cnf', movementType: 'ISSUE', createdAt: '2026-08-01T00:00:00.000Z' });
        const close = makeMovement({
          movementId: 'mv-cnf-close',
          balanceContractId: 'bc-cnf',
          movementType: 'CLOSE',
          status: 'PENDING',
          createdAt: '2026-08-02T00:00:00.000Z',
        });
        // EPLC_CONFIRMATION has real child instrument types (EPLC_EXAMINATION/EPLC_ACCEPTANCE/...) — the
        // catalog() mock must return the root contract only for the root's OWN instrumentType, empty for
        // every child-fan-out call, or childMovementsOf$() would wrongly treat this same contract as its
        // own child too.
        const catalog = jest.fn((instrumentType: string) =>
          of(instrumentType === 'EPLC_CONFIRMATION' ? { items: [confirmation], total: 1, page: 1, pageSize: 10 } : emptyCatalog()),
        );
        const api = makeApi({ catalog, listMovements: jest.fn(() => of([issue, close])) });
        const svc = new InquireEventsService(api);
        svc.side = 'EXPORT';

        svc.loadIndex(1);

        expect(svc.indexRows[0].status).toBe('ACTIVE');
        expect(svc.indexRows[0].closingPending).toBe(true);
      });

      it('no CLOSE movement at all -> closingPending false (the ordinary, overwhelmingly common case)', () => {
        const contract = noChildContract();
        const issue = makeMovement({ movementId: 'mv-issue', balanceContractId: 'bc-nc', movementType: 'ISSUE' });
        const api = makeApi({ catalog: jest.fn(() => of({ items: [contract], total: 1, page: 1, pageSize: 10 })), listMovements: jest.fn(() => of([issue])) });
        const svc = new InquireEventsService(api);

        svc.loadIndex(1);

        expect(svc.indexRows[0].closingPending).toBe(false);
      });
    });

    it('an empty page (no matching contracts) clears indexRows without any per-row fan-out calls', () => {
      const api = makeApi({ catalog: jest.fn(() => of(emptyCatalog())) });
      const svc = new InquireEventsService(api);
      svc.indexRows = [
        {
          contract: s001(),
          currency: 'USD',
          tenorType: "Buyer's Usance",
          lcAmount: '1',
          availableBalance: '1',
          tightLcBalance: '1',
          status: 'ACTIVE',
          lastEventAt: null,
          closingPending: false,
        },
      ];
      svc.loadIndex(1);
      expect(svc.indexRows).toEqual([]);
      expect(svc.indexLoading).toBe(false);
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('a catalog() failure sets indexError, clears indexRows, and zeroes the total', () => {
      const api = makeApi({ catalog: jest.fn(() => throwError(() => ({ error: { message: 'network down' } }))) });
      const svc = new InquireEventsService(api);
      svc.loadIndex(1);
      expect(svc.indexLoading).toBe(false);
      expect(svc.indexError).toBe('network down');
      expect(svc.indexErrorCause).toEqual({ error: { message: 'network down' } });
      expect(svc.indexRows).toEqual([]);
      expect(svc.indexPaging.total).toBe(0);
    });

    it('clears a prior Index transport error before retrying', () => {
      const catalog = jest.fn().mockReturnValueOnce(throwError(() => ({ status: 0, message: 'network' }))).mockReturnValueOnce(of(emptyCatalog()));
      const svc = new InquireEventsService(makeApi({ catalog }));

      svc.loadIndex(1);
      expect(svc.indexErrorCause).not.toBeNull();
      svc.loadIndex(1);
      expect(svc.indexError).toBeNull();
      expect(svc.indexErrorCause).toBeNull();
    });

    it('searchIndex() resets to page 1 and passes the trimmed indexSearch as the catalog() q param', () => {
      const catalog = jest.fn(() => of(emptyCatalog()));
      const api = makeApi({ catalog });
      const svc = new InquireEventsService(api);
      svc.indexPaging.page = 3;
      svc.indexSearch = '  S0  ';

      svc.searchIndex();

      expect(catalog).toHaveBeenCalledWith('IPLC_LC', undefined, 'S0', 1, 10, undefined, undefined, undefined, true);
    });

    it('nextIndexPage()/prevIndexPage() re-fetch the target page (server-paginated, unlike eventsPaging) and are no-ops at the boundaries', () => {
      const catalog = jest.fn((_instrumentType: string, _status?: string, _q?: string, page = 1) => of({ items: [], total: 25, page, pageSize: 10 }));
      const api = makeApi({ catalog });
      const svc = new InquireEventsService(api);
      svc.loadIndex(1);
      catalog.mockClear();

      svc.nextIndexPage();
      expect(catalog).toHaveBeenCalledWith('IPLC_LC', undefined, undefined, 2, 10, undefined, undefined, undefined, true);

      svc.prevIndexPage();
      expect(catalog).toHaveBeenLastCalledWith('IPLC_LC', undefined, undefined, 1, 10, undefined, undefined, undefined, true);

      catalog.mockClear();
      svc.prevIndexPage(); // already on page 1 — no-op, no extra fetch
      expect(catalog).not.toHaveBeenCalled();
    });

    it('selectLcFromIndex() resolves the picked row directly (no resolveContract round-trip), switches to EVENTS view, and loads its Events timeline — without touching indexRows/indexPaging/indexSearch', () => {
      const contract = s001();
      const issue = makeMovement({ balanceContractId: 'bc-s001', movementType: 'ISSUE' });
      const api = makeApi({ listMovements: jest.fn(() => of([issue])) });
      const svc = new InquireEventsService(api);
      svc.indexRows = [
        {
          contract,
          currency: 'USD',
          tenorType: "Buyer's Usance",
          lcAmount: '100',
          availableBalance: '100',
          tightLcBalance: '100',
          status: 'ACTIVE',
          lastEventAt: null,
          closingPending: false,
        },
      ];
      svc.indexPaging.page = 2;
      svc.indexPaging.total = 15;
      svc.indexSearch = 'S0';

      svc.selectLcFromIndex(contract);

      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(svc.rootContract).toBe(contract);
      expect(svc.indexView).toBe('EVENTS');
      expect(svc.events.length).toBe(1);
      // Preserved across the round trip.
      expect(svc.indexRows.length).toBe(1);
      expect(svc.indexPaging.page).toBe(2);
      expect(svc.indexPaging.total).toBe(15);
      expect(svc.indexSearch).toBe('S0');
    });

    it('backToIndex() only flips indexView back to INDEX — indexRows/indexPaging/indexSearch are untouched', () => {
      const svc = new InquireEventsService(makeApi());
      svc.indexView = 'EVENTS';
      svc.indexRows = [
        {
          contract: s001(),
          currency: 'USD',
          tenorType: "Buyer's Usance",
          lcAmount: '1',
          availableBalance: '1',
          tightLcBalance: '1',
          status: 'ACTIVE',
          lastEventAt: null,
          closingPending: false,
        },
      ];
      svc.indexPaging.page = 4;
      svc.indexSearch = 'kept';

      svc.backToIndex();

      expect(svc.indexView).toBe('INDEX');
      expect(svc.indexRows.length).toBe(1);
      expect(svc.indexPaging.page).toBe(4);
      expect(svc.indexSearch).toBe('kept');
    });

    it('selectSide() resets indexView/indexSearch and auto-loads the index on BOTH sides (2026-08-19, extended from Import-only to Export Confirmed the same day)', () => {
      const catalog = jest.fn(() => of(emptyCatalog()));
      const api = makeApi({ catalog });
      const svc = new InquireEventsService(api);
      svc.indexView = 'EVENTS';
      svc.indexSearch = 'stale';

      svc.selectSide('EXPORT');
      expect(svc.indexView).toBe('INDEX');
      expect(svc.indexSearch).toBe('');
      expect(catalog).toHaveBeenCalledWith('EPLC_CONFIRMATION', undefined, undefined, 1, 10, undefined, undefined, undefined, true);

      catalog.mockClear();
      svc.indexView = 'EVENTS';
      svc.indexSearch = 'stale';

      svc.selectSide('IMPORT');
      expect(svc.indexView).toBe('INDEX');
      expect(svc.indexSearch).toBe('');
      expect(catalog).toHaveBeenCalledWith('IPLC_LC', undefined, undefined, 1, 10, undefined, undefined, undefined, true);
    });

    it('indexEntityLabel reflects the current side ("Import LC" / "Export Confirmed LC") — drives the Index/heading/hint text', () => {
      const svc = new InquireEventsService(makeApi());
      svc.side = 'IMPORT';
      expect(svc.indexEntityLabel).toBe('Import LC');
      svc.side = 'EXPORT';
      expect(svc.indexEntityLabel).toBe('Export Confirmed LC');
    });

    // "Search — No Match Message" rule (business-directed, applies to every Search button)
    describe('indexEmptyMessage', () => {
      it('reads "{query} not found" once a filter was typed', () => {
        const svc = new InquireEventsService(makeApi());
        svc.indexSearch = '  AAA  ';
        expect(svc.indexEmptyMessage).toBe('AAA not found');
      });

      it('falls back to the generic "No ... Master Records found." wording when no filter was typed', () => {
        const svc = new InquireEventsService(makeApi());
        svc.side = 'IMPORT';
        svc.indexSearch = '';
        expect(svc.indexEmptyMessage).toBe('No Import LC Master Records found.');
        svc.side = 'EXPORT';
        expect(svc.indexEmptyMessage).toBe('No Export Confirmed LC Master Records found.');
      });
    });

    // Stylesheet unification rule (business-directed, "顯示STYLESHEET 應該統一 參考CHECKER")
    describe('indexEmptyIsError', () => {
      it('is true once a filter was typed, false otherwise', () => {
        const svc = new InquireEventsService(makeApi());
        expect(svc.indexEmptyIsError).toBe(false);
        svc.indexSearch = 'AAA';
        expect(svc.indexEmptyIsError).toBe(true);
      });
    });
  });

  // Client-side windowing over the already-loaded events array (pageSize 10, so 25 events -> 3 pages).
  describe('pagedEvents / eventsPaging (client-side pagination)', () => {
    function make25EventsService(): InquireEventsService {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC' });
      const rootMovements = Array.from({ length: 25 }, (_, i) =>
        makeMovement({ movementId: `mv-${i}`, movementType: 'ISSUE', createdAt: `2026-08-01T00:${String(i).padStart(2, '0')}:00.000Z` }),
      );
      const api = makeApi({
        resolveContract: jest.fn(() => of(root)),
        listMovements: jest.fn(() => of(rootMovements)),
      });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();
      return svc;
    }

    it('pagedEvents returns the first pageSize (10) events on page 1, and totalPages reflects the full events.length', () => {
      const svc = make25EventsService();
      expect(svc.events.length).toBe(25);
      expect(svc.eventsPaging.page).toBe(1);
      expect(svc.eventsPaging.total).toBe(25);
      expect(svc.eventsPaging.totalPages).toBe(3);
      expect(svc.pagedEvents.length).toBe(10);
      expect(svc.pagedEvents.map((e) => e.movement.movementId)).toEqual(['mv-0', 'mv-1', 'mv-2', 'mv-3', 'mv-4', 'mv-5', 'mv-6', 'mv-7', 'mv-8', 'mv-9']);
    });

    it('nextEventsPage()/prevEventsPage() move between pages; the last page only has the remainder (5 events)', () => {
      const svc = make25EventsService();
      svc.nextEventsPage();
      expect(svc.eventsPaging.page).toBe(2);
      expect(svc.pagedEvents.map((e) => e.movement.movementId)).toEqual([
        'mv-10',
        'mv-11',
        'mv-12',
        'mv-13',
        'mv-14',
        'mv-15',
        'mv-16',
        'mv-17',
        'mv-18',
        'mv-19',
      ]);

      svc.nextEventsPage();
      expect(svc.eventsPaging.page).toBe(3);
      expect(svc.pagedEvents.length).toBe(5);
      expect(svc.pagedEvents.map((e) => e.movement.movementId)).toEqual(['mv-20', 'mv-21', 'mv-22', 'mv-23', 'mv-24']);

      // Already on the last page — nextEventsPage() is a no-op.
      svc.nextEventsPage();
      expect(svc.eventsPaging.page).toBe(3);

      svc.prevEventsPage();
      expect(svc.eventsPaging.page).toBe(2);
    });

    it('prevEventsPage() on page 1 is a no-op', () => {
      const svc = make25EventsService();
      svc.prevEventsPage();
      expect(svc.eventsPaging.page).toBe(1);
    });

    it('a fresh search() resets eventsPaging back to page 1 with the new total — no stale page/total left behind from a prior search', () => {
      const root = makeContract({ balanceContractId: 'bc-lc' });
      const twentyFive = Array.from({ length: 25 }, (_, i) => makeMovement({ movementId: `mv-${i}` }));
      const two = [makeMovement({ movementId: 'mv-a' }), makeMovement({ movementId: 'mv-b' })];
      const listMovements = jest.fn().mockReturnValueOnce(of(twentyFive)).mockReturnValueOnce(of(two));
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements });
      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();
      svc.nextEventsPage();
      expect(svc.eventsPaging.page).toBe(2);

      // A second search must not leave stale page/total behind.
      svc.search();

      expect(svc.eventsPaging.page).toBe(1);
      expect(svc.eventsPaging.total).toBe(2);
      expect(svc.eventsPaging.totalPages).toBe(1);
    });
  });

  // Extracted from selectEvent()'s own resolution logic so the merged table can show it per row too.
  describe('functionFor', () => {
    it('resolves a primary-phase event via the generic Strategy-table lookup (A1 — IPLC_LC/ISSUE)', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      expect(svc.functionFor(makeEvent({ movement: makeMovement({ movementType: 'ISSUE' }), contract }))?.code).toBe('A1');
    });

    it("resolves a 'finalize' phase Sight UTILIZE to A4, not A3 (payExistingUtilizeFunctionFor(), not the generic resolver)", () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const finalizeEvent: InquiredEvent = {
        movement: makeMovement({ movementType: 'UTILIZE', status: 'RELEASED' }),
        contract,
        eventTime: '2026-08-18T00:00:00.000Z',
        eventStatus: 'RELEASED',
        phase: 'finalize',
      };
      expect(svc.functionFor(finalizeEvent)?.code).toBe('A4');
    });

    it("resolves the SAME Sight UTILIZE's own 'create' phase to A3 — the generic resolver, unaffected by phase", () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const createEvent: InquiredEvent = {
        movement: makeMovement({ movementType: 'UTILIZE' }),
        contract,
        eventTime: '2026-08-18T00:00:00.000Z',
        eventStatus: 'PENDING',
        phase: 'create',
      };
      expect(svc.functionFor(createEvent)?.code).toBe('A3');
    });

    it('returns undefined for legacy data no current function produces', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'EPLC_EXAMINATION' });
      expect(svc.functionFor(makeEvent({ movement: makeMovement({ movementType: 'AMEND' }), contract }))).toBeUndefined();
    });
  });

  // F1, user-reported live-testing gap: EXPIRE/REVERSAL have no TransactionFunction of their own (never
  // human-selectable), so functionFor() always returns undefined for them — systemLabelFor() is the
  // plain-text fallback the Function column checks before falling back further to a bare "—".
  describe('systemLabelFor', () => {
    it('labels EXPIRE as AUTO EXPIRY', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      expect(svc.systemLabelFor(makeEvent({ movement: makeMovement({ movementType: 'EXPIRE' }), contract }))).toBe('AUTO EXPIRY');
    });

    it('labels REVERSAL distinctly, so a linked Reopen/Extension reversal never renders as a bare dash', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      expect(svc.systemLabelFor(makeEvent({ movement: makeMovement({ movementType: 'REVERSAL' }), contract }))).toBe('REVERSAL (system, linked)');
    });

    it('returns null for a movementType that already resolves via functionFor() (REOPEN — A11/B7) — no fallback needed', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      expect(svc.systemLabelFor(makeEvent({ movement: makeMovement({ movementType: 'REOPEN' }), contract }))).toBeNull();
    });

    it('returns null for genuinely unresolvable legacy data too, same as functionFor()', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'EPLC_EXAMINATION' });
      expect(svc.systemLabelFor(makeEvent({ movement: makeMovement({ movementType: 'AMEND' }), contract }))).toBeNull();
    });
  });

  describe('selectEvent', () => {
    it('resolves the producing function, reconstructs a read-only field set, and stashes a fresh FormGroup', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tolerancePct: '10', tenorType: 'SIGHT', tenorDays: 0, expiryDate: '2026-12-31' });
      const movement = makeMovement({ movementType: 'ISSUE', amount: '50000', currency: 'USD', sourceTransactionRef: null });

      svc.selectEvent(makeEvent({ movement, contract }));

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

    it("carries the saved expiryDate onto the model, so A1/B1's Original Transaction Screen shows the saved date instead of the field's empty placeholder (reviewer-reported 2026-08-26)", () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', expiryDate: '2026-12-31' });
      const movement = makeMovement({ movementType: 'ISSUE' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventFunction?.code).toBe('A1');
      expect(svc.selectedEventModel.expiryDate).toBe('2026-12-31');
    });

    it('leaves expiryDate undefined (not null) when the original contract never had one, matching every other optional field on this model', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', expiryDate: null });
      const movement = makeMovement({ movementType: 'ISSUE' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventModel.expiryDate).toBeUndefined();
    });

    it('carries the saved reasonCode onto the model for a Close event — Generic Requirement (reviewer-reported 2026-08-26)', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementType: 'CLOSE', reasonCode: 'NATURAL_EXPIRY_ALL_BALANCES_CLEARED' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventModel.reasonCode).toBe('NATURAL_EXPIRY_ALL_BALANCES_CLEARED');
    });

    it("carries the saved reasonCode onto the model for a Reopen event too — same field, A11/B7's own Reopen Reason", () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementType: 'REOPEN', reasonCode: 'CLOSED_IN_ERROR' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventModel.reasonCode).toBe('CLOSED_IN_ERROR');
    });

    it('carries the saved newExpiryDate onto the model for an AMEND_EXPIRY_DATE event — Generic Requirement (reviewer-reported 2026-08-26)', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementType: 'AMEND_EXPIRY_DATE', newExpiryDate: '2027-06-30' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventModel.newExpiryDate).toBe('2027-06-30');
    });

    it('carries the saved Amendment No./secondaryRef onto the model for an A2 amendment', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementType: 'AMEND_INCREASE', sourceTransactionRef: 'AMD-03' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventModel.secondaryRef).toBe('AMD-03');
    });

    it('falls back to a generic "Reference No." label when the resolved function has no secondaryRefLabel of its own but the movement did carry a reference (A1 has none; sourceTransactionRef still shown rather than silently dropped)', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      const movement = makeMovement({ movementType: 'ISSUE', sourceTransactionRef: 'AMD-01' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventFunction?.code).toBe('A1');
      const secondaryRef = svc.selectedEventFields.find((f) => f.key === 'secondaryRef');
      expect(secondaryRef?.hide).toBe(false);
      expect(secondaryRef?.props?.label).toBe('Reference No.');
    });

    it('falls back to a null selectedEventFunction (generic fields, no crash) when nothing in the registry matches', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'EPLC_EXAMINATION' });
      const movement = makeMovement({ movementType: 'AMEND' });

      svc.selectEvent(makeEvent({ movement, contract }));

      expect(svc.selectedEventFunction).toBeNull();
      expect(svc.selectedEventFields.length).toBeGreaterThan(0);
    });
  });

  /** Up to 3 tabs, gated by the root LC's own product type/tenor. */
  describe('selectEvent — Balance Tabs (tenor/side gating)', () => {
    it('Import Sight LC: exactly 2 tabs (LC, SG) — no Acceptance tab at all', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEventTabs.map((t) => t.key)).toEqual(['LC', 'SG']);
    });

    it('Import Usance LC: exactly 3 tabs (LC, Acceptance, SG)', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEventTabs.map((t) => t.key)).toEqual(['LC', 'ACCEPTANCE', 'SG']);
    });

    it('Export Sight Confirmation: exactly 1 tab (Confirmed LC Balance) — tab strip stays hidden (length <= 1)', () => {
      const svc = new InquireEventsService(makeApi());
      svc.side = 'EXPORT';
      svc.rootContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SIGHT' });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEventTabs.map((t) => t.key)).toEqual(['LC']);
      expect(svc.selectedEventTabs[0].label).toBe('Confirmed LC Balance');
    });

    it('Export Usance Confirmation: exactly 2 tabs (Confirmed LC Balance, Acceptance Balance) — never SG (Export has no Shipping Guarantee)', () => {
      const svc = new InquireEventsService(makeApi());
      svc.side = 'EXPORT';
      svc.rootContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEventTabs.map((t) => t.key)).toEqual(['LC', 'ACCEPTANCE']);
      expect(svc.selectedEventTabs[1].label).toBe('Confirmed LC Acceptance Balance');
    });

    it('a null/unset tenorType is treated as NOT Usance — Acceptance tab absent', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: null });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEventTabs.map((t) => t.key)).toEqual(['LC', 'SG']);
    });
  });

  describe('selectEvent — Balance Tab population ("only the one the selected Event belongs to")', () => {
    it('an LC-level event populates ONLY the LC tab (own eventSnapshot, own impact) — Acceptance/SG tabs stay null/no impact', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', naturalKey: { lcNumber: 'S001' } });
      const lcSnapshot = makeSnapshot({ confirmedBalance: '100000' });
      const movement = makeMovement({ eventSnapshot: lcSnapshot, balanceBefore: '0', balanceAfter: '100000' });

      svc.selectEvent(makeEvent({ movement, contract: svc.rootContract as BalanceContract }));

      const lcTab = svc.selectedEventTabs.find((t) => t.key === 'LC')!;
      expect(lcTab.snapshot).toBe(lcSnapshot);
      expect(lcTab.impact).toEqual({ before: '0', after: '100000' });
      expect(svc.selectedEventTabs.find((t) => t.key === 'ACCEPTANCE')!.snapshot).toBeNull();
      expect(svc.selectedEventTabs.find((t) => t.key === 'ACCEPTANCE')!.impact).toBeNull();
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toBeNull();
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.impact).toBeNull();
      expect(svc.selectedEventTab).toBe('LC');
    });

    it('an SHGT event populates the SG tab (own eventSnapshot, own impact) AND the LC tab from movement.rootEventSnapshot, with NO impact on the LC tab', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S001' } });
      const sgContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      const sgSnapshot = makeSnapshot({ confirmedBalance: '32000' });
      const rootSnapshot = makeSnapshot({ confirmedBalance: '100000', offBalanceExposure: '32000', tightAvailableBalance: '68000' });
      const movement = makeMovement({ eventSnapshot: sgSnapshot, rootEventSnapshot: rootSnapshot, balanceBefore: '0', balanceAfter: '32000' });

      svc.selectEvent(makeEvent({ movement, contract: sgContract }));

      const sgTab = svc.selectedEventTabs.find((t) => t.key === 'SG')!;
      expect(sgTab.snapshot).toBe(sgSnapshot);
      expect(sgTab.impact).toEqual({ before: '0', after: '32000' });
      expect(sgTab.title).toBe('Shipping Guarantee Balance — LC S001 / SG G01');

      const lcTab = svc.selectedEventTabs.find((t) => t.key === 'LC')!;
      expect(lcTab.snapshot).toBe(rootSnapshot);
      // No impact on the redirected LC tab — a different contract's own before/after would be wrong here.
      expect(lcTab.impact).toBeNull();

      expect(svc.selectedEventTab).toBe('SG');
    });

    it('an Acceptance event populates the Acceptance tab (own ledger) AND the LC tab from rootEventSnapshot', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', naturalKey: { lcNumber: 'S001' } });
      const acceptanceContract = makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } });
      const ownSnapshot = makeSnapshot({ confirmedBalance: '0' });
      const rootSnapshot = makeSnapshot({ confirmedBalance: '100000' });
      const movement = makeMovement({ eventSnapshot: ownSnapshot, rootEventSnapshot: rootSnapshot });

      svc.selectEvent(makeEvent({ movement, contract: acceptanceContract }));

      const acceptanceTab = svc.selectedEventTabs.find((t) => t.key === 'ACCEPTANCE')!;
      expect(acceptanceTab.snapshot).toBe(ownSnapshot);
      expect(acceptanceTab.title).toBe('Acceptance Balance — LC S001 / IB IB01');
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(rootSnapshot);
      expect(svc.selectedEventTab).toBe('ACCEPTANCE');
    });

    it('an EPLC_EXAMINATION event has no dedicated tab of its own — only the LC/Confirmed LC tab populates, from rootEventSnapshot', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S001' } });
      const examContract = makeContract({ instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'E01' } });
      const rootSnapshot = makeSnapshot({ confirmedBalance: '100000', presentDocsEarmarkPending: '40000' });
      const movement = makeMovement({ eventSnapshot: makeSnapshot(), rootEventSnapshot: rootSnapshot });

      svc.selectEvent(makeEvent({ movement, contract: examContract }));

      expect(svc.selectedEventTabs.map((t) => t.key)).toEqual(['LC']);
      expect(svc.selectedEventTabs[0].snapshot).toBe(rootSnapshot);
      expect(svc.selectedEventTab).toBe('LC');
    });
  });

  describe('selectEvent — legacy-data fallback (getBalanceAsOfMovement)', () => {
    it('reads movement.eventSnapshot directly for the LC tab when present — no API call at all', () => {
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const stored = makeSnapshot({ confirmedBalance: '77000' });
      const movement = makeMovement({ movementId: 'mv-stored', eventSnapshot: stored });

      svc.selectEvent(makeEvent({ movement, contract: svc.rootContract as BalanceContract }));

      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(stored);
      expect(api.getBalanceAsOfMovement).not.toHaveBeenCalled();
    });

    it('falls back to getBalanceAsOfMovement() for the matching own-ledger tab when eventSnapshot is null (pre-migration data), leaving other tabs untouched', () => {
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S001' } });
      const sgContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } });
      const movement = makeMovement({ movementId: 'mv-legacy', eventSnapshot: null, rootEventSnapshot: null });

      svc.selectEvent(makeEvent({ movement, contract: sgContract }));

      expect(api.getBalanceAsOfMovement).toHaveBeenCalledWith('mv-legacy');
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toEqual(makeSnapshot());
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBeNull();
    });

    it('a fallback failure leaves the tab snapshot null rather than throwing', () => {
      const api = makeApi({ getBalanceAsOfMovement: jest.fn(() => throwError(() => new Error('boom'))) });
      const svc = new InquireEventsService(api);
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const movement = makeMovement({ eventSnapshot: null });

      svc.selectEvent(makeEvent({ movement, contract: svc.rootContract as BalanceContract }));

      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBeNull();
    });

    it('a stale fallback response is discarded once a different Event has since been selected (race guard)', () => {
      const firstResponse = new Subject<BalanceSnapshot>();
      const api = makeApi({
        getBalanceAsOfMovement: jest.fn((movementId: string) =>
          movementId === 'mv-first' ? firstResponse.asObservable() : of(makeSnapshot({ confirmedBalance: 'mv-second' })),
        ),
      });
      const svc = new InquireEventsService(api);
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });

      svc.selectEvent(makeEvent({ movement: makeMovement({ movementId: 'mv-first', eventSnapshot: null }), contract: svc.rootContract as BalanceContract }));
      svc.selectEvent(makeEvent({ movement: makeMovement({ movementId: 'mv-second', eventSnapshot: null }), contract: svc.rootContract as BalanceContract }));
      firstResponse.next(makeSnapshot({ confirmedBalance: 'mv-first-stale' }));

      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot?.confirmedBalance).toBe('mv-second');
    });
  });

  /** A root-level event still needs its sibling SG/Acceptance balance shown, even with no direct movement of its own. */
  describe('selectEvent — sibling Acceptance/SG snapshots (movement.acceptanceEventSnapshot/sgEventSnapshot, persisted server-side)', () => {
    it('a root-level event (LC UTILIZE, no direct SG movement) reads the SG tab straight off movement.sgEventSnapshot — no API call at all', () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S02' } });
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.rootContract = root;

      const sgSnapshot = makeSnapshot({ balanceContractId: 'bc-sg', confirmedBalance: '12345', availableBalance: '12345' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        eventSnapshot: makeSnapshot({ offBalanceExposure: '12345' }),
        sgEventSnapshot: sgSnapshot,
      });
      svc.selectEvent(makeEvent({ movement: utilizeMovement, contract: root }));

      expect(api.getSnapshot).not.toHaveBeenCalled();
      const sgTab = svc.selectedEventTabs.find((t) => t.key === 'SG')!;
      expect(sgTab.snapshot).toBe(sgSnapshot);
      expect(sgTab.title).toBe('Shipping Guarantee Balance — LC S02');
      // No impact here — a different contract's own balance than the selected event's.
      expect(sgTab.impact).toBeNull();
      // The LC tab itself is unaffected — still the event's own eventSnapshot.
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(utilizeMovement.eventSnapshot);
    });

    it('mirrors the same read for the Acceptance tab — movement.acceptanceEventSnapshot, no API call', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', naturalKey: { lcNumber: 'S04' } });
      const api = makeApi();
      const svc = new InquireEventsService(api);
      svc.rootContract = root;

      const acceptanceSnapshot = makeSnapshot({ balanceContractId: 'bc-acc', confirmedBalance: '30000' });
      svc.selectEvent(makeEvent({ movement: makeMovement({ movementType: 'UTILIZE', acceptanceEventSnapshot: acceptanceSnapshot }), contract: root }));

      expect(api.getSnapshot).not.toHaveBeenCalled();
      const acceptanceTab = svc.selectedEventTabs.find((t) => t.key === 'ACCEPTANCE')!;
      expect(acceptanceTab.snapshot).toBe(acceptanceSnapshot);
      expect(acceptanceTab.impact).toBeNull();
    });

    it('a null sgEventSnapshot (ambiguous — two or more SGs, or none) leaves the tab empty', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S03' } });
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = root;

      svc.selectEvent(makeEvent({ movement: makeMovement({ movementType: 'UTILIZE', sgEventSnapshot: null }), contract: root }));

      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toBeNull();
    });

    // 'finalize' reads the separate finalizeSgEventSnapshot, never the frozen sgEventSnapshot its 'create' sibling reads.
    it("a 'finalize' row reads finalizeSgEventSnapshot for the SG tab (not the frozen sgEventSnapshot its sibling 'create' row reads)", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S01' } });
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = root;

      const frozenAtCreate = null; // SG G01 didn't exist yet at A3's own transaction time.
      const asOfFinalize = makeSnapshot({ balanceContractId: 'bc-sg', confirmedBalance: '12345' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        status: 'RELEASED',
        sgEventSnapshot: frozenAtCreate,
        finalizeSgEventSnapshot: asOfFinalize,
      });

      svc.selectEvent({ movement: utilizeMovement, contract: root, eventTime: utilizeMovement.createdAt, eventStatus: 'PENDING', phase: 'create' });
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toBeNull();

      svc.selectEvent({
        movement: utilizeMovement,
        contract: root,
        eventTime: utilizeMovement.releasedAt ?? utilizeMovement.createdAt,
        eventStatus: 'RELEASED',
        phase: 'finalize',
      });
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toBe(asOfFinalize);
    });

    it("mirrors the same 'finalize' read for the Acceptance tab — finalizeAcceptanceEventSnapshot, not the frozen acceptanceEventSnapshot", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', naturalKey: { lcNumber: 'S01' } });
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = root;

      const asOfFinalize = makeSnapshot({ balanceContractId: 'bc-acc', confirmedBalance: '30000' });
      const utilizeMovement = makeMovement({
        movementType: 'UTILIZE',
        status: 'RELEASED',
        acceptanceEventSnapshot: null,
        finalizeAcceptanceEventSnapshot: asOfFinalize,
      });

      svc.selectEvent({
        movement: utilizeMovement,
        contract: root,
        eventTime: utilizeMovement.releasedAt ?? utilizeMovement.createdAt,
        eventStatus: 'RELEASED',
        phase: 'finalize',
      });
      expect(svc.selectedEventTabs.find((t) => t.key === 'ACCEPTANCE')!.snapshot).toBe(asOfFinalize);
    });
  });

  /** Surfaces EPLC_EXAMINATION's own ibNumber so a reader can connect it to B4's later Honour/Accept row. */
  describe('secondaryReferenceFor', () => {
    it('returns the ibNumber for an EPLC_EXAMINATION event', () => {
      const svc = new InquireEventsService(makeApi());
      const examContract = makeContract({ instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'U02', ibNumber: 'E01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: examContract }))).toBe('E01');
    });

    it('returns "—" for an EPLC_EXAMINATION event with no ibNumber recorded (should not happen in practice, but stays non-throwing)', () => {
      const svc = new InquireEventsService(makeApi());
      const examContract = makeContract({ instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'U02' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: examContract }))).toBe('—');
    });

    it('returns "—" for the root EPLC_CONFIRMATION\'s own ISSUE — HONOUR is covered by the reclassification tests further below, not "—" any more (2026-08-28)', () => {
      const svc = new InquireEventsService(makeApi());
      const cnfContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'U02' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement({ movementType: 'ISSUE' }), contract: cnfContract }))).toBe('—');
    });

    // A6/B4 Accounting Event Ownership Rule (2026-08-28) — completes the LC Number + Secondary Reference +
    // eventSeq identity triple for A6/B4's own merged row (see CLAUDE.md's own entry of the same name).
    it('returns the ibNumber for an IPLC_ACCEPTANCE event (A6)', () => {
      const svc = new InquireEventsService(makeApi());
      const acceptanceContract = makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S01', ibNumber: 'IB01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: acceptanceContract }))).toBe('IB01');
    });

    it('returns the ibNumber for an EPLC_ACCEPTANCE event (B4)', () => {
      const svc = new InquireEventsService(makeApi());
      const acceptanceContract = makeContract({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'B4-01', ibNumber: 'E01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: acceptanceContract }))).toBe('E01');
    });

    it('returns "—" for an IPLC_ACCEPTANCE/EPLC_ACCEPTANCE event with no ibNumber recorded (should not happen in practice, but stays non-throwing)', () => {
      const svc = new InquireEventsService(makeApi());
      const acceptanceContract = makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: acceptanceContract }))).toBe('—');
    });

    // Reproduces the worked example: LC S01, SHGT ISSUE, "SG G01".
    it('returns "SG {sgNumber}" for an SHGT event', () => {
      const svc = new InquireEventsService(makeApi());
      const sgContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S01', sgNumber: 'G01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: sgContract }))).toBe('SG G01');
    });

    it('returns "—" for an SHGT event with no sgNumber recorded (should not happen in practice, but stays non-throwing)', () => {
      const svc = new InquireEventsService(makeApi());
      const sgContract = makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: sgContract }))).toBe('—');
    });

    // Business-reported gap 2026-08-28 ("LC Balance 顯示 Reference=B01, Secondary Ref=— ; Acceptance
    // Balance 顯示 Reference=—, Secondary Ref=B01" for the SAME A6 event — "LC + 2ndary + Event Seq =
    // Event Key 各自獨立"). A3/A3S/A4's own IPLC_LC/UTILIZE (secondaryRefLabel: "IB Number") and B4's own
    // EPLC_CONFIRMATION/HONOUR|ACCEPT (secondaryRefLabel: "EB Number") are reclassified: the value now
    // reads under Secondary Ref., never Reference, matching the sibling Acceptance/Examination contract's
    // own natural key ibNumber for the SAME business identifier.
    it('reclassifies an IPLC_LC/UTILIZE\'s own sourceTransactionRef (A3/A3S/A4\'s "IB Number") as Secondary Ref., not Reference', () => {
      const svc = new InquireEventsService(makeApi());
      const lcContract = makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'U01' } });
      const event = makeEvent({ movement: makeMovement({ movementType: 'UTILIZE', sourceTransactionRef: 'B01' }), contract: lcContract });
      expect(svc.secondaryReferenceFor(event)).toBe('B01');
      expect(svc.primaryReferenceFor(event)).toBe('—');
    });

    it('reclassifies an EPLC_CONFIRMATION/ACCEPT\'s own sourceTransactionRef (B4\'s "EB Number") as Secondary Ref., not Reference — same rule for HONOUR', () => {
      const svc = new InquireEventsService(makeApi());
      const cnfContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'B4-01' } });
      const acceptEvent = makeEvent({ movement: makeMovement({ movementType: 'ACCEPT', sourceTransactionRef: 'E01' }), contract: cnfContract });
      expect(svc.secondaryReferenceFor(acceptEvent)).toBe('E01');
      expect(svc.primaryReferenceFor(acceptEvent)).toBe('—');
      const honourEvent = makeEvent({ movement: makeMovement({ movementType: 'HONOUR', sourceTransactionRef: 'E02' }), contract: cnfContract });
      expect(svc.secondaryReferenceFor(honourEvent)).toBe('E02');
      expect(svc.primaryReferenceFor(honourEvent)).toBe('—');
    });

    it("does NOT reclassify A2/B2's own Amendment No. (same sourceTransactionRef wire field, different meaning) — stays under Reference only", () => {
      const svc = new InquireEventsService(makeApi());
      const lcContract = makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'U01' } });
      const amendEvent = makeEvent({ movement: makeMovement({ movementType: 'AMEND_INCREASE', sourceTransactionRef: 'AMD-1' }), contract: lcContract });
      expect(svc.primaryReferenceFor(amendEvent)).toBe('AMD-1');
      expect(svc.secondaryReferenceFor(amendEvent)).toBe('—');
    });

    it('primaryReferenceFor() falls back to "—" for a reclassified shape with no sourceTransactionRef recorded, and passes every unreclassified shape through unchanged', () => {
      const svc = new InquireEventsService(makeApi());
      const lcContract = makeContract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'U01' } });
      expect(svc.primaryReferenceFor(makeEvent({ movement: makeMovement({ movementType: 'ISSUE' }), contract: lcContract }))).toBe('—');
      expect(
        svc.primaryReferenceFor(makeEvent({ movement: makeMovement({ movementType: 'ISSUE', sourceTransactionRef: 'REF-1' }), contract: lcContract })),
      ).toBe('REF-1');
    });
  });

  describe('selectEventTab', () => {
    it('switches the active tab; activeEventTab getter reflects it', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEventTab).toBe('LC');

      svc.selectEventTab('SG');

      expect(svc.selectedEventTab).toBe('SG');
      expect(svc.activeEventTab?.key).toBe('SG');
    });
  });

  describe('closeEvent', () => {
    it('clears the selection back to its initial empty state', () => {
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      svc.selectEvent(makeEvent({ movement: makeMovement(), contract: svc.rootContract as BalanceContract }));
      expect(svc.selectedEvent).not.toBeNull();

      svc.closeEvent();

      expect(svc.selectedEvent).toBeNull();
      expect(svc.selectedEventFunction).toBeNull();
      expect(svc.selectedEventFields).toEqual([]);
      expect(svc.selectedEventModel).toEqual({});
      expect(svc.selectedEventTabs).toEqual([]);
      expect(svc.selectedEventTab).toBe('LC');
      expect(svc.activeEventTab).toBeNull();
    });
  });
});
