import { FormGroup } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, TransactionFunction } from './balance-component.model';

/**
 * Direct-instantiation, no-TestBed unit tests (house style — see
 * lc-payment-wc's leg-allocator.component.spec.ts) for a slice of
 * TransactionBuilderComponent's ~50 methods: constructor,
 * selectFunctionSide, selectFunction, onSubChoice, reloadCatalog,
 * onCatalogSearch, onSelectFlattenedPayable, catalogIbHint,
 * catalogPrevPage/catalogNextPage, onParentInstrumentTypeChange,
 * onParentSearch, parentPrevPage/parentNextPage,
 * onPayableMovementSearchChange, catalogPendingHint, displayStatus.
 */

function findFn(list: TransactionFunction[], code: string): TransactionFunction {
  const fn = list.find((f) => f.code === code);
  if (!fn) throw new Error(`Function ${code} not found in registry`);
  return fn;
}

const A1 = findFn(IMPORT_FUNCTIONS, 'A1'); // LC Issue — fixed movementType ISSUE, tenorTypeOptions, no parent
const A2 = findFn(IMPORT_FUNCTIONS, 'A2'); // LC Amendment — subChoice, no fixed movementType
const A4 = findFn(IMPORT_FUNCTIONS, 'A4'); // Sight Settlement — payExistingUtilize, catalogTenorFilter SIGHT
const A6 = findFn(IMPORT_FUNCTIONS, 'A6'); // Acceptance (Usance) — defaultParentInstrumentType, tenorTypeOptions, settlesDocumentArrival
const B1 = findFn(EXPORT_FUNCTIONS, 'B1'); // Confirm LC — export side, fixed movementType

function mkContract(id: string, lcNumber: string, overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: id,
    logicalContractId: `logical-${id}`,
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber, ibNumber: null, sgNumber: null },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  };
}

function mkSnapshot(id: string, overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: id,
    logicalContractId: `logical-${id}`,
    currency: 'USD',
    confirmedBalance: '100000',
    availableBalance: '100000',
    pendingEarmarkTotal: '0',
    ...overrides,
  };
}

function mkMovement(id: string, overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: id,
    balanceContractId: 'c1',
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

function mkCatalogPage(items: BalanceContract[], total?: number): CatalogPage {
  return { items, total: total ?? items.length, page: 1, pageSize: 10 };
}

function makeApiMock() {
  return {
    createMovement: jest.fn(),
    release: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    acknowledge: jest.fn(),
    resolveContract: jest.fn(),
    catalog: jest.fn(() => of(mkCatalogPage([]))),
    getSnapshot: jest.fn((id: string) => of(mkSnapshot(id))),
    listMovements: jest.fn(() => of([] as any[])),
  };
}

function makeComponent() {
  const mockApi = makeApiMock();
  const comp = new TransactionBuilderComponent(mockApi as unknown as BalanceComponentApiService);
  return { comp, mockApi };
}

describe('TransactionBuilderComponent', () => {
  describe('constructor', () => {
    it('initializes default state', () => {
      const { comp } = makeComponent();

      expect(comp.activeFunctionSide).toBe('IMPORT');
      expect(comp.selectedFunction).toBeNull();
      expect(comp.subChoiceValue).toBe('');
      expect(comp.form).toBeInstanceOf(FormGroup);
      expect(comp.model.currency).toBe('USD');
      expect(comp.model.createdBy).toBe('maker1');
      expect(typeof comp.model.eventSeq).toBe('number');
      expect(comp.naturalKey).toEqual({ lcNumber: '', ibNumber: '', sgNumber: '' });
      expect(comp.catalogPicker.page).toBe(1);
      expect(comp.catalogPageSize).toBe(10);
      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.selectedContract).toBeNull();
      expect(comp.submitResult).toBeNull();
      expect(comp.checkerLcNumber).toBe('');
    });

    it('stores the injected api service (used by every other method)', () => {
      const { comp, mockApi } = makeComponent();
      comp.reloadCatalog();
      // instrumentType unset -> early return, api never touched, but the field exists and is usable.
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });
  });

  describe('selectFunctionSide', () => {
    it('IMPORT sets lookup.instrumentType to IPLC_LC and leaves sgNumber alone', () => {
      const { comp } = makeComponent();
      comp.lookUp.lookup.sgNumber = 'SG1';
      comp.selectFunctionSide('IMPORT');

      expect(comp.activeFunctionSide).toBe('IMPORT');
      expect(comp.lookUp.lookup.instrumentType).toBe('IPLC_LC');
      expect(comp.lookUp.lookup.sgNumber).toBe('SG1');
    });

    it('EXPORT sets lookup.instrumentType to EPLC_CONFIRMATION and clears sgNumber (no SG on Export)', () => {
      const { comp } = makeComponent();
      comp.lookUp.lookup.sgNumber = 'SG1';
      comp.selectFunctionSide('EXPORT');

      expect(comp.activeFunctionSide).toBe('EXPORT');
      expect(comp.lookUp.lookup.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(comp.lookUp.lookup.sgNumber).toBe('');
    });
  });

  describe('selectFunction', () => {
    it('a function with a fixed movementType pins instrumentType+movementType immediately (A1)', () => {
      const { comp, mockApi } = makeComponent();
      comp.selectFunction(A1);

      expect(comp.selectedFunction).toBe(A1);
      expect(comp.activeFunctionSide).toBe('IMPORT');
      expect(comp.model.instrumentType).toBe('IPLC_LC');
      expect(comp.model.movementType).toBe('ISSUE');
      // A1/B1 special-case: Tenor Type defaults to Sight.
      expect(comp.model.tenorType).toBe('SIGHT');
      // A1 is a creating movement with no parent -> neither reloadCatalog nor
      // onParentInstrumentTypeChange's api.catalog call should fire.
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('a function with a subChoice leaves movementType unset until onSubChoice (A2)', () => {
      const { comp } = makeComponent();
      comp.selectFunction(A2);

      expect(comp.selectedFunction).toBe(A2);
      expect(comp.model.instrumentType).toBeUndefined();
      expect(comp.model.movementType).toBeUndefined();
      expect(comp.dynamicSecondaryRefLabel).toBe('Amendment No./Times');
    });

    it('pre-selects defaultParentInstrumentType and reloads the parent catalog (A6)', () => {
      const { comp, mockApi } = makeComponent();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectFunction(A6);

      expect(comp.parentInstrumentType).toBe('IPLC_LC');
      // afterResolved() -> onParentInstrumentTypeChange() -> loadParentPage(1) -> api.catalog
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.parentPageSize, undefined, 'USANCE');
    });

    it('leaves parentInstrumentType empty when the function has no defaultParentInstrumentType (A1)', () => {
      const { comp } = makeComponent();
      comp.selectFunction(A1);
      expect(comp.parentInstrumentType).toBe('');
    });

    it('resets prior selection/catalog/parent/snapshot state on every pick', () => {
      const { comp, mockApi } = makeComponent();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      // Poison the state as if a previous function had been fully used.
      comp.catalogPicker.page = 5;
      comp.catalogPicker.total = 99;
      comp.catalogPicker.search = 'stale';
      comp.selectedContract = mkContract('c1', '001');
      comp.selectedContractSnapshot = mkSnapshot('c1');
      comp.parentPicker.contracts = [mkContract('p1', '002')];
      comp.parentPicker.page = 3;
      comp.parentPicker.total = 30;
      comp.parentPicker.search = 'stale';
      comp.parentInstrumentType = 'SHGT';
      comp.ibIndexPicker.contracts = [mkContract('ib1', '003')];
      comp.ibIndexPicker.page = 2;
      comp.ibIndexPicker.total = 20;
      comp.settleableBalances = [{ balanceContractId: 'x', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: null, availableBalance: '1', currency: 'USD' }];
      comp.payableMovements = [mkMovement('m1')];
      comp.payableMovementSearch = 'stale';
      comp.selectedPayMovement = mkMovement('m1');
      comp.arrivalApproved = true;
      comp.submitResult = { ok: true };
      comp.submitError = 'boom';
      comp.sgsForArrival = [mkContract('sg1', '004')];
      comp.selectedArrivalSg = mkContract('sg1', '004');
      comp.arrivalSgSnapshot = mkSnapshot('sg1');
      comp.arrivalSgRedeemMovementId = 'mv1';
      comp.dueFromIssuingBankMovementId = 'mv2';
      comp.acceptanceReimbReceivableMovementId = 'mv3';
      comp.acceptanceMovementId = 'mv4';
      comp.matchedReceivableMovementId = 'mv5';
      comp.checkerContract = mkContract('ck1', '005');
      comp.checkerSearchError = 'stale';
      comp.checkerItems = [mkMovement('m2')];
      comp.selectedCheckerMovement = mkMovement('m2');
      comp.checkerError = 'stale';
      comp.checkerLcNumber = 'S001'; // deliberately NOT reset

      comp.selectFunction(A2);

      expect(comp.catalogPicker.page).toBe(1);
      expect(comp.catalogPicker.total).toBe(0);
      expect(comp.catalogPicker.search).toBe('');
      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.parentPicker.contracts).toEqual([]);
      expect(comp.parentPicker.page).toBe(1);
      expect(comp.parentPicker.total).toBe(0);
      expect(comp.parentPicker.search).toBe('');
      expect(comp.parentInstrumentType).toBe(''); // A2 has no defaultParentInstrumentType
      expect(comp.ibIndexPicker.contracts).toEqual([]);
      expect(comp.ibIndexPicker.page).toBe(1);
      expect(comp.ibIndexPicker.total).toBe(0);
      expect(comp.settleableBalances).toEqual([]);
      expect(comp.payableMovements).toEqual([]);
      expect(comp.payableMovementSearch).toBe('');
      expect(comp.selectedPayMovement).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.submitResult).toBeNull();
      expect(comp.submitError).toBeNull();
      expect(comp.sgsForArrival).toEqual([]);
      expect(comp.selectedArrivalSg).toBeNull();
      expect(comp.arrivalSgSnapshot).toBeNull();
      expect(comp.arrivalSgRedeemMovementId).toBeNull();
      expect(comp.dueFromIssuingBankMovementId).toBeNull();
      expect(comp.acceptanceReimbReceivableMovementId).toBeNull();
      expect(comp.acceptanceMovementId).toBeNull();
      expect(comp.matchedReceivableMovementId).toBeNull();
      expect(comp.checkerContract).toBeNull();
      expect(comp.checkerSearchError).toBeNull();
      expect(comp.checkerItems).toEqual([]);
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerError).toBeNull();
      // Deliberately NOT reset.
      expect(comp.checkerLcNumber).toBe('S001');
    });

    it('resets naturalKey/searchNaturalKey/searchError and re-syncs lookup.instrumentType per side (B1)', () => {
      const { comp } = makeComponent();
      comp.naturalKey = { lcNumber: 'X', ibNumber: 'Y', sgNumber: 'Z' };
      comp.searchNaturalKey = { lcNumber: 'X', ibNumber: 'Y', sgNumber: 'Z' };
      comp.searchError = 'stale';
      comp.lookUp.lookup.sgNumber = 'SG1';

      comp.selectFunction(B1);

      expect(comp.naturalKey).toEqual({ lcNumber: '', ibNumber: '', sgNumber: '' });
      expect(comp.searchNaturalKey).toEqual({ lcNumber: '', ibNumber: '', sgNumber: '' });
      expect(comp.searchError).toBeNull();
      expect(comp.activeFunctionSide).toBe('EXPORT');
      expect(comp.lookUp.lookup.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(comp.lookUp.lookup.sgNumber).toBe('');
      expect(comp.model.tenorType).toBe('SIGHT'); // B1 also gets the Sight default
    });
  });

  describe('onSubChoice', () => {
    it('does nothing when no function is selected', () => {
      const { comp } = makeComponent();
      comp.subChoiceValue = 'AMEND_INCREASE';
      comp.onSubChoice();
      expect(comp.model.movementType).toBeUndefined();
    });

    it('does nothing when subChoiceValue is empty', () => {
      const { comp } = makeComponent();
      comp.selectedFunction = A2;
      comp.subChoiceValue = '';
      comp.onSubChoice();
      expect(comp.model.movementType).toBeUndefined();
    });

    it('resolves instrumentType/movementType from the picked sub-choice and triggers afterResolved', () => {
      const { comp, mockApi } = makeComponent();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = A2;
      comp.subChoiceValue = 'AMEND_INCREASE';

      comp.onSubChoice();

      expect(comp.model.instrumentType).toBe('IPLC_LC');
      expect(comp.model.movementType).toBe('AMEND_INCREASE');
      // afterResolved -> rebuildFields (fields populated) and, since AMEND_INCREASE is not a creating
      // movementType and IPLC_LC needs no two-field search, reloadCatalog() fires.
      expect(comp.fields.length).toBeGreaterThan(0);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.catalogPageSize, undefined, undefined);
    });

    it('resolves a different sub-choice value to a different movementType (AMEND_DECREASE)', () => {
      const { comp, mockApi } = makeComponent();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = A2;
      comp.subChoiceValue = 'AMEND_DECREASE';

      comp.onSubChoice();

      expect(comp.model.movementType).toBe('AMEND_DECREASE');
    });
  });

  describe('reloadCatalog', () => {
    it('does nothing (clears catalog) when model.instrumentType is unset', () => {
      const { comp, mockApi } = makeComponent();
      comp.catalogPicker.contracts = [mkContract('c1', '001')];
      comp.catalogPicker.total = 5;

      comp.reloadCatalog();

      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('does nothing (clears catalog) when the function is a creating movement (ISSUE)', () => {
      const { comp, mockApi } = makeComponent();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'ISSUE';
      comp.catalogPicker.contracts = [mkContract('c1', '001')];
      comp.catalogPicker.total = 5;

      comp.reloadCatalog();

      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it("calls api.catalog with instrumentType + the function's own catalogTenorFilter, and populates catalogPicker.contracts/catalogPicker.total", () => {
      const { comp, mockApi } = makeComponent();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.selectedFunction = A4; // catalogTenorFilter: 'SIGHT'
      const c1 = mkContract('c1', '001');
      const c2 = mkContract('c2', '002');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1, c2], 2)));
      mockApi.getSnapshot.mockImplementation((id: string) => of(mkSnapshot(id)));
      mockApi.listMovements.mockReturnValue(of([]));

      comp.reloadCatalog(1);

      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.catalogPageSize, undefined, 'SIGHT');
      expect(comp.catalogPicker.contracts).toEqual([c1, c2]);
      expect(comp.catalogPicker.total).toBe(2);
      expect(comp.catalogPicker.page).toBe(1);
      // loadSnapshotsInto populated catalogPicker.snapshots via forkJoin(getSnapshot).
      expect(comp.catalogPicker.snapshots.get('c1')).toEqual(mkSnapshot('c1'));
      expect(comp.catalogPicker.snapshots.get('c2')).toEqual(mkSnapshot('c2'));
    });

    it('passes catalogPicker.search as the q filter when set', () => {
      const { comp, mockApi } = makeComponent();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.search = 'S001';

      comp.reloadCatalog(1);

      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', 'S001', 1, comp.catalogPageSize, undefined, undefined);
    });

    it('loads payable IB hints (catalogPayableIbs/catalogPayableMovements) when the function has payExistingUtilize', () => {
      const { comp, mockApi } = makeComponent();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.selectedFunction = A4; // payExistingUtilize: true
      const c1 = mkContract('c1', '810');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1], 1)));
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));
      mockApi.listMovements.mockReturnValue(
        of([
          { movementId: 'm1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB00001' },
          { movementId: 'm2', status: 'RELEASED', movementType: 'UTILIZE', sourceTransactionRef: 'IB00002' },
        ]),
      );

      comp.reloadCatalog(1);

      expect(comp.catalogPayableIbs.get('c1')).toEqual(['IB00001']);
      expect(comp.catalogPayableMovements.get('c1')?.map((m: any) => m.movementId)).toEqual(['m1']);
    });

    it('handles an error response by clearing catalogPicker.contracts/catalogPicker.total instead of throwing', () => {
      const { comp, mockApi } = makeComponent();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.contracts = [mkContract('c1', '001')];
      comp.catalogPicker.total = 3;
      mockApi.catalog.mockReturnValue(throwError(() => new Error('server down')));

      expect(() => comp.reloadCatalog(1)).not.toThrow();
      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
    });
  });

  describe('onCatalogSearch', () => {
    it('resets to page 1 and reloads the catalog', () => {
      const { comp, mockApi } = makeComponent();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.page = 4;
      comp.catalogPicker.search = 'U003';
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      comp.onCatalogSearch();

      expect(comp.catalogPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', 'U003', 1, comp.catalogPageSize, undefined, undefined);
    });
  });

  describe('onSelectFlattenedPayable', () => {
    it('sets selectedContract, refreshes its snapshot, wires payableMovements from the flattened cache, and selects the movement', () => {
      const { comp, mockApi } = makeComponent();
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.contracts = [c1];
      const movement = mkMovement('m1', { sourceTransactionRef: 'IB00001', amount: '25000' });
      comp.catalogPayableMovements.set('c1', [movement]);
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));

      comp.onSelectFlattenedPayable('c1', 'm1');

      expect(comp.selectedContract).toBe(c1);
      expect(mockApi.getSnapshot).toHaveBeenCalledWith('c1');
      expect(comp.selectedContractSnapshot).toEqual(mkSnapshot('c1'));
      expect(comp.payableMovements).toEqual([movement]);
      expect(comp.payableMovementsLoading).toBe(false);
      expect(comp.selectedPayMovement).toBe(movement);
    });

    it('auto-fills and locks the Acceptance amount/IB Number for a settlesDocumentArrival function (A6)', () => {
      const { comp, mockApi } = makeComponent();
      const c1 = mkContract('c1', '810');
      comp.selectedFunction = A6; // settlesDocumentArrival: true
      comp.catalogPicker.contracts = [c1];
      const movement = mkMovement('m1', { sourceTransactionRef: 'IB00001', amount: '25000' });
      comp.catalogPayableMovements.set('c1', [movement]);
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));

      comp.onSelectFlattenedPayable('c1', 'm1');

      expect(comp.naturalKey.ibNumber).toBe('IB00001');
      expect(comp.model.amount).toBe('25000');
    });

    it('leaves selectedContract null when the contractId is not in catalogPicker.contracts', () => {
      const { comp } = makeComponent();
      comp.catalogPicker.contracts = [mkContract('c1', '810')];

      comp.onSelectFlattenedPayable('missing', 'm1');

      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
    });
  });

  describe('catalogIbHint', () => {
    it('returns empty string when there are no pending IBs for the contract', () => {
      const { comp } = makeComponent();
      const c1 = mkContract('c1', '810');
      expect(comp.catalogIbHint(c1)).toBe('');
    });

    it('renders a single pending IB inline', () => {
      const { comp } = makeComponent();
      const c1 = mkContract('c1', '810');
      comp.catalogPayableIbs.set('c1', ['IB00001']);
      expect(comp.catalogIbHint(c1)).toBe(' — IB00001');
    });

    it('renders multiple pending IBs with a count prefix', () => {
      const { comp } = makeComponent();
      const c1 = mkContract('c1', '810');
      comp.catalogPayableIbs.set('c1', ['IB00001', 'IB00002']);
      expect(comp.catalogIbHint(c1)).toBe(' — 2 pending: IB00001, IB00002');
    });
  });

  describe('catalogPrevPage / catalogNextPage', () => {
    function setupPaged(comp: TransactionBuilderComponent, mockApi: ReturnType<typeof makeApiMock>) {
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.total = 25; // pageSize 10 -> 3 pages
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([], 25)));
    }

    it('catalogPrevPage is a no-op on page 1', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.catalogPicker.page = 1;

      comp.catalogPrevPage();

      expect(comp.catalogPicker.page).toBe(1);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('catalogPrevPage reloads the previous page when not on page 1', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.catalogPicker.page = 3;

      comp.catalogPrevPage();

      expect(comp.catalogPicker.page).toBe(2);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 2, comp.catalogPageSize, undefined, undefined);
    });

    it('catalogNextPage is a no-op on the last page', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.catalogPicker.page = 3; // totalPages = 3

      comp.catalogNextPage();

      expect(comp.catalogPicker.page).toBe(3);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('catalogNextPage reloads the next page when not on the last page', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.catalogPicker.page = 1;

      comp.catalogNextPage();

      expect(comp.catalogPicker.page).toBe(2);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 2, comp.catalogPageSize, undefined, undefined);
    });
  });

  describe('onParentInstrumentTypeChange', () => {
    it('resets selectedParent/exposureNature and reloads the parent catalog page 1', () => {
      const { comp, mockApi } = makeComponent();
      comp.selectedFunction = A6; // tenorTypeOptions set -> parentTenorFamily 'USANCE'
      comp.parentInstrumentType = 'IPLC_LC';
      comp.selectedParent = mkContract('p1', '001');
      comp.exposureNature = 'MEMO';
      const p1 = mkContract('p1', '001');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([p1], 1)));
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('p1')));

      comp.onParentInstrumentTypeChange();

      expect(comp.selectedParent).toBeNull();
      expect(comp.exposureNature).toBe('ACTUAL');
      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.parentPageSize, undefined, 'USANCE');
      expect(comp.parentPicker.contracts).toEqual([p1]);
      expect(comp.parentPicker.total).toBe(1);
    });

    it('clears the parent catalog without calling the api when parentInstrumentType is empty', () => {
      const { comp, mockApi } = makeComponent();
      comp.parentInstrumentType = '';
      comp.parentPicker.contracts = [mkContract('p1', '001')];
      comp.parentPicker.total = 5;

      comp.onParentInstrumentTypeChange();

      expect(comp.parentPicker.contracts).toEqual([]);
      expect(comp.parentPicker.total).toBe(0);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('handles a catalog error by clearing parentPicker.contracts/parentPicker.total', () => {
      const { comp, mockApi } = makeComponent();
      comp.parentInstrumentType = 'IPLC_LC';
      comp.parentPicker.contracts = [mkContract('p1', '001')];
      comp.parentPicker.total = 5;
      mockApi.catalog.mockReturnValue(throwError(() => new Error('fail')));

      expect(() => comp.onParentInstrumentTypeChange()).not.toThrow();
      expect(comp.parentPicker.contracts).toEqual([]);
      expect(comp.parentPicker.total).toBe(0);
    });
  });

  describe('onParentSearch', () => {
    it('reloads the parent catalog at page 1 using the current parentPicker.search text', () => {
      const { comp, mockApi } = makeComponent();
      comp.parentInstrumentType = 'IPLC_LC';
      comp.parentPicker.page = 4;
      comp.parentPicker.search = 'U002';
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      comp.onParentSearch();

      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', 'U002', 1, comp.parentPageSize, undefined, undefined);
    });
  });

  describe('parentPrevPage / parentNextPage', () => {
    function setupPaged(comp: TransactionBuilderComponent, mockApi: ReturnType<typeof makeApiMock>) {
      comp.parentInstrumentType = 'IPLC_LC';
      comp.parentPicker.total = 15; // pageSize 10 -> 2 pages
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([], 15)));
    }

    it('parentPrevPage is a no-op on page 1', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.parentPicker.page = 1;

      comp.parentPrevPage();

      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('parentPrevPage reloads the previous page otherwise', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.parentPicker.page = 2;

      comp.parentPrevPage();

      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.parentPageSize, undefined, undefined);
    });

    it('parentNextPage is a no-op on the last page', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.parentPicker.page = 2; // totalPages = 2

      comp.parentNextPage();

      expect(comp.parentPicker.page).toBe(2);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('parentNextPage reloads the next page otherwise', () => {
      const { comp, mockApi } = makeComponent();
      setupPaged(comp, mockApi);
      comp.parentPicker.page = 1;

      comp.parentNextPage();

      expect(comp.parentPicker.page).toBe(2);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 2, comp.parentPageSize, undefined, undefined);
    });
  });

  describe('onPayableMovementSearchChange', () => {
    it('sets payableMovementSearch and auto-picks when narrowed to exactly one match', () => {
      const { comp } = makeComponent();
      const m1 = mkMovement('m1', { sourceTransactionRef: 'IB00001' });
      comp.payableMovements = [m1, mkMovement('m2', { sourceTransactionRef: 'IB00002' })];

      comp.onPayableMovementSearchChange('IB00001');

      expect(comp.payableMovementSearch).toBe('IB00001');
      expect(comp.selectedPayMovement).toEqual(m1);
    });

    it('does not auto-pick when the search still matches more than one movement', () => {
      const { comp } = makeComponent();
      comp.payableMovements = [mkMovement('m1', { sourceTransactionRef: 'IB00001' }), mkMovement('m2', { sourceTransactionRef: 'IB00002' })];

      comp.onPayableMovementSearchChange('IB000');

      expect(comp.selectedPayMovement).toBeNull();
    });

    it('does not auto-pick when the search matches nothing', () => {
      const { comp } = makeComponent();
      comp.payableMovements = [mkMovement('m1', { sourceTransactionRef: 'IB00001' })];

      comp.onPayableMovementSearchChange('zzz');

      expect(comp.payableMovementSearch).toBe('zzz');
      expect(comp.selectedPayMovement).toBeNull();
    });
  });

  describe('catalogPendingHint', () => {
    it('returns empty string when the function does not payExistingUtilize', () => {
      const { comp } = makeComponent();
      comp.selectedFunction = A6; // no payExistingUtilize
      const c1 = mkContract('c1', '810');
      expect(comp.catalogPendingHint(c1)).toBe('');
    });

    it('returns empty string when there is no snapshot yet', () => {
      const { comp } = makeComponent();
      comp.selectedFunction = A4; // payExistingUtilize: true
      const c1 = mkContract('c1', '810');
      expect(comp.catalogPendingHint(c1)).toBe('');
    });

    it('returns empty string when pendingEarmarkTotal is 0', () => {
      const { comp } = makeComponent();
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.snapshots.set('c1', mkSnapshot('c1', { pendingEarmarkTotal: '0' }));
      expect(comp.catalogPendingHint(c1)).toBe('');
    });

    it('renders "Pending: <amount>" (thousand-separated) for a single pending IB', () => {
      const { comp } = makeComponent();
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.snapshots.set('c1', mkSnapshot('c1', { pendingEarmarkTotal: '-25000' }));
      comp.catalogPayableIbs.set('c1', ['IB00001']);
      expect(comp.catalogPendingHint(c1)).toBe(' — Pending: 25,000');
    });

    it('renders "Total Pending: <amount>" when more than one IB is pending', () => {
      const { comp } = makeComponent();
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.snapshots.set('c1', mkSnapshot('c1', { pendingEarmarkTotal: '-1234567.89' }));
      comp.catalogPayableIbs.set('c1', ['IB00001', 'IB00002']);
      expect(comp.catalogPendingHint(c1)).toBe(' — Total Pending: 1,234,567.89');
    });
  });

  describe('displayStatus', () => {
    it('relabels RELEASED as Approved (display-only)', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('RELEASED')).toBe('Approved');
    });

    it('passes every other status through unchanged', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('PENDING')).toBe('PENDING');
      expect(comp.displayStatus('REJECTED')).toBe('REJECTED');
      expect(comp.displayStatus('CANCELLED')).toBe('CANCELLED');
      expect(comp.displayStatus('SUPERSEDED')).toBe('SUPERSEDED');
    });
  });
});
