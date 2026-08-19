import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, TransactionFunction, InstrumentType } from './balance-component.model';

/**
 * Covers: onSelectContract, onSelectArrivalSg, onSelectPayMovement, payExisting,
 * refreshSelectedContractSnapshot, searchExistingContract, onSelectParent,
 * ibIndexPrevPage/ibIndexNextPage, onSelectSettleableBalance, onSelectIbIndex,
 * searchCheckerLc (search step only — loadCheckerQueue/onSelectCheckerMovement/
 * checkerAct belong to a different spec file per the task split).
 *
 * Direct instantiation, no TestBed — matches lc-payment-wc's leg-allocator.component.spec.ts house style.
 */

const ALL_FUNCTIONS = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS];

function getFn(code: string): TransactionFunction {
  const found = ALL_FUNCTIONS.find((f) => f.code === code);
  if (!found) throw new Error(`fixture function ${code} not found in registry`);
  return found;
}

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'C1',
    logicalContractId: 'L1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null },
    status: 'ACTIVE',
    currency: 'USD',
    tolerancePct: null,
    tenorType: 'SIGHT',
    tenorDays: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: 'C1',
    logicalContractId: 'L1',
    currency: 'USD',
    confirmedBalance: '100000',
    availableBalance: '80000',
    pendingEarmarkTotal: '0',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'C1',
    eventSeq: 1,
    movementType: 'UTILIZE',
    exposureNature: 'CONTINGENT',
    amount: '1000',
    ceilingAmount: '1000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeCatalogPage(items: BalanceContract[]): CatalogPage {
  return { items, total: items.length, page: 1, pageSize: 10 };
}

/** Default mock covers every side-effect call this component's methods can trigger (syncCheckerToContext -> searchCheckerLc -> resolveContract -> loadCheckerQueue -> listMovements -> syncLookupToContext -> runLookup -> resolveContract/getSnapshot/listMovements/catalog) with harmless empty/benign responses, so tests only need to override the specific call(s) they care about. */
function makeApi(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const defaults: Record<string, jest.Mock> = {
    catalog: jest.fn(() => of(makeCatalogPage([]))),
    resolveContract: jest.fn(() => of(makeContract())),
    getSnapshot: jest.fn(() => of(makeSnapshot())),
    listMovements: jest.fn(() => of([])),
    release: jest.fn(() => of({ movementId: 'REL1', status: 'RELEASED' })),
    reject: jest.fn(() => of({})),
    cancel: jest.fn(() => of({})),
    acknowledge: jest.fn(() => of({})),
    submitByMaker: jest.fn(() => of({ movementId: 'M1', status: 'PENDING' })),
    createMovement: jest.fn(() => of({ body: { movementId: 'NEW1' } })),
  };
  return { ...defaults, ...overrides } as unknown as BalanceComponentApiService;
}

function makeComponent(fn: TransactionFunction, api: BalanceComponentApiService, subChoiceValue?: string): TransactionBuilderComponent {
  const comp = new TransactionBuilderComponent(api);
  comp.selectFunction(fn);
  if (subChoiceValue) {
    comp.subChoiceValue = subChoiceValue;
    comp.onSubChoice();
  }
  return comp;
}

describe('TransactionBuilderComponent — selection/picker methods', () => {
  describe('onSelectContract', () => {
    it("loads the picked contract's live snapshot (plain function, no special branches)", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '5000' }))) });
      const comp = makeComponent(getFn('A3'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectContract('C1');

      expect(comp.selectedContract?.balanceContractId).toBe('C1');
      expect(api.getSnapshot).toHaveBeenCalledWith('C1');
      expect(comp.selectedContractSnapshot?.availableBalance).toBe('5000');
    });

    it('sets selectedContract to null and skips the snapshot fetch when the id is not in catalogPicker.contracts', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A3'), api);
      comp.catalogPicker.contracts = [];

      comp.onSelectContract('missing');

      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('handles a snapshot-fetch error by leaving selectedContractSnapshot null and clearing snapshotLoading', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'snapshot boom' } }))) });
      const comp = makeComponent(getFn('A3'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1' })];

      comp.onSelectContract('C1');

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.snapshotLoading).toBe(false);
    });

    it('A4 (payExistingUtilize): loads still-PENDING UTILIZE movements under the picked contract and auto-picks the sole one', () => {
      const pendingUtilize = { movementId: 'M1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB01', amount: '1000' };
      const releasedUtilize = { movementId: 'M2', status: 'RELEASED', movementType: 'UTILIZE' };
      const api = makeApi({ listMovements: jest.fn(() => of([pendingUtilize, releasedUtilize])) });
      const comp = makeComponent(getFn('A4'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1' })];

      comp.onSelectContract('C1');

      expect(api.listMovements).toHaveBeenCalledWith('C1');
      expect(comp.payableMovements).toEqual([pendingUtilize]);
      // Only one PENDING match -> auto-picked (onSelectPayMovement side effect).
      expect(comp.selectedPayMovement?.movementId).toBe('M1');
    });

    it('B4 (movementTypeFromContractTenor + payableMovementInstrumentType): derives HONOUR for a Sight Confirmation and loads already-RELEASED B3 CREATEs across child EPLC_EXAMINATION contracts', () => {
      const examinationContract = makeContract({
        balanceContractId: 'EX1',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null },
      });
      // 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — B4's own candidate filter now
      // looks for status === 'RELEASED' (B3's own genuine Checker Release), not 'PENDING'+acknowledgedAt.
      const releasedCreate = { movementId: 'MX1', status: 'RELEASED', movementType: 'CREATE', amount: '2000' };
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX1' ? of([releasedCreate]) : of([]))),
      });
      const comp = makeComponent(getFn('B4'), api);
      comp.catalogPicker.contracts = [
        makeContract({
          balanceContractId: 'CNF1',
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null },
          tenorType: 'SIGHT',
        }),
      ];

      comp.onSelectContract('CNF1');

      expect(comp.model.movementType).toBe('HONOUR');
      expect(comp.payableMovements).toHaveLength(1);
      expect(comp.payableMovements[0].movementId).toBe('MX1');
      // Only one match -> auto-picked; B4 has secondaryRefLabel ('EB Number') so both naturalKey.ibNumber and model.secondaryRef get carried, from the EPLC_EXAMINATION contract's own naturalKey.ibNumber (merged in as a synthetic sourceTransactionRef).
      expect(comp.naturalKey.ibNumber).toBe('EB01');
      expect(comp.model.secondaryRef).toBe('EB01');
      expect(comp.model.amount).toBe('2000');
      // Bug fixed 2026-08-18 ("There are function dependency, if pending in previous event, then next
      // event cannot be accessed") — deliberately NOT passed here, unlike every other action-picker call
      // site: B3's own CREATE is designed to stay PENDING until B4's own compound Release finalizes it,
      // so filtering by "creating movement already Released" would exclude every real candidate B4
      // needs to find, not just an ineligible one.
      expect(api.catalog).toHaveBeenCalledWith('EPLC_EXAMINATION', 'ACTIVE', undefined, 1, 50, 'EXP1');
    });

    it('B4: derives ACCEPT for a Usance Confirmation, and excludes a still-PENDING (not yet genuinely Released) B3 record (payableMovementRequiresRelease)', () => {
      const examinationContract = makeContract({
        balanceContractId: 'EX2',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'EXP2', ibNumber: 'EB02', sgNumber: null },
      });
      // 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — a B3 record that hasn't been
      // genuinely Checker-Released yet (still PENDING) must not be selectable by B4.
      const stillPendingCreate = { movementId: 'MX2', status: 'PENDING', movementType: 'CREATE', amount: '3000' };
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX2' ? of([stillPendingCreate]) : of([]))),
      });
      const comp = makeComponent(getFn('B4'), api);
      comp.catalogPicker.contracts = [
        makeContract({
          balanceContractId: 'CNF2',
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: 'EXP2', ibNumber: null, sgNumber: null },
          tenorType: 'SELLERS_USANCE',
        }),
      ];

      comp.onSelectContract('CNF2');

      expect(comp.model.movementType).toBe('ACCEPT');
      expect(comp.payableMovements).toHaveLength(0); // filtered out — still PENDING, not yet Released
    });

    // Bug fixed 2026-08-18, reviewer-reported live ("Export Confirmed LC Sight B4 Submit後 不應該再出現
    // S01 E01 E02" — a presentation B4 has ALREADY consumed kept showing up as a pickable candidate
    // again): status alone isn't enough — an already-consumed record stays RELEASED forever (it never
    // transitions again), so status === 'RELEASED' alone kept matching it. Must also exclude anything
    // with presentDocsConsumedAt already set.
    it('B4: excludes an already-consumed B3 record (RELEASED, but presentDocsConsumedAt already set by an earlier B4)', () => {
      const examinationContract = makeContract({
        balanceContractId: 'EX3',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'EXP3', ibNumber: 'EB03', sgNumber: null },
      });
      const consumedCreate = {
        movementId: 'MX3',
        status: 'RELEASED',
        movementType: 'CREATE',
        amount: '4000',
        presentDocsConsumedAt: '2026-08-18T11:10:14.392Z',
        presentDocsConsumedBy: 'checker1',
      };
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX3' ? of([consumedCreate]) : of([]))),
      });
      const comp = makeComponent(getFn('B4'), api);
      comp.catalogPicker.contracts = [
        makeContract({
          balanceContractId: 'CNF3',
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: 'EXP3', ibNumber: null, sgNumber: null },
          tenorType: 'SIGHT',
        }),
      ];

      comp.onSelectContract('CNF3');

      expect(comp.model.movementType).toBe('HONOUR');
      expect(comp.payableMovements).toHaveLength(0); // filtered out — already consumed by an earlier B4
    });

    it("A3S (documentArrivalWithSg): loads the LC's outstanding SHGT records and auto-picks/fetches the sole one's snapshot", () => {
      const sgContract = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) => (instrumentType === 'SHGT' ? of(makeCatalogPage([sgContract])) : of(makeCatalogPage([])))),
        getSnapshot: jest.fn((id: string) => (id === 'SG1' ? of(makeSnapshot({ availableBalance: '3000', confirmedBalance: '3000' })) : of(makeSnapshot()))),
      });
      const comp = makeComponent(getFn('A3S'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectContract('C1');

      expect(comp.sgsForArrival).toHaveLength(1);
      expect(comp.selectedArrivalSg?.balanceContractId).toBe('SG1');
      expect(comp.arrivalSgSnapshot?.availableBalance).toBe('3000');
      // Bug fixed 2026-08-18 ("There are function dependency, if pending in previous event, then next
      // event cannot be accessed") — an SG whose own A8 Issue isn't Released yet shouldn't be offered
      // as a redemption target.
      expect(api.catalog).toHaveBeenCalledWith('SHGT', 'ACTIVE', undefined, 1, 50, 'LC1', undefined, true);
    });
  });

  describe('onSelectArrivalSg', () => {
    function setup() {
      const api = makeApi();
      const comp = makeComponent(getFn('A3S'), api);
      comp.sgsForArrival = [
        makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } }),
      ];
      return { api, comp };
    }

    it("fetches and stores the picked SG's live snapshot", () => {
      const { api, comp } = setup();
      (api.getSnapshot as jest.Mock).mockReturnValueOnce(of(makeSnapshot({ availableBalance: '2500', confirmedBalance: '7000' })));

      comp.onSelectArrivalSg('SG1');

      expect(comp.selectedArrivalSg?.balanceContractId).toBe('SG1');
      expect(comp.arrivalSgSnapshot?.confirmedBalance).toBe('7000');
    });

    it('sets arrivalSgSnapshot to null on a snapshot-fetch error', () => {
      const { api, comp } = setup();
      (api.getSnapshot as jest.Mock).mockReturnValueOnce(throwError(() => ({ error: { message: 'boom' } })));

      comp.onSelectArrivalSg('SG1');

      expect(comp.arrivalSgSnapshot).toBeNull();
    });

    it('clears selectedArrivalSg/arrivalSgSnapshot and skips the API call when the id is not in sgsForArrival', () => {
      const { api, comp } = setup();

      comp.onSelectArrivalSg('missing');

      expect(comp.selectedArrivalSg).toBeNull();
      expect(comp.arrivalSgSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('onSelectPayMovement', () => {
    it('A6 (settlesDocumentArrival, no secondaryRefLabel): carries and locks IB Number + Amount from the picked Document Arrival', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A6'), api);
      comp.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000' })];

      comp.onSelectPayMovement('M1');

      expect(comp.selectedPayMovement?.movementId).toBe('M1');
      expect(comp.naturalKey.ibNumber).toBe('IB01');
      expect(comp.model.amount).toBe('5000');
      expect(comp.model.secondaryRef).toBeUndefined(); // A6 has no secondaryRefLabel
    });

    it('B4 (settlesDocumentArrival + secondaryRefLabel "EB Number"): also carries the reference into model.secondaryRef', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('B4'), api);
      comp.payableMovements = [makeMovement({ movementId: 'MX1', sourceTransactionRef: 'EB01', amount: '2000', movementType: 'CREATE' })];

      comp.onSelectPayMovement('MX1');

      expect(comp.naturalKey.ibNumber).toBe('EB01');
      expect(comp.model.secondaryRef).toBe('EB01');
      expect(comp.model.amount).toBe('2000');
    });

    it('A4 (no settlesDocumentArrival): sets selectedPayMovement but leaves naturalKey/model untouched', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '999' })];
      comp.naturalKey.ibNumber = '';

      comp.onSelectPayMovement('M1');

      expect(comp.selectedPayMovement?.movementId).toBe('M1');
      expect(comp.naturalKey.ibNumber).toBe('');
    });

    it('sets selectedPayMovement to null when the movementId is not found', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A6'), api);
      comp.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000' })];

      comp.onSelectPayMovement('missing');

      expect(comp.selectedPayMovement).toBeNull();
    });
  });

  // 4-eyes redesign 2026-08-16 ("A4 Need Maker and Checker feature... Submit by Maker, then Release
  // by Checker"): payExisting() (A4's own dedicated single-actor release method) was REMOVED — A4's
  // picker (onSelectPayMovement, covered above) became browse-only, and release happens exclusively
  // via the generic Checker panel's checkerAct('release'), covered in
  // transaction-builder.component.actions.spec.ts's checkerAct() describe block (the "plain path (A4,
  // no defer/compound flags)" case).
  //
  // Revised the SAME day ("Add real Maker Submit, then have Checker to Release it. Exactly the same
  // as A1."): browse-only wasn't enough — submitA4() is A4's own real, genuinely backend-persisted
  // Maker action (calls api.submitByMaker(), not api.release() or createMovement()).
  describe('submitA4', () => {
    it('does nothing when no movement is selected', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = null;

      comp.submitA4();

      expect(api.submitByMaker).not.toHaveBeenCalled();
    });

    it('calls api.submitByMaker() with the picked movement and model.createdBy, sets submitResult exactly like the generic submit() does', () => {
      const api = makeApi({ submitByMaker: jest.fn(() => of({ movementId: 'M1', status: 'PENDING', makerSubmittedBy: 'maker1' })) });
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = makeMovement({ movementId: 'M1' });
      comp.model.createdBy = 'maker1';

      comp.submitA4();

      expect(api.submitByMaker).toHaveBeenCalledWith('M1', 'maker1');
      expect(api.createMovement).not.toHaveBeenCalled();
      expect(comp.submitResult).toEqual({ movementId: 'M1', status: 'PENDING', makerSubmittedBy: 'maker1' });
      expect(comp.submitting).toBe(false);
    });

    it('falls back to maker1 when model.createdBy is falsy', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = makeMovement({ movementId: 'M1' });
      comp.model.createdBy = '';

      comp.submitA4();

      expect(api.submitByMaker).toHaveBeenCalledWith('M1', 'maker1');
    });

    it('sets submitError and clears submitting on a submitByMaker() failure', () => {
      const api = makeApi({ submitByMaker: jest.fn(() => throwError(() => ({ error: { message: 'submit boom' } }))) });
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = makeMovement({ movementId: 'M1' });

      comp.submitA4();

      expect(comp.submitError).toBe('submit boom');
      expect(comp.submitting).toBe(false);
      expect(comp.submitResult).toBeNull();
    });
  });

  describe('onSelectPayMovement clears a stale submitResult (A4 only)', () => {
    it('resets submitResult/submitError when a NEW Document Arrival is picked for A4', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.payableMovements = [makeMovement({ movementId: 'M1' }), makeMovement({ movementId: 'M2' })];
      comp.submitResult = { movementId: 'M1', status: 'PENDING' };
      comp.submitError = 'stale error';

      comp.onSelectPayMovement('M2');

      expect(comp.submitResult).toBeNull();
      expect(comp.submitError).toBeNull();
    });

    it('does NOT reset submitResult for a non-A4 function (A6) — settlesDocumentArrival keeps its own existing behavior', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A6'), api);
      comp.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000' })];
      comp.submitResult = { movementId: 'OLD', status: 'PENDING' };

      comp.onSelectPayMovement('M1');

      expect(comp.submitResult).toEqual({ movementId: 'OLD', status: 'PENDING' });
    });
  });

  describe('refreshSelectedContractSnapshot', () => {
    it('clears the snapshot and makes no API call when nothing is selected', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A3'), api);
      comp.selectedContract = null;

      comp.refreshSelectedContractSnapshot();

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('fetches and stores the snapshot for a plain function (no amount auto-fill branch)', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '4242' }))) });
      const comp = makeComponent(getFn('A3'), api);
      comp.selectedContract = makeContract({ balanceContractId: 'C1' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.selectedContractSnapshot?.availableBalance).toBe('4242');
      expect(comp.snapshotLoading).toBe(false);
    });

    it("A7 Full Settle: carries and locks Amount from the Acceptance's Available Balance", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '6600' }))) });
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.selectedContract = makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.model.amount).toBe('6600');
    });

    it("A9 (autoRedeemType): defaults Amount to the SG's Available Balance", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '999' }))) });
      const comp = makeComponent(getFn('A9'), api);
      comp.selectedContract = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.model.amount).toBe('999');
    });

    it('settlesAcceptanceOnMature + instrumentType EPLC_ACCEPTANCE (reached when movementType is not FULL_SETTLE): also defaults Amount to Available Balance', () => {
      // B5's own registry entry has movementType fixed to FULL_SETTLE, so the FULL_SETTLE branch always
      // wins first in practice (see the method's own branch order) — this synthetic variant (movementType
      // left at B5's documented alternate default, 'REIMBURSE', per this method's own doc comment) exercises
      // the settlesAcceptanceOnMature-specific branch directly for full coverage.
      const syntheticB5: TransactionFunction = { ...getFn('B5'), movementType: 'REIMBURSE' };
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '1234' }))) });
      const comp = makeComponent(syntheticB5, api);
      comp.model.instrumentType = 'EPLC_ACCEPTANCE';
      comp.model.movementType = 'REIMBURSE';
      comp.selectedContract = makeContract({ balanceContractId: 'EB1', instrumentType: 'EPLC_ACCEPTANCE' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.model.amount).toBe('1234');
    });

    it('clears the snapshot and snapshotLoading on a fetch error', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'boom' } }))) });
      const comp = makeComponent(getFn('A3'), api);
      comp.selectedContract = makeContract({ balanceContractId: 'C1' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.snapshotLoading).toBe(false);
    });
  });

  describe('searchExistingContract', () => {
    it('does nothing when model.instrumentType is unset', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A9'), api);
      comp.model.instrumentType = undefined;

      expect(() => comp.searchExistingContract()).not.toThrow();
      expect(comp.searchError).toBeNull();
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires LC Number', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(comp.searchError).toBe('LC Number is mandatory to search.');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires SG Number for a SHGT search', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: '' };

      comp.searchExistingContract();

      expect(comp.searchError).toBe('SG Number is mandatory to search.');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires IB Number for an Acceptance search', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: '' };

      comp.searchExistingContract();

      expect(comp.searchError).toContain('IB Number is mandatory to search');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('non-decreasing movementType: resolves and selects the contract without an availability check', () => {
      const found = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({ resolveContract: jest.fn(() => of(found)) });
      const comp = makeComponent(getFn('A8'), api); // A8 = SHGT ISSUE, not a decreasing movementType
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(api.resolveContract).toHaveBeenCalledWith('SHGT', { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' });
      expect(comp.selectedContract?.balanceContractId).toBe('SG1');
      // getSnapshot should NOT have been called for a 0-balance availability pre-check (non-decreasing movementType).
    });

    it('decreasing movementType with a 0 Available Balance: rejects with a clear message, never selects the contract', () => {
      const found = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({
        resolveContract: jest.fn(() => of(found)),
        getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '0' }))),
      });
      const comp = makeComponent(getFn('A9'), api); // A9 = SHGT FULL_REDEEM, decreasing
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(comp.searchError).toContain('SG SG01');
      expect(comp.searchError).toContain('0 Available Balance');
      expect(comp.selectedContract).toBeNull();
    });

    it('decreasing movementType with a nonzero Available Balance: selects the contract normally', () => {
      const found = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({
        resolveContract: jest.fn(() => of(found)),
        getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '5000' }))),
      });
      const comp = makeComponent(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(comp.selectedContract?.balanceContractId).toBe('SG1');
      expect(comp.searchError).toBeNull();
    });

    it('resolve error: clears the selection and shows the server message', () => {
      const api = makeApi({ resolveContract: jest.fn(() => throwError(() => ({ error: { message: 'not found' } }))) });
      const comp = makeComponent(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.searchError).toBe('not found');
    });
  });

  describe('onSelectParent', () => {
    it("A8 (creating movement, no tenorTypeOptions, no two-field search): auto-fills the new contract's LC Number from the picked Parent", () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A8'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('P1');

      expect(comp.selectedParent?.balanceContractId).toBe('P1');
      expect(comp.naturalKey.lcNumber).toBe('LC1');
    });

    it("A7 (usesTwoFieldSearch): drives Step 2 IB Index off the picked Parent's own LC Number", () => {
      const ibContract = makeContract({
        balanceContractId: 'IB1',
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null },
      });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'IPLC_ACCEPTANCE' ? of(makeCatalogPage([ibContract])) : of(makeCatalogPage([])),
        ),
      });
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];
      comp.selectedContract = makeContract({ balanceContractId: 'STALE' });
      comp.searchNaturalKey = { lcNumber: '', ibNumber: 'STALE_IB', sgNumber: '' };

      comp.onSelectParent('P1');

      expect(comp.searchNaturalKey.lcNumber).toBe('LC1');
      expect(comp.searchNaturalKey.ibNumber).toBe('');
      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.ibIndexPicker.contracts).toEqual([ibContract]);
    });

    it('A6 (settlesDocumentArrival + tenorTypeOptions): loads still-PENDING Document Arrivals and carries Tenor Type/Days from the Parent', () => {
      const pendingArrival = { movementId: 'M1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB01', amount: '1500' };
      const api = makeApi({ listMovements: jest.fn(() => of([pendingArrival])) });
      const comp = makeComponent(getFn('A6'), api);
      comp.parentPicker.contracts = [
        makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null }, tenorType: 'SELLERS_USANCE', tenorDays: 90 }),
      ];

      comp.onSelectParent('P1');

      expect(api.listMovements).toHaveBeenCalledWith('P1');
      expect(comp.payableMovements).toEqual([pendingArrival]);
      expect(comp.model.tenorType).toBe('SELLERS_USANCE');
      expect(comp.model.tenorDays).toBe(90);
    });

    it("B5 (settleableBalanceIndex): merges settleable candidates for the picked Confirmation's own LC Number", () => {
      const candidate = makeContract({
        balanceContractId: 'ACC1',
        instrumentType: 'EPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null },
      });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_ACCEPTANCE' ? of(makeCatalogPage([candidate])) : of(makeCatalogPage([])),
        ),
        getSnapshot: jest.fn((id: string) => (id === 'ACC1' ? of(makeSnapshot({ availableBalance: '4000' })) : of(makeSnapshot({ availableBalance: '0' })))),
      });
      const comp = makeComponent(getFn('B5'), api);
      comp.parentPicker.contracts = [
        makeContract({ balanceContractId: 'CNF1', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } }),
      ];

      comp.onSelectParent('CNF1');

      expect(comp.settleableBalances).toEqual([
        { balanceContractId: 'ACC1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' },
      ]);
      // Bug fixed 2026-08-18 ("There are function dependency, if pending in previous event, then next
      // event cannot be accessed") — an Acceptance whose own CREATE isn't Released yet shouldn't be
      // offered as a settlement target.
      expect(api.catalog).toHaveBeenCalledWith('EPLC_ACCEPTANCE', 'ACTIVE', undefined, 1, 50, 'EXP1', undefined, true);
    });

    it('B5 (settleableBalanceIndex): a catalog error for the candidate type is swallowed (catchError) and leaves settleableBalances empty', () => {
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_ACCEPTANCE' ? throwError(() => ({ error: { message: 'catalog boom' } })) : of(makeCatalogPage([])),
        ),
      });
      const comp = makeComponent(getFn('B5'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      expect(() => comp.onSelectParent('CNF1')).not.toThrow();

      expect(comp.settleableBalances).toEqual([]);
      expect(comp.settleableBalancesLoading).toBe(false);
    });

    it('B5 (settleableBalanceIndex): a getSnapshot error for one candidate is swallowed (catchError) and that candidate is excluded', () => {
      const candidate = makeContract({
        balanceContractId: 'ACC1',
        instrumentType: 'EPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null },
      });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_ACCEPTANCE' ? of(makeCatalogPage([candidate])) : of(makeCatalogPage([])),
        ),
        getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'snapshot boom' } }))),
      });
      const comp = makeComponent(getFn('B5'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('CNF1');

      expect(comp.settleableBalances).toEqual([]);
      expect(comp.settleableBalancesLoading).toBe(false);
    });

    it('does nothing (leaves selectedParent null, no side loads) when the contractId is not in parentPicker.contracts', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A6'), api);
      comp.parentPicker.contracts = [];

      comp.onSelectParent('missing');

      expect(comp.selectedParent).toBeNull();
      expect(comp.naturalKey.lcNumber).toBe('');
    });
  });

  // Business instruction 2026-08-16: "A1 Currency Code = Input; A2-A9 = Carry from A1 + Protected" /
  // "B1 = Input; B2-B5 = Carry from B1 + Protected".
  describe('carriedCurrency / Currency carry-and-protect (business instruction 2026-08-16)', () => {
    function currencyFieldProps(comp: TransactionBuilderComponent): { label: string; disabled: boolean } {
      const field = comp.fields.find((f) => f.key === 'currency');
      return { label: field?.props?.label as string, disabled: !!field?.props?.disabled };
    }

    it('A1 (LC Issue): carriedCurrency is null and the Currency field is a plain, editable Input', () => {
      const comp = makeComponent(getFn('A1'), makeApi());

      expect(comp.carriedCurrency).toBeNull();
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency', disabled: false });
    });

    it('B1 (Confirm LC): carriedCurrency is null and the Currency field is a plain, editable Input', () => {
      const comp = makeComponent(getFn('B1'), makeApi());

      expect(comp.carriedCurrency).toBeNull();
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency', disabled: false });
    });

    it("A2 (flat Catalog, non-hasParent): onSelectContract carries the picked LC's Currency into model.currency and locks the field", () => {
      const comp = makeComponent(getFn('A2'), makeApi());
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', currency: 'EUR' })];

      comp.onSelectContract('C1');

      expect(comp.model.currency).toBe('EUR');
      expect(comp.carriedCurrency).toBe('EUR');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it("B2 (flat Catalog, non-hasParent, Export side): onSelectContract carries the picked Confirmation's Currency", () => {
      const comp = makeComponent(getFn('B2'), makeApi());
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', instrumentType: 'EPLC_CONFIRMATION', currency: 'GBP' })];

      comp.onSelectContract('C1');

      expect(comp.model.currency).toBe('GBP');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it("A6 (Parent LC picker, hasParent): onSelectParent carries the parent LC's Currency and locks the field, before any Step 2 picker", () => {
      const comp = makeComponent(getFn('A6'), makeApi());
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', currency: 'JPY' })];

      comp.onSelectParent('P1');

      expect(comp.model.currency).toBe('JPY');
      expect(comp.carriedCurrency).toBe('JPY');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it("B5 (Parent LC picker, hasParent, Export side): onSelectParent carries the Confirmation's Currency", () => {
      const comp = makeComponent(getFn('B5'), makeApi());
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', instrumentType: 'EPLC_CONFIRMATION', currency: 'CNY' })];

      comp.onSelectParent('P1');

      expect(comp.model.currency).toBe('CNY');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it('selectedParent takes precedence over selectedContract when both happen to be set', () => {
      const comp = makeComponent(getFn('A6'), makeApi());
      comp.selectedParent = makeContract({ balanceContractId: 'P1', currency: 'JPY' });
      comp.selectedContract = makeContract({ balanceContractId: 'C1', currency: 'USD' });

      expect(comp.carriedCurrency).toBe('JPY');
    });

    it('switching back to A1 clears the lock (selectFunction resets selectedContract/selectedParent to null)', () => {
      const comp = makeComponent(getFn('A2'), makeApi());
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', currency: 'EUR' })];
      comp.onSelectContract('C1');
      expect(currencyFieldProps(comp).disabled).toBe(true);

      comp.selectFunction(getFn('A1'));

      expect(comp.carriedCurrency).toBeNull();
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency', disabled: false });
      expect(comp.model.currency).toBe('USD'); // selectFunction's own model reset default
    });
  });

  // Business requirement 2026-08-19 (fixing "Page 1/2 (12 total)" wrongly counting unfiltered
  // candidates — see CatalogPickerService's own module doc comment): Prev/Next are now pure
  // client-side windowing over the already-fetched, already-filtered set (display page size 5) —
  // neither ever triggers a new api.catalog call any more, regardless of LC context.
  describe('ibIndexPrevPage / ibIndexNextPage', () => {
    function setup() {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.model.instrumentType = 'IPLC_ACCEPTANCE';
      comp.searchNaturalKey.lcNumber = 'LC1';
      (api.catalog as jest.Mock).mockClear();
      return { api, comp };
    }

    it('ibIndexPrevPage is a no-op on page 1', () => {
      const { api, comp } = setup();
      comp.ibIndexPicker.page = 1;
      comp.ibIndexPicker.total = 12; // display pageSize 5 -> 3 pages

      comp.ibIndexPrevPage();

      expect(comp.ibIndexPicker.page).toBe(1);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexPrevPage moves back a page locally, without reloading', () => {
      const { api, comp } = setup();
      comp.ibIndexPicker.page = 2;
      comp.ibIndexPicker.total = 12;

      comp.ibIndexPrevPage();

      expect(comp.ibIndexPicker.page).toBe(1);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage is a no-op on the last page', () => {
      const { api, comp } = setup();
      comp.ibIndexPicker.page = 3; // totalPages = 3
      comp.ibIndexPicker.total = 12;

      comp.ibIndexNextPage();

      expect(comp.ibIndexPicker.page).toBe(3);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage moves forward a page locally, without reloading', () => {
      const { api, comp } = setup();
      comp.ibIndexPicker.page = 1;
      comp.ibIndexPicker.total = 12;

      comp.ibIndexNextPage();

      expect(comp.ibIndexPicker.page).toBe(2);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage moves the page locally even before any LC context is set (no reload, no API call either way)', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.model.instrumentType = undefined; // no LC picked yet
      comp.searchNaturalKey.lcNumber = '';
      comp.ibIndexPicker.page = 1;
      comp.ibIndexPicker.total = 12;
      (api.catalog as jest.Mock).mockClear();

      comp.ibIndexNextPage();

      expect(comp.ibIndexPicker.page).toBe(2);
      expect(api.catalog).not.toHaveBeenCalled();
    });
  });

  describe('loadIbIndex() guard (via onSelectParent) — clears the index when the guard fails', () => {
    it('clears ibIndexPicker.contracts/total without calling the api when the picked Parent has no LC Number of its own', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      // A degenerate parent (empty lcNumber) still resolves via onSelectParent() and still reaches
      // loadIbIndex() (usesTwoFieldSearch only depends on model.instrumentType/requiredNaturalKeyFields,
      // both already set by makeComponent's own subChoice), but loadIbIndex()'s own guard
      // (`!searchNaturalKey.lcNumber`) then correctly fails, since onSelectParent() carries the empty
      // lcNumber straight through to searchNaturalKey.
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: '', ibNumber: null, sgNumber: null } })];
      comp.ibIndexPicker.contracts = [makeContract({ balanceContractId: 'STALE' })];
      comp.ibIndexPicker.total = 7;
      (api.catalog as jest.Mock).mockClear();

      comp.onSelectParent('P1');

      expect(comp.searchNaturalKey.lcNumber).toBe('');
      expect(comp.ibIndexPicker.contracts).toEqual([]);
      expect(comp.ibIndexPicker.total).toBe(0);
      expect(api.catalog).not.toHaveBeenCalled();
    });
  });

  describe('onSelectSettleableBalance', () => {
    it("routes to the picked candidate's own real instrumentType and refreshes its snapshot", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '4000' }))) });
      const comp = makeComponent(getFn('B5'), api);
      comp.selectedParent = makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } });
      comp.settleableBalances = [{ balanceContractId: 'SB1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' }];

      comp.onSelectSettleableBalance('SB1');

      expect(comp.model.instrumentType).toBe('EPLC_ACCEPTANCE');
      expect(comp.selectedContract?.balanceContractId).toBe('SB1');
      expect(comp.searchNaturalKey.ibNumber).toBe('EB01');
      expect(api.getSnapshot).toHaveBeenCalledWith('SB1');
    });

    it('does nothing when the balanceContractId is not in settleableBalances', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('B5'), api);
      comp.settleableBalances = [{ balanceContractId: 'SB1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' }];
      comp.selectedContract = null;

      comp.onSelectSettleableBalance('missing');

      expect(comp.selectedContract).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('onSelectIbIndex', () => {
    it('selects the row directly, carries its IB/SG Number into searchNaturalKey, and refreshes the snapshot', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '3300' }))) });
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.ibIndexPicker.contracts = [
        makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null } }),
      ];
      comp.searchError = 'stale error';

      comp.onSelectIbIndex('IB1');

      expect(comp.selectedContract?.balanceContractId).toBe('IB1');
      expect(comp.searchNaturalKey.ibNumber).toBe('IB01');
      expect(comp.searchNaturalKey.sgNumber).toBe('');
      expect(comp.searchError).toBeNull();
      expect(comp.selectedContractSnapshot?.availableBalance).toBe('3300');
    });

    it('clears selectedContract (and skips the snapshot fetch) when the contractId is not in ibIndexPicker.contracts', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.ibIndexPicker.contracts = [makeContract({ balanceContractId: 'IB1' })];
      comp.searchNaturalKey.lcNumber = ''; // keep contextLcNumber falsy so syncCheckerToContext stays inert

      comp.onSelectIbIndex('missing');

      expect(comp.selectedContract).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('searchCheckerLc', () => {
    it('is a no-op when no function is selected', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A2'), api);
      (comp as unknown as { selectedFunction: unknown }).selectedFunction = null;

      expect(() => comp.searchCheckerLc()).not.toThrow();
      expect(comp.checkerContract).toBeNull();
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires an LC Number', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A2'), api);
      comp.checkerLcNumber = '';

      comp.searchCheckerLc();

      expect(comp.checkerSearchError).toBe('Type an LC Number to search.');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it("requires the secondary ref (IB/SG Number) when the function's instrumentType has one", () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE'); // IPLC_ACCEPTANCE -> ibNumber
      comp.checkerLcNumber = 'LC1';
      comp.checkerSecondaryRef = '';

      comp.searchCheckerLc();

      expect(comp.checkerSearchError).toContain('Type a IB Number to search');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('resolves the contract and loads the Checker queue on success (no secondary field needed)', () => {
      const contract = makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } });
      const pendingMovement = { movementId: 'M1', status: 'PENDING', movementType: 'AMEND_INCREASE' };
      const api = makeApi({
        resolveContract: jest.fn(() => of(contract)),
        listMovements: jest.fn(() => of([pendingMovement, { movementId: 'M2', status: 'RELEASED', movementType: 'AMEND_INCREASE' }])),
      });
      const comp = makeComponent(getFn('A2'), api);
      comp.checkerLcNumber = 'LC1';

      comp.searchCheckerLc();

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'LC1', ibNumber: null, sgNumber: null });
      expect(comp.checkerContract?.balanceContractId).toBe('C1');
      expect(comp.checkerSearching).toBe(false);
      expect(comp.checkerItems).toEqual([pendingMovement]); // loadCheckerQueue() side effect
    });

    it('sends ibNumber (not sgNumber) for an Acceptance-typed function', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.checkerLcNumber = 'LC1';
      comp.checkerSecondaryRef = 'IB01';

      comp.searchCheckerLc();

      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_ACCEPTANCE', { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null });
    });

    it('sets checkerSearchError from the server message on a resolve failure', () => {
      const api = makeApi({ resolveContract: jest.fn(() => throwError(() => ({ error: { message: 'no such SG' } }))) });
      const comp = makeComponent(getFn('A8'), api); // SHGT -> sgNumber
      comp.checkerLcNumber = 'LC1';
      comp.checkerSecondaryRef = 'SG01';

      comp.searchCheckerLc();

      expect(comp.checkerSearchError).toBe('no such SG');
      expect(comp.checkerSearching).toBe(false);
      expect(comp.checkerContract).toBeNull();
    });
  });
});
