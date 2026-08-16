import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot, CatalogPage } from './balance-component-api.service';
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
    it('loads the picked contract\'s live snapshot (plain function, no special branches)', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '5000' }))) });
      const comp = makeComponent(getFn('A3'), api);
      comp.catalogContracts = [makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectContract('C1');

      expect(comp.selectedContract?.balanceContractId).toBe('C1');
      expect(api.getSnapshot).toHaveBeenCalledWith('C1');
      expect(comp.selectedContractSnapshot?.availableBalance).toBe('5000');
    });

    it('sets selectedContract to null and skips the snapshot fetch when the id is not in catalogContracts', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A3'), api);
      comp.catalogContracts = [];

      comp.onSelectContract('missing');

      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('handles a snapshot-fetch error by leaving selectedContractSnapshot null and clearing snapshotLoading', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'snapshot boom' } }))) });
      const comp = makeComponent(getFn('A3'), api);
      comp.catalogContracts = [makeContract({ balanceContractId: 'C1' })];

      comp.onSelectContract('C1');

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.snapshotLoading).toBe(false);
    });

    it('A4 (payExistingUtilize): loads still-PENDING UTILIZE movements under the picked contract and auto-picks the sole one', () => {
      const pendingUtilize = { movementId: 'M1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB01', amount: '1000' };
      const releasedUtilize = { movementId: 'M2', status: 'RELEASED', movementType: 'UTILIZE' };
      const api = makeApi({ listMovements: jest.fn(() => of([pendingUtilize, releasedUtilize])) });
      const comp = makeComponent(getFn('A4'), api);
      comp.catalogContracts = [makeContract({ balanceContractId: 'C1' })];

      comp.onSelectContract('C1');

      expect(api.listMovements).toHaveBeenCalledWith('C1');
      expect(comp.payableMovements).toEqual([pendingUtilize]);
      // Only one PENDING match -> auto-picked (onSelectPayMovement side effect).
      expect(comp.selectedPayMovement?.movementId).toBe('M1');
    });

    it('B4 (movementTypeFromContractTenor + payableMovementInstrumentType): derives HONOUR for a Sight Confirmation and loads still-PENDING B3 CREATEs across child EPLC_EXAMINATION contracts', () => {
      const examinationContract = makeContract({
        balanceContractId: 'EX1',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null },
      });
      const pendingCreate = { movementId: 'MX1', status: 'PENDING', movementType: 'CREATE', amount: '2000', acknowledgedAt: '2026-08-16T00:00:00Z' };
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX1' ? of([pendingCreate]) : of([]))),
      });
      const comp = makeComponent(getFn('B4'), api);
      comp.catalogContracts = [
        makeContract({ balanceContractId: 'CNF1', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null }, tenorType: 'SIGHT' }),
      ];

      comp.onSelectContract('CNF1');

      expect(comp.model.movementType).toBe('HONOUR');
      expect(comp.payableMovements).toHaveLength(1);
      expect(comp.payableMovements[0].movementId).toBe('MX1');
      // Only one match -> auto-picked; B4 has secondaryRefLabel ('EB Number') so both naturalKey.ibNumber and model.secondaryRef get carried, from the EPLC_EXAMINATION contract's own naturalKey.ibNumber (merged in as a synthetic sourceTransactionRef).
      expect(comp.naturalKey.ibNumber).toBe('EB01');
      expect(comp.model.secondaryRef).toBe('EB01');
      expect(comp.model.amount).toBe('2000');
    });

    it('B4: derives ACCEPT for a Usance Confirmation, and excludes a not-yet-acknowledged B3 record (payableMovementRequiresAcknowledgment)', () => {
      const examinationContract = makeContract({ balanceContractId: 'EX2', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'EXP2', ibNumber: 'EB02', sgNumber: null } });
      const unacknowledgedCreate = { movementId: 'MX2', status: 'PENDING', movementType: 'CREATE', amount: '3000' }; // no acknowledgedAt
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX2' ? of([unacknowledgedCreate]) : of([]))),
      });
      const comp = makeComponent(getFn('B4'), api);
      comp.catalogContracts = [
        makeContract({ balanceContractId: 'CNF2', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'EXP2', ibNumber: null, sgNumber: null }, tenorType: 'SELLERS_USANCE' }),
      ];

      comp.onSelectContract('CNF2');

      expect(comp.model.movementType).toBe('ACCEPT');
      expect(comp.payableMovements).toHaveLength(0); // filtered out — not acknowledged
    });

    it('A3S (documentArrivalWithSg): loads the LC\'s outstanding SHGT records and auto-picks/fetches the sole one\'s snapshot', () => {
      const sgContract = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'SHGT' ? of(makeCatalogPage([sgContract])) : of(makeCatalogPage([])),
        ),
        getSnapshot: jest.fn((id: string) => (id === 'SG1' ? of(makeSnapshot({ availableBalance: '3000', confirmedBalance: '3000' })) : of(makeSnapshot()))),
      });
      const comp = makeComponent(getFn('A3S'), api);
      comp.catalogContracts = [makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectContract('C1');

      expect(comp.sgsForArrival).toHaveLength(1);
      expect(comp.selectedArrivalSg?.balanceContractId).toBe('SG1');
      expect(comp.arrivalSgSnapshot?.availableBalance).toBe('3000');
    });
  });

  describe('onSelectArrivalSg', () => {
    function setup() {
      const api = makeApi();
      const comp = makeComponent(getFn('A3S'), api);
      comp.sgsForArrival = [makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } })];
      return { api, comp };
    }

    it('fetches and stores the picked SG\'s live snapshot', () => {
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
      comp.payableMovements = [{ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000', status: 'PENDING', movementType: 'UTILIZE' }];

      comp.onSelectPayMovement('M1');

      expect(comp.selectedPayMovement?.movementId).toBe('M1');
      expect(comp.naturalKey.ibNumber).toBe('IB01');
      expect(comp.model.amount).toBe('5000');
      expect(comp.model.secondaryRef).toBeUndefined(); // A6 has no secondaryRefLabel
    });

    it('B4 (settlesDocumentArrival + secondaryRefLabel "EB Number"): also carries the reference into model.secondaryRef', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('B4'), api);
      comp.payableMovements = [{ movementId: 'MX1', sourceTransactionRef: 'EB01', amount: '2000', status: 'PENDING', movementType: 'CREATE' }];

      comp.onSelectPayMovement('MX1');

      expect(comp.naturalKey.ibNumber).toBe('EB01');
      expect(comp.model.secondaryRef).toBe('EB01');
      expect(comp.model.amount).toBe('2000');
    });

    it('A4 (no settlesDocumentArrival): sets selectedPayMovement but leaves naturalKey/model untouched', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.payableMovements = [{ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '999', status: 'PENDING', movementType: 'UTILIZE' }];
      comp.naturalKey.ibNumber = '';

      comp.onSelectPayMovement('M1');

      expect(comp.selectedPayMovement?.movementId).toBe('M1');
      expect(comp.naturalKey.ibNumber).toBe('');
    });

    it('sets selectedPayMovement to null when the movementId is not found', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A6'), api);
      comp.payableMovements = [{ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000', status: 'PENDING', movementType: 'UTILIZE' }];

      comp.onSelectPayMovement('missing');

      expect(comp.selectedPayMovement).toBeNull();
    });
  });

  describe('payExisting', () => {
    it('does nothing when no movement is selected', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = null;

      comp.payExisting();

      expect(api.release).not.toHaveBeenCalled();
    });

    it('releases the exact selected movement (never creates a new one) and refreshes dependent state', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedContract = makeContract({ balanceContractId: 'C1' });
      comp.selectedPayMovement = { movementId: 'M1', sourceTransactionRef: 'IB01', amount: '1000', status: 'PENDING', movementType: 'UTILIZE' };
      comp.model.createdBy = 'maker1';

      comp.payExisting();

      expect(api.createMovement).not.toHaveBeenCalled();
      expect(api.release).toHaveBeenCalledWith('M1', 'checker1');
      expect(comp.submitResult).toEqual({ movementId: 'REL1', status: 'RELEASED' });
      expect(comp.actionBusy).toBe(false);
      expect(api.getSnapshot).toHaveBeenCalledWith('C1'); // refreshSelectedContractSnapshot()
      expect(api.catalog).toHaveBeenCalled(); // reloadCatalog(catalogPage)
    });

    it('uses checker2 when createdBy is not maker1', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = { movementId: 'M2', status: 'PENDING', movementType: 'UTILIZE' };
      comp.model.createdBy = 'maker2';

      comp.payExisting();

      expect(api.release).toHaveBeenCalledWith('M2', 'checker2');
    });

    it('sets submitError and clears actionBusy on a release failure', () => {
      const api = makeApi({ release: jest.fn(() => throwError(() => ({ error: { message: 'release boom' } }))) });
      const comp = makeComponent(getFn('A4'), api);
      comp.selectedPayMovement = { movementId: 'M1', status: 'PENDING', movementType: 'UTILIZE' };

      comp.payExisting();

      expect(comp.submitError).toBe('release boom');
      expect(comp.actionBusy).toBe(false);
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

    it('A7 Full Settle: carries and locks Amount from the Acceptance\'s Available Balance', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '6600' }))) });
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.selectedContract = makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.model.amount).toBe('6600');
    });

    it('A9 (autoRedeemType): defaults Amount to the SG\'s Available Balance', () => {
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
      const syntheticB5 : TransactionFunction = { ...getFn('B5'), movementType: 'REIMBURSE' };
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
    it('A8 (creating movement, no tenorTypeOptions, no two-field search): auto-fills the new contract\'s LC Number from the picked Parent', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A8'), api);
      comp.parentCatalog = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('P1');

      expect(comp.selectedParent?.balanceContractId).toBe('P1');
      expect(comp.naturalKey.lcNumber).toBe('LC1');
    });

    it('A7 (usesTwoFieldSearch): drives Step 2 IB Index off the picked Parent\'s own LC Number', () => {
      const ibContract = makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null } });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) => (instrumentType === 'IPLC_ACCEPTANCE' ? of(makeCatalogPage([ibContract])) : of(makeCatalogPage([])))),
      });
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.parentCatalog = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];
      comp.selectedContract = makeContract({ balanceContractId: 'STALE' });
      comp.searchNaturalKey = { lcNumber: '', ibNumber: 'STALE_IB', sgNumber: '' };

      comp.onSelectParent('P1');

      expect(comp.searchNaturalKey.lcNumber).toBe('LC1');
      expect(comp.searchNaturalKey.ibNumber).toBe('');
      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.ibIndexCatalog).toEqual([ibContract]);
    });

    it('A6 (settlesDocumentArrival + tenorTypeOptions): loads still-PENDING Document Arrivals and carries Tenor Type/Days from the Parent', () => {
      const pendingArrival = { movementId: 'M1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB01', amount: '1500' };
      const api = makeApi({ listMovements: jest.fn(() => of([pendingArrival])) });
      const comp = makeComponent(getFn('A6'), api);
      comp.parentCatalog = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null }, tenorType: 'SELLERS_USANCE', tenorDays: 90 })];

      comp.onSelectParent('P1');

      expect(api.listMovements).toHaveBeenCalledWith('P1');
      expect(comp.payableMovements).toEqual([pendingArrival]);
      expect(comp.model.tenorType).toBe('SELLERS_USANCE');
      expect(comp.model.tenorDays).toBe(90);
    });

    it('B5 (settleableBalanceIndex): merges settleable candidates for the picked Confirmation\'s own LC Number', () => {
      const candidate = makeContract({ balanceContractId: 'ACC1', instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null } });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) => (instrumentType === 'EPLC_ACCEPTANCE' ? of(makeCatalogPage([candidate])) : of(makeCatalogPage([])))),
        getSnapshot: jest.fn((id: string) => (id === 'ACC1' ? of(makeSnapshot({ availableBalance: '4000' })) : of(makeSnapshot({ availableBalance: '0' })))),
      });
      const comp = makeComponent(getFn('B5'), api);
      comp.parentCatalog = [makeContract({ balanceContractId: 'CNF1', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('CNF1');

      expect(comp.settleableBalances).toEqual([
        { balanceContractId: 'ACC1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' },
      ]);
    });

    it('B5 (settleableBalanceIndex): a catalog error for the candidate type is swallowed (catchError) and leaves settleableBalances empty', () => {
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_ACCEPTANCE' ? throwError(() => ({ error: { message: 'catalog boom' } })) : of(makeCatalogPage([])),
        ),
      });
      const comp = makeComponent(getFn('B5'), api);
      comp.parentCatalog = [makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      expect(() => comp.onSelectParent('CNF1')).not.toThrow();

      expect(comp.settleableBalances).toEqual([]);
      expect(comp.settleableBalancesLoading).toBe(false);
    });

    it('B5 (settleableBalanceIndex): a getSnapshot error for one candidate is swallowed (catchError) and that candidate is excluded', () => {
      const candidate = makeContract({ balanceContractId: 'ACC1', instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null } });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) => (instrumentType === 'EPLC_ACCEPTANCE' ? of(makeCatalogPage([candidate])) : of(makeCatalogPage([])))),
        getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'snapshot boom' } }))),
      });
      const comp = makeComponent(getFn('B5'), api);
      comp.parentCatalog = [makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('CNF1');

      expect(comp.settleableBalances).toEqual([]);
      expect(comp.settleableBalancesLoading).toBe(false);
    });

    it('does nothing (leaves selectedParent null, no side loads) when the contractId is not in parentCatalog', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A6'), api);
      comp.parentCatalog = [];

      comp.onSelectParent('missing');

      expect(comp.selectedParent).toBeNull();
      expect(comp.naturalKey.lcNumber).toBe('');
    });
  });

  describe('ibIndexPrevPage / ibIndexNextPage', () => {
    function setup() {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.model.instrumentType = 'IPLC_ACCEPTANCE';
      comp.searchNaturalKey.lcNumber = 'LC1';
      (api.catalog as jest.Mock).mockClear();
      return { api, comp };
    }

    it('ibIndexPrevPage decrements and reloads when not on page 1', () => {
      const { api, comp } = setup();
      comp.ibIndexPage = 2;
      comp.ibIndexTotal = 25; // pageSize 10 -> 3 pages

      comp.ibIndexPrevPage();

      expect(comp.ibIndexPage).toBe(1);
      // BAL-003 (Quality-report-balance.md): loadIbIndexPage now delegates to the shared
      // loadPagedCatalog helper, which always passes all 7 catalog() positional args (tenorFamily
      // explicitly undefined when unset) rather than omitting a trailing one — behaviorally identical
      // (catalog()'s own tenorFamily param is undefined either way), just a visible arg-count change.
      expect(api.catalog).toHaveBeenCalledWith('IPLC_ACCEPTANCE', 'ACTIVE', undefined, 1, 10, 'LC1', undefined);
    });

    it('ibIndexPrevPage is a no-op on page 1', () => {
      const { api, comp } = setup();
      comp.ibIndexPage = 1;
      comp.ibIndexTotal = 25;

      comp.ibIndexPrevPage();

      expect(comp.ibIndexPage).toBe(1);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage increments and reloads when below the last page', () => {
      const { api, comp } = setup();
      comp.ibIndexPage = 1;
      comp.ibIndexTotal = 25;

      comp.ibIndexNextPage();

      expect(comp.ibIndexPage).toBe(2);
      expect(api.catalog).toHaveBeenCalledWith('IPLC_ACCEPTANCE', 'ACTIVE', undefined, 2, 10, 'LC1', undefined);
    });

    it('ibIndexNextPage is a no-op on the last page', () => {
      const { api, comp } = setup();
      comp.ibIndexPage = 3;
      comp.ibIndexTotal = 25; // totalPages = 3

      comp.ibIndexNextPage();

      expect(comp.ibIndexPage).toBe(3);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage clears the index (no API call) when reached before any LC context is set', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.model.instrumentType = undefined; // no LC picked yet — loadIbIndexPage's own defensive guard
      comp.searchNaturalKey.lcNumber = '';
      comp.ibIndexPage = 1;
      comp.ibIndexTotal = 25;
      (api.catalog as jest.Mock).mockClear();

      comp.ibIndexNextPage();

      expect(comp.ibIndexPage).toBe(2);
      expect(comp.ibIndexCatalog).toEqual([]);
      expect(comp.ibIndexTotal).toBe(0);
      expect(api.catalog).not.toHaveBeenCalled();
    });
  });

  describe('onSelectSettleableBalance', () => {
    it('routes to the picked candidate\'s own real instrumentType and refreshes its snapshot', () => {
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
      comp.ibIndexCatalog = [makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC1', ibNumber: 'IB01', sgNumber: null } })];
      comp.searchError = 'stale error';

      comp.onSelectIbIndex('IB1');

      expect(comp.selectedContract?.balanceContractId).toBe('IB1');
      expect(comp.searchNaturalKey.ibNumber).toBe('IB01');
      expect(comp.searchNaturalKey.sgNumber).toBe('');
      expect(comp.searchError).toBeNull();
      expect(comp.selectedContractSnapshot?.availableBalance).toBe('3300');
    });

    it('clears selectedContract (and skips the snapshot fetch) when the contractId is not in ibIndexCatalog', () => {
      const api = makeApi();
      const comp = makeComponent(getFn('A7'), api, 'FULL_SETTLE');
      comp.ibIndexCatalog = [makeContract({ balanceContractId: 'IB1' })];
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

    it('requires the secondary ref (IB/SG Number) when the function\'s instrumentType has one', () => {
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
