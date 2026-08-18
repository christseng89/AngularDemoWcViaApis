import { Subject, of, throwError } from 'rxjs';
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

/** Bug fix 2026-08-18 ("A4 Sight Payment" ordering fix) — InquiredEvent gained eventTime/eventStatus/phase; this wraps a bare {movement, contract} pair with the ordinary 'primary'-phase defaults every pre-existing test site expects. */
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

    /**
     * Bug fixed 2026-08-18, business-reported live example — LC S01: "A1 Issue → A3 Document Arrival →
     * A8 Shipping Guarantee Issue → A4 Sight Payment" is the real order, reproduced here field-for-field
     * from the live DB dump (see InquiredEvent's own doc comment) — A1 ISSUE (createdAt 11:30:08), A3's
     * own UTILIZE (createdAt 11:30:35, later Maker-Submitted/Released by A4 at 15:37:01/15:37:08), A8
     * SHGT ISSUE (createdAt 11:31:01). Before this fix, the merged timeline showed only 3 rows, with the
     * UTILIZE pinned at its EARLY createdAt position — A4's own much-later Release was invisible.
     */
    it('splits a finalized Sight-tenor Document Arrival (A3/A4) into 2 rows and sorts the WHOLE merged timeline by true Event Date/Time — reproduces LC S01 exactly: A1, A3(create), A8, A4(finalize)', () => {
      const root = makeContract({ balanceContractId: 'bc-lc', instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S01' } });
      const sg = makeContract({ balanceContractId: 'bc-sg', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S01', sgNumber: 'G01' } });
      const issueMovement = makeMovement({ movementId: 'mv-issue', balanceContractId: 'bc-lc', movementType: 'ISSUE', createdAt: '2026-08-17T11:30:08.658Z' });
      // A3's own Create-time snapshot (PENDING, per the microservice's own release() fix — 2026-08-18,
      // "做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變" — release() no longer overwrites
      // this) vs. A4's own separate finalize-time snapshot (RELEASED figures, a distinct field).
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
        listMovements: jest.fn((contractId: string) => of(contractId === 'bc-lc' ? [issueMovement, utilizeMovement] : contractId === 'bc-sg' ? [sgMovement] : [])),
        catalog: jest.fn((instrumentType: string) => of(instrumentType === 'SHGT' ? { items: [sg], total: 1, page: 1, pageSize: 50 } : emptyCatalog())),
      });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S01';
      svc.search();

      // 4 rows, not 3 — the UTILIZE's own later Release (A4) is no longer invisible.
      expect(svc.events.length).toBe(4);
      expect(svc.events.map((e) => e.movement.movementId)).toEqual(['mv-issue', 'mv-utilize', 'mv-sg', 'mv-utilize']);
      expect(svc.events.map((e) => e.phase)).toEqual(['primary', 'create', 'primary', 'finalize']);
      // eventStatus is the movement's own real, current status on EVERY row (2026-08-18, business-
      // mandated — "RELEASE 是指該筆交易是否已完成 RELEASE...不得誤判為RELEASED" reversing an earlier
      // same-day design that forced the 'create' row to a stale 'PENDING' — see toEventRows()'s own doc
      // comment for the full history).
      expect(svc.events.map((e) => e.eventStatus)).toEqual(['RELEASED', 'RELEASED', 'RELEASED', 'RELEASED']);
      expect(svc.events.map((e) => e.eventTime)).toEqual([issueMovement.createdAt, utilizeMovement.createdAt, sgMovement.createdAt, utilizeMovement.releasedAt]);

      // Selecting the 'create' row resolves to A3 (Document Arrival) with the movement's real RELEASED
      // status and its real before/after impact — the SAME real impact the 'finalize' row (A4) shows,
      // since both rows represent the one real movement's one real release.
      const createRow = svc.events.find((e) => e.phase === 'create')!;
      svc.selectEvent(createRow);
      expect(svc.selectedEventFunction?.code).toBe('A3');
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.impact).toEqual({ before: utilizeMovement.balanceBefore, after: utilizeMovement.balanceAfter });
      // The core guarantee this fix protects: A3's own snapshot is exactly what createMovement()
      // captured, never A4's own later result — even though BOTH rows share the identical underlying
      // `movement` object (movement.finalizeEventSnapshot is NOT what the 'create' row shows).
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(a3CreateSnapshot);

      const finalizeRow = svc.events.find((e) => e.phase === 'finalize')!;
      svc.selectEvent(finalizeRow);
      expect(svc.selectedEventFunction?.code).toBe('A4');
      // The 'finalize' row shows the SEPARATE finalizeEventSnapshot, not the (unchanged) eventSnapshot.
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toBe(a4FinalizeSnapshot);
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.impact).toEqual({ before: utilizeMovement.balanceBefore, after: utilizeMovement.balanceAfter });
    });

    it("a 'finalize' row falls back to eventSnapshot when finalizeEventSnapshot is null (a movement created before that field existed)", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const utilizeMovement = makeMovement({ movementType: 'UTILIZE', status: 'RELEASED', releasedAt: '2026-08-17T15:00:00.000Z', eventSnapshot: makeSnapshot({ confirmedBalance: '55555' }), finalizeEventSnapshot: null });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      const finalizeRow = svc.events.find((e) => e.phase === 'finalize')!;
      svc.selectEvent(finalizeRow);
      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot).toEqual(makeSnapshot({ confirmedBalance: '55555' }));
    });

    it('does NOT split a Usance-tenor Document Arrival — it stays a single primary row (A6 always creates its own separate Acceptance movement instead)', () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      const utilizeMovement = makeMovement({ movementType: 'UTILIZE', status: 'RELEASED', releasedAt: '2026-08-17T15:00:00.000Z' });
      const api = makeApi({ resolveContract: jest.fn(() => of(root)), listMovements: jest.fn(() => of([utilizeMovement])) });

      const svc = new InquireEventsService(api);
      svc.lcNumber = 'S001';
      svc.search();

      expect(svc.events.length).toBe(1);
      expect(svc.events[0].phase).toBe('primary');
    });

    it('does NOT split a still-PENDING Sight UTILIZE — Document Arrival hasn\'t been Sight-Settled yet, so there is only the one row', () => {
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

  // UX enhancement (2026-08-18, "Inquire Event可以設計成Page by Page方式嗎?") — client-side windowing
  // over the already-loaded `events` array (eventsPaging.pageSize is 10, so 25 events -> 3 pages).
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
      expect(svc.pagedEvents.map((e) => e.movement.movementId)).toEqual(['mv-10', 'mv-11', 'mv-12', 'mv-13', 'mv-14', 'mv-15', 'mv-16', 'mv-17', 'mv-18', 'mv-19']);

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

      // A second search (e.g. re-searching, or a different LC) must not leave stale page/total behind.
      svc.search();

      expect(svc.eventsPaging.page).toBe(1);
      expect(svc.eventsPaging.total).toBe(2);
      expect(svc.eventsPaging.totalPages).toBe(1);
    });
  });

  // UX enhancement (2026-08-18, "Inquire Events 把Function name放在Event 的第一個欄位") — extracted from
  // selectEvent()'s own resolution logic so the merged Events table can show it per row too.
  describe('functionFor', () => {
    it('resolves a primary-phase event via the generic Strategy-table lookup (A1 — IPLC_LC/ISSUE)', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC' });
      expect(svc.functionFor(makeEvent({ movement: makeMovement({ movementType: 'ISSUE' }), contract }))?.code).toBe('A1');
    });

    it("resolves a 'finalize' phase Sight UTILIZE to A4, not A3 (payExistingUtilizeFunctionFor(), not the generic resolver)", () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const finalizeEvent: InquiredEvent = { movement: makeMovement({ movementType: 'UTILIZE', status: 'RELEASED' }), contract, eventTime: '2026-08-18T00:00:00.000Z', eventStatus: 'RELEASED', phase: 'finalize' };
      expect(svc.functionFor(finalizeEvent)?.code).toBe('A4');
    });

    it("resolves the SAME Sight UTILIZE's own 'create' phase to A3 — the generic resolver, unaffected by phase", () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const createEvent: InquiredEvent = { movement: makeMovement({ movementType: 'UTILIZE' }), contract, eventTime: '2026-08-18T00:00:00.000Z', eventStatus: 'PENDING', phase: 'create' };
      expect(svc.functionFor(createEvent)?.code).toBe('A3');
    });

    it('returns undefined for legacy data no current function produces', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'EPLC_EXAMINATION' });
      expect(svc.functionFor(makeEvent({ movement: makeMovement({ movementType: 'AMEND' }), contract }))).toBeUndefined();
    });
  });

  describe('selectEvent', () => {
    it('resolves the producing function, reconstructs a read-only field set, and stashes a fresh FormGroup', () => {
      const svc = new InquireEventsService(makeApi());
      const contract = makeContract({ instrumentType: 'IPLC_LC', tolerancePct: '10', tenorType: 'SIGHT', tenorDays: 0 });
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

  /**
   * 2026-08-17, Balance Tabs (third revision — precise user spec, confirmed via AskUserQuestion): up to
   * 3 tabs, gated purely by the root LC's own product type/tenor (selectedEventIsUsanceLc/
   * selectedEventHasSg), a child tab (Acceptance/SG) populated ONLY when the selected Event belongs to
   * that specific child.
   */
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
        getBalanceAsOfMovement: jest.fn((movementId: string) => (movementId === 'mv-first' ? firstResponse.asObservable() : of(makeSnapshot({ confirmedBalance: 'mv-second' })))),
      });
      const svc = new InquireEventsService(api);
      svc.rootContract = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });

      svc.selectEvent(makeEvent({ movement: makeMovement({ movementId: 'mv-first', eventSnapshot: null }), contract: svc.rootContract as BalanceContract }));
      svc.selectEvent(makeEvent({ movement: makeMovement({ movementId: 'mv-second', eventSnapshot: null }), contract: svc.rootContract as BalanceContract }));
      firstResponse.next(makeSnapshot({ confirmedBalance: 'mv-first-stale' }));

      expect(svc.selectedEventTabs.find((t) => t.key === 'LC')!.snapshot?.confirmedBalance).toBe('mv-second');
    });
  });

  /**
   * Business-confirmed live example 2026-08-17 (LC S02, 3rd event — a plain A3 Document Arrival UTILIZE
   * with no direct SG movement, SG G01 already existing under the LC): "the CURRENT EVENT BALANCE
   * SNAPSHOT should be [both LC Balance AND SG Balance]" — confirmed via AskUserQuestion: live current
   * balance (api.getSnapshot()), not a historical "as of this event" computation.
   */
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
      // Still no impact on this tab — it's a DIFFERENT contract's own balance than the selected event's own.
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

    // 2026-08-18, business instruction ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變")
    // — a 'finalize' row (A4) must show the SG's own balance AS OF A4's own release, via the SEPARATE
    // finalizeSgEventSnapshot field, never the (frozen, create-time) sgEventSnapshot its sibling
    // 'create' row (A3) reads — mirrors ownSnapshot's own finalize/create split, one level down.
    it("a 'finalize' row reads finalizeSgEventSnapshot for the SG tab (not the frozen sgEventSnapshot its sibling 'create' row reads)", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT', naturalKey: { lcNumber: 'S01' } });
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = root;

      const frozenAtCreate = null; // SG G01 didn't exist yet at A3's own transaction time.
      const asOfFinalize = makeSnapshot({ balanceContractId: 'bc-sg', confirmedBalance: '12345' });
      const utilizeMovement = makeMovement({ movementType: 'UTILIZE', status: 'RELEASED', sgEventSnapshot: frozenAtCreate, finalizeSgEventSnapshot: asOfFinalize });

      svc.selectEvent({ movement: utilizeMovement, contract: root, eventTime: utilizeMovement.createdAt, eventStatus: 'PENDING', phase: 'create' });
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toBeNull();

      svc.selectEvent({ movement: utilizeMovement, contract: root, eventTime: utilizeMovement.releasedAt ?? utilizeMovement.createdAt, eventStatus: 'RELEASED', phase: 'finalize' });
      expect(svc.selectedEventTabs.find((t) => t.key === 'SG')!.snapshot).toBe(asOfFinalize);
    });

    it("mirrors the same 'finalize' read for the Acceptance tab — finalizeAcceptanceEventSnapshot, not the frozen acceptanceEventSnapshot", () => {
      const root = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', naturalKey: { lcNumber: 'S01' } });
      const svc = new InquireEventsService(makeApi());
      svc.rootContract = root;

      const asOfFinalize = makeSnapshot({ balanceContractId: 'bc-acc', confirmedBalance: '30000' });
      const utilizeMovement = makeMovement({ movementType: 'UTILIZE', status: 'RELEASED', acceptanceEventSnapshot: null, finalizeAcceptanceEventSnapshot: asOfFinalize });

      svc.selectEvent({ movement: utilizeMovement, contract: root, eventTime: utilizeMovement.releasedAt ?? utilizeMovement.createdAt, eventStatus: 'RELEASED', phase: 'finalize' });
      expect(svc.selectedEventTabs.find((t) => t.key === 'ACCEPTANCE')!.snapshot).toBe(asOfFinalize);
    });
  });

  /**
   * Business instruction 2026-08-17 ("EPLC_EXAMINATION should carry E01/E02 as the Secondary Reference
   * so that each Examination event can be clearly linked to its subsequent Honour/Acceptance event") —
   * surfaces EPLC_EXAMINATION's own natural key (ibNumber, "EB Number") as a Secondary Ref column value,
   * since B4's own Honour/Accept later carries that SAME value as its own sourceTransactionRef (already
   * shown in the existing Reference column) — letting a reader visually connect "Examination E01" to
   * "Honour E01" in the merged Event Timeline.
   */
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

    it('returns "—" for every other instrumentType, including the root EPLC_CONFIRMATION and a later HONOUR event that already carries E01 via the existing Reference column', () => {
      const svc = new InquireEventsService(makeApi());
      const cnfContract = makeContract({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'U02' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement({ movementType: 'ISSUE' }), contract: cnfContract }))).toBe('—');
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement({ movementType: 'HONOUR', sourceTransactionRef: 'E01' }), contract: cnfContract }))).toBe('—');
    });

    it('returns "—" for an IPLC_ACCEPTANCE event — not asked for yet, unlike EPLC_EXAMINATION/SHGT', () => {
      const svc = new InquireEventsService(makeApi());
      const acceptanceContract = makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S01', ibNumber: 'IB01' } });
      expect(svc.secondaryReferenceFor(makeEvent({ movement: makeMovement(), contract: acceptanceContract }))).toBe('—');
    });

    // 2026-08-17 ("the corresponding Shipping Guarantee Number (SG Number) should be displayed so the
    // user can identify which Shipping Guarantee the event belongs to") — reproduces the business's own
    // worked example exactly: LC S01, SHGT ISSUE 22345, "SG G01".
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
