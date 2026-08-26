import { FormGroup } from '@angular/forms';
import { Subject, of, throwError } from 'rxjs';
import { MakerPanelComponent } from './maker-panel.component';
import type {
  BalanceComponentApiService,
  BalanceContract,
  BalanceMovement,
  BalanceSnapshot,
  CatalogPage,
  CreateMovementRequest,
} from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, TransactionFunction, InstrumentType } from './balance-component.model';
import type { InquiredEvent } from './inquire-events.service';
import * as functionStrategyModule from './function-strategy';

// submit()'s compound branches (A3S/B4/B5) call `crypto.randomUUID()` to link legs via businessEventId —
// jsdom's test environment doesn't always implement it. Polyfill once, module-load time.
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = {};
}
if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  // jsdom's `window.crypto` is a non-configurable getter — mutate in place rather than reassigning
  // `globalThis.crypto` (a plain reassignment silently no-ops).
  (globalThis as any).crypto.randomUUID = () => 'test-uuid-' + Math.random().toString(36).slice(2);
}

/**
 * Direct-instantiation, no-TestBed unit tests for MakerPanelComponent — the Maker-owned surface of
 * TransactionBuilderComponent: natural-key search, the 3 paginated pickers, the Formly form/submit()
 * dispatch across all 14 named business functions, submitResult, the compound-leg movementId fields.
 *
 * `resetForFunction()` is private, triggered by a `resetTrigger` `@Input()` change via `ngOnChanges()`.
 * `triggerSelectFunction()` below sets the `@Input()` then fires `ngOnChanges()` with `resetTrigger`
 * present and `firstChange: false`, mirroring the real parent-child template binding.
 */

function makeChange(
  previousValue: unknown,
  currentValue: unknown,
): { previousValue: unknown; currentValue: unknown; firstChange: boolean; isFirstChange: () => boolean } {
  return { previousValue, currentValue, firstChange: false, isFirstChange: () => false };
}

// ===========================================================================
// Group A — from transaction-builder.component.spec.ts (onSubChoice, reloadCatalog + LC Index
// eligibility, onCatalogSearch, onSelectFlattenedPayable, catalogIbHint, catalogPrevPage/
// catalogNextPage, CatalogPickerService.load, onParentInstrumentTypeChange, onParentSearch,
// parentPrevPage/parentNextPage, onPayableMovementSearchChange, catalogPendingHint,
// movementTypeChecksAvailableBalance) — plus the Maker-owned halves of "constructor"/"selectFunction",
// the latter renamed "resetForFunction() (via ngOnChanges resetTrigger)" since that's its real name on
// this class now.
// ===========================================================================

function findFn(list: TransactionFunction[], code: string): TransactionFunction {
  const found = list.find((f) => f.code === code);
  if (!found) throw new Error(`Function ${code} not found in registry`);
  return found;
}

const A1 = findFn(IMPORT_FUNCTIONS, 'A1'); // LC Issue — fixed movementType ISSUE, tenorTypeOptions, no parent
const A2 = findFn(IMPORT_FUNCTIONS, 'A2'); // LC Amendment — subChoice, no fixed movementType
const A4 = findFn(IMPORT_FUNCTIONS, 'A4'); // Sight Settlement — payExistingUtilize, catalogTenorFilter SIGHT
const A6 = findFn(IMPORT_FUNCTIONS, 'A6'); // Acceptance (Usance) — defaultParentInstrumentType, tenorTypeOptions, settlesDocumentArrival
const A3S = findFn(IMPORT_FUNCTIONS, 'A3S'); // Document Arrival w/ Shipping Gtee — flat Catalog picker, documentArrivalWithSg
const A7 = findFn(IMPORT_FUNCTIONS, 'A7'); // Acceptance Settlement — defaultParentInstrumentType, requiresEligibleParentAcceptance
const A9 = findFn(IMPORT_FUNCTIONS, 'A9'); // Shipping Gtee (Redemption) — defaultParentInstrumentType, amountVsAvailableDerivation REDEEM
const B1 = findFn(EXPORT_FUNCTIONS, 'B1'); // Confirm LC — export side, fixed movementType
const B2 = findFn(EXPORT_FUNCTIONS, 'B2'); // Confirm LC Amendment — subChoice keyed amendDirection, third option (F1) declares a movementTypeOverride
const B4a = findFn(EXPORT_FUNCTIONS, 'B4'); // Honour / Acceptance — payableMovementInstrumentType EPLC_EXAMINATION, flat Catalog picker

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
    closeEligible: jest.fn(() => of(mkCatalogPage([]))),
    reopenEligible: jest.fn(() => of(mkCatalogPage([]))),
    getSnapshot: jest.fn((id: string) => of(mkSnapshot(id))),
    listMovements: jest.fn(() => of([] as any[])),
    submitByMaker: jest.fn(),
  };
}

function makeComponentA() {
  const mockApi = makeApiMock();
  const comp = new MakerPanelComponent(mockApi as unknown as BalanceComponentApiService);
  return { comp, mockApi };
}

/** Sets the Input, then fires the resetTrigger change ngOnChanges() reacts to. */
function triggerSelectFunction(comp: MakerPanelComponent, fnDef: TransactionFunction | null): void {
  comp.selectedFunction = fnDef;
  if (fnDef) comp.activeFunctionSide = fnDef.side;
  const prev = comp.resetTrigger ?? 0;
  comp.resetTrigger = prev + 1;
  comp.ngOnChanges({ resetTrigger: makeChange(prev, comp.resetTrigger) } as any);
}

describe('MakerPanelComponent', () => {
  describe('constructor', () => {
    it('initializes default Maker-owned state', () => {
      const { comp } = makeComponentA();

      expect(comp.subChoiceValue).toBe('');
      expect(comp.form).toBeInstanceOf(FormGroup);
      expect(comp.model.currency).toBe('USD');
      expect(comp.model.createdBy).toBe('maker1');
      expect(typeof comp.model.eventSeq).toBe('number');
      expect(comp.naturalKey).toEqual({ lcNumber: '', ibNumber: '', sgNumber: '' });
      expect(comp.catalogPicker.page).toBe(1);
      expect(comp.catalogPageSize).toBe(100);
      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.selectedContract).toBeNull();
      expect(comp.submitResult).toBeNull();
    });

    it('stores the injected api service (used by every other method)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.reloadCatalog();
      // instrumentType unset -> early return, api never touched, but the field exists and is usable.
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });
  });

  describe("resetForFunction() (via ngOnChanges resetTrigger) — mirrors TransactionBuilderComponent.selectFunction()'s own pre-extraction Maker-state reset body", () => {
    it('a function with a fixed movementType pins instrumentType+movementType immediately (A1)', () => {
      const { comp, mockApi } = makeComponentA();
      triggerSelectFunction(comp, A1);

      expect(comp.selectedFunction).toBe(A1);
      expect(comp.model.instrumentType).toBe('IPLC_LC');
      expect(comp.model.movementType).toBe('ISSUE');
      // A1/B1 special-case: Tenor Type defaults to Sight.
      expect(comp.model.tenorType).toBe('SIGHT');
      // A1 is a creating movement with no parent -> neither reloadCatalog nor
      // onParentInstrumentTypeChange's api.catalog call should fire.
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('a function with a subChoice leaves movementType unset until onSubChoice (A2)', () => {
      const { comp } = makeComponentA();
      triggerSelectFunction(comp, A2);

      expect(comp.selectedFunction).toBe(A2);
      expect(comp.model.instrumentType).toBeUndefined();
      expect(comp.model.movementType).toBeUndefined();
      expect(comp.dynamicSecondaryRefLabel).toBe('Amendment No./Times');
    });

    it('pre-selects defaultParentInstrumentType and reloads the parent catalog (A6)', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      triggerSelectFunction(comp, A6);

      expect(comp.parentInstrumentType).toBe('IPLC_LC');
      // afterResolved() -> onParentInstrumentTypeChange() -> loadParentPage(1) -> api.catalog
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.parentPageSize, undefined, 'USANCE', true);
    });

    it('leaves parentInstrumentType empty when the function has no defaultParentInstrumentType (A1)', () => {
      const { comp } = makeComponentA();
      triggerSelectFunction(comp, A1);
      expect(comp.parentInstrumentType).toBe('');
    });

    it('resets prior selection/catalog/parent/snapshot state on every pick', () => {
      const { comp, mockApi } = makeComponentA();
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
      comp.pickerSelection.settleableBalances = [
        { balanceContractId: 'x', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: null, availableBalance: '1', currency: 'USD' },
      ];
      comp.pickerSelection.payableMovements = [mkMovement('m1')];
      comp.pickerSelection.payableMovementSearch = 'stale';
      comp.pickerSelection.selectedPayMovement = mkMovement('m1');
      comp.arrivalApproved = true;
      comp.submitResult = mkMovement('sr1');
      comp.submitError = 'boom';
      comp.pickerSelection.sgsForArrival = [mkContract('sg1', '004')];
      comp.pickerSelection.selectedArrivalSg = mkContract('sg1', '004');
      comp.pickerSelection.arrivalSgSnapshot = mkSnapshot('sg1');
      comp.compoundLegs.arrivalSgRedeemMovementId = 'mv1';
      comp.compoundLegs.dueFromIssuingBankMovementId = 'mv2';
      comp.compoundLegs.acceptanceReimbReceivableMovementId = 'mv3';
      comp.compoundLegs.acceptanceMovementId = 'mv4';
      comp.compoundLegs.matchedReceivableMovementId = 'mv5';

      triggerSelectFunction(comp, A2);

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
      expect(comp.pickerSelection.settleableBalances).toEqual([]);
      expect(comp.pickerSelection.payableMovements).toEqual([]);
      expect(comp.pickerSelection.payableMovementSearch).toBe('');
      expect(comp.pickerSelection.selectedPayMovement).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.submitResult).toBeNull();
      expect(comp.submitError).toBeNull();
      expect(comp.pickerSelection.sgsForArrival).toEqual([]);
      expect(comp.pickerSelection.selectedArrivalSg).toBeNull();
      expect(comp.pickerSelection.arrivalSgSnapshot).toBeNull();
      expect(comp.compoundLegs.arrivalSgRedeemMovementId).toBeNull();
      expect(comp.compoundLegs.dueFromIssuingBankMovementId).toBeNull();
      expect(comp.compoundLegs.acceptanceReimbReceivableMovementId).toBeNull();
      expect(comp.compoundLegs.acceptanceMovementId).toBeNull();
      expect(comp.compoundLegs.matchedReceivableMovementId).toBeNull();
    });

    it('resets naturalKey/searchNaturalKey/searchError on every pick, and applies the Sight tenorType default (B1)', () => {
      const { comp } = makeComponentA();
      comp.naturalKey = { lcNumber: 'X', ibNumber: 'Y', sgNumber: 'Z' };
      comp.searchNaturalKey = { lcNumber: 'X', ibNumber: 'Y', sgNumber: 'Z' };
      comp.searchError = 'stale';

      triggerSelectFunction(comp, B1);

      expect(comp.naturalKey).toEqual({ lcNumber: '', ibNumber: '', sgNumber: '' });
      expect(comp.searchNaturalKey).toEqual({ lcNumber: '', ibNumber: '', sgNumber: '' });
      expect(comp.searchError).toBeNull();
      expect(comp.model.tenorType).toBe('SIGHT'); // B1 also gets the Sight default
    });
  });

  describe('onSubChoice', () => {
    it('does nothing when no function is selected', () => {
      const { comp } = makeComponentA();
      comp.subChoiceValue = 'AMEND_INCREASE';
      comp.onSubChoice();
      expect(comp.model.movementType).toBeUndefined();
    });

    it('does nothing when subChoiceValue is empty', () => {
      const { comp } = makeComponentA();
      comp.selectedFunction = A2;
      comp.subChoiceValue = '';
      comp.onSubChoice();
      expect(comp.model.movementType).toBeUndefined();
    });

    it('resolves instrumentType/movementType from the picked sub-choice and triggers afterResolved', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = A2;
      comp.subChoiceValue = 'AMEND_INCREASE';

      comp.onSubChoice();

      expect(comp.model.instrumentType).toBe('IPLC_LC');
      expect(comp.model.movementType).toBe('AMEND_INCREASE');
      // afterResolved -> rebuildFields (fields populated) and, since AMEND_INCREASE is not a creating
      // movementType and IPLC_LC needs no two-field search, reloadCatalog() fires.
      expect(comp.fields.length).toBeGreaterThan(0);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.catalogPageSize, undefined, undefined, true);
    });

    it('resolves a different sub-choice value to a different movementType (AMEND_DECREASE)', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = A2;
      comp.subChoiceValue = 'AMEND_DECREASE';

      comp.onSubChoice();

      expect(comp.model.movementType).toBe('AMEND_DECREASE');
    });

    it('F1: A2\'s third option (Expiry Date) resolves movementType to AMEND_EXPIRY_DATE directly — its own key is already \'movementType\', so no override is declared or needed', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = A2;
      comp.subChoiceValue = 'AMEND_EXPIRY_DATE';

      comp.onSubChoice();

      expect(comp.model.instrumentType).toBe('IPLC_LC');
      expect(comp.model.movementType).toBe('AMEND_EXPIRY_DATE');
    });

    it('F1: B2\'s third option (Expiry Date) declares a movementTypeOverride — resolves movementType to AMEND_EXPIRY_DATE directly, bypassing the amendDirection indirection its other two options use, and never touches this.amendDirection', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = B2;
      comp.subChoiceValue = 'EXPIRY_DATE';

      comp.onSubChoice();

      expect(comp.model.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(comp.model.movementType).toBe('AMEND_EXPIRY_DATE');
      expect(comp.amendDirection).toBeNull();
    });

    it('F1: B2\'s own ordinary Increase/Decrease options are unaffected by the new movementTypeOverride branch — still write amendDirection only, model.movementType stays whatever it already was', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));
      comp.selectedFunction = B2;
      comp.model.movementType = 'AMEND';
      comp.subChoiceValue = 'DECREASE';

      comp.onSubChoice();

      expect(comp.amendDirection).toBe('DECREASE');
      expect(comp.model.movementType).toBe('AMEND');
    });
  });

  describe('reloadCatalog', () => {
    it('does nothing (clears catalog) when model.instrumentType is unset', () => {
      const { comp, mockApi } = makeComponentA();
      comp.catalogPicker.contracts = [mkContract('c1', '001')];
      comp.catalogPicker.total = 5;

      comp.reloadCatalog();

      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('does nothing (clears catalog) when the function is a creating movement (ISSUE)', () => {
      const { comp, mockApi } = makeComponentA();
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
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.selectedFunction = A4; // catalogTenorFilter: 'SIGHT'
      const c1 = mkContract('c1', '001');
      const c2 = mkContract('c2', '002');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1, c2], 2)));
      mockApi.getSnapshot.mockImplementation((id: string) => of(mkSnapshot(id)));
      // A4's LC Index requires each candidate to have a real outstanding, Checker-acknowledged (EARMARKED)
      // Document Arrival — both c1/c2 need one to still show up in catalogPicker.total/contracts below.
      mockApi.listMovements.mockReturnValue(
        of([{ movementId: 'm1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB01', acknowledgedAt: '2026-08-20T00:00:00.000Z' }]),
      );

      comp.reloadCatalog();

      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.catalogPageSize, undefined, 'SIGHT', true);
      expect(comp.catalogPicker.contracts).toEqual([c1, c2]);
      expect(comp.catalogPicker.total).toBe(2);
      expect(comp.catalogPicker.page).toBe(1);
      // loadSnapshotsInto populated catalogPicker.snapshots via forkJoin(getSnapshot).
      expect(comp.catalogPicker.snapshots.get('c1')).toEqual(mkSnapshot('c1'));
      expect(comp.catalogPicker.snapshots.get('c2')).toEqual(mkSnapshot('c2'));
    });

    it('passes catalogPicker.search as the q filter when set', () => {
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.search = 'S001';

      comp.reloadCatalog();

      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', 'S001', 1, comp.catalogPageSize, undefined, undefined, true);
    });

    it('loads payable IB hints (catalogPayableIbs/catalogPayableMovements) when the function has payExistingUtilize', () => {
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.selectedFunction = A4; // payExistingUtilize: true
      const c1 = mkContract('c1', '810');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1], 1)));
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));
      mockApi.listMovements.mockReturnValue(
        of([
          { movementId: 'm1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB00001', acknowledgedAt: '2026-08-20T00:00:00.000Z' },
          { movementId: 'm2', status: 'RELEASED', movementType: 'UTILIZE', sourceTransactionRef: 'IB00002' },
        ]),
      );

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogPayableIbs.get('c1')).toEqual(['IB00001']);
      expect(comp.documentArrivalHints.catalogPayableMovements.get('c1')?.map((m: any) => m.movementId)).toEqual(['m1']);
    });

    // Business instruction 2026-08-20 ("A4 選取 EARMARKED 的交易") — a Document Arrival that's only
    // Maker-Submitted (PENDING, acknowledgedAt still null) must NOT populate catalogPayableIbs, even
    // though it's genuinely PENDING/UTILIZE — the LC has nothing eligible for A4 to pick yet.
    it('does NOT populate catalogPayableIbs for a still-PENDING UTILIZE that has not yet been Checker-acknowledged', () => {
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '811');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1], 1)));
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));
      mockApi.listMovements.mockReturnValue(of([{ movementId: 'm1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB00003' }]));

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogPayableIbs.get('c1')).toBeUndefined();
      expect(comp.documentArrivalHints.catalogPayableMovements.get('c1')).toBeUndefined();
    });

    // Bug fixed 2026-08-20 (reviewer-reported live, "已經Submit 為何可以A4重複出現再選取" — S101 repro):
    // once A4's own Maker Submit has already happened, the item has nothing left for A4's Maker step to
    // do and must drop out of this same list too, not keep re-offering itself for a second 409-doomed Submit.
    it('does NOT populate catalogPayableIbs for an acknowledged UTILIZE that A4 has already Maker-Submitted (makerSubmittedAt set)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '812');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1], 1)));
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));
      mockApi.listMovements.mockReturnValue(
        of([
          {
            movementId: 'm1',
            status: 'PENDING',
            movementType: 'UTILIZE',
            sourceTransactionRef: 'IB00004',
            acknowledgedAt: '2026-08-20T00:00:00.000Z',
            makerSubmittedAt: '2026-08-20T01:00:00.000Z',
          },
        ]),
      );

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogPayableIbs.get('c1')).toBeUndefined();
      expect(comp.documentArrivalHints.catalogPayableMovements.get('c1')).toBeUndefined();
    });

    it('handles an error response by clearing catalogPicker.contracts/catalogPicker.total instead of throwing', () => {
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.contracts = [mkContract('c1', '001')];
      comp.catalogPicker.total = 3;
      mockApi.catalog.mockReturnValue(throwError(() => new Error('server down')));

      expect(() => comp.reloadCatalog()).not.toThrow();
      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
    });
  });

  // B4's LC Index eligibility is cross-contract (a child EPLC_EXAMINATION contract's own CREATE,
  // already RELEASED and not yet consumed), unlike A4/A6's same-contract check.
  describe('reloadCatalog — B4 cross-contract LC Index eligibility (loadEligibleChildDocumentHints)', () => {
    function setup(mockApi: ReturnType<typeof makeApiMock>, examMovements: any[]) {
      const c1 = mkContract('c1', 'CU01', { instrumentType: 'EPLC_CONFIRMATION' });
      const exam1 = mkContract('exam1', 'CU01', { instrumentType: 'EPLC_EXAMINATION' });
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'EPLC_CONFIRMATION' ? of(mkCatalogPage([c1], 1)) : of(mkCatalogPage([exam1], 1)),
      );
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));
      mockApi.listMovements.mockReturnValue(of(examMovements));
      return { c1, exam1 };
    }

    it('keeps a Confirmation with an already-RELEASED, not-yet-consumed child EPLC_EXAMINATION CREATE', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = B4a;
      comp.model.instrumentType = 'EPLC_CONFIRMATION';
      comp.model.movementType = 'HONOUR';
      setup(mockApi, [{ movementId: 'm1', status: 'RELEASED', movementType: 'CREATE', sourceTransactionRef: 'E01' }]);

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogChildPayableIbs.get('c1')).toEqual(['E01']);
      expect(comp.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['c1']);
      expect(comp.catalogPicker.total).toBe(1);
    });

    it('excludes a Confirmation whose only child EPLC_EXAMINATION CREATE is still PENDING (not yet Released)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = B4a;
      comp.model.instrumentType = 'EPLC_CONFIRMATION';
      comp.model.movementType = 'HONOUR';
      setup(mockApi, [{ movementId: 'm1', status: 'PENDING', movementType: 'CREATE', sourceTransactionRef: 'E01' }]);

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogChildPayableIbs.has('c1')).toBe(false);
      expect(comp.filteredCatalogContracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
    });

    it('excludes a Confirmation whose only otherwise-eligible CREATE was already consumed by an earlier B4', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = B4a;
      comp.model.instrumentType = 'EPLC_CONFIRMATION';
      comp.model.movementType = 'HONOUR';
      setup(mockApi, [
        { movementId: 'm1', status: 'RELEASED', movementType: 'CREATE', sourceTransactionRef: 'E01', presentDocsConsumedAt: '2026-08-18T00:00:00.000Z' },
      ]);

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogChildPayableIbs.has('c1')).toBe(false);
      expect(comp.filteredCatalogContracts).toEqual([]);
    });

    it('excludes a Confirmation with no child EPLC_EXAMINATION contracts at all', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = B4a;
      comp.model.instrumentType = 'EPLC_CONFIRMATION';
      comp.model.movementType = 'HONOUR';
      const c1 = mkContract('c1', 'CU01', { instrumentType: 'EPLC_CONFIRMATION' });
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'EPLC_CONFIRMATION' ? of(mkCatalogPage([c1], 1)) : of(mkCatalogPage([])),
      );
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogChildPayableIbs.has('c1')).toBe(false);
      expect(comp.filteredCatalogContracts).toEqual([]);
    });

    it('resolves cleanly with no candidates at all (empty list short-circuit)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = B4a;
      comp.model.instrumentType = 'EPLC_CONFIRMATION';
      comp.model.movementType = 'HONOUR';
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      expect(() => comp.reloadCatalog()).not.toThrow();
      expect(comp.documentArrivalHints.catalogChildPayableIbs.size).toBe(0);
      expect(comp.catalogPicker.total).toBe(0);
    });
  });

  // A3S/A9's LC Index only shows LC Numbers with an outstanding SG Balance; once it's 0 the LC drops out.
  describe('reloadCatalog — A3S LC Index SG Balance eligibility (loadCatalogSgEligibility)', () => {
    function setup(mockApi: ReturnType<typeof makeApiMock>, sgSnapshotOverrides: Partial<BalanceSnapshot>) {
      const c1 = mkContract('c1', 'S01');
      const sg1 = mkContract('sg1', 'S01', { instrumentType: 'SHGT' });
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'IPLC_LC' ? of(mkCatalogPage([c1], 1)) : of(mkCatalogPage([sg1], 1)),
      );
      mockApi.getSnapshot.mockImplementation((id: string) => (id === 'sg1' ? of(mkSnapshot('sg1', sgSnapshotOverrides)) : of(mkSnapshot(id))));
      return { c1, sg1 };
    }

    it("keeps an LC with an outstanding (non-zero Available Balance) child SG, regardless of the LC's own balance", () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A3S;
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      setup(mockApi, { availableBalance: '5000' });

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogSgEligible.has('c1')).toBe(true);
      expect(comp.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['c1']);
    });

    it('excludes an LC whose only child SG is fully redeemed (availableBalance 0)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A3S;
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      setup(mockApi, { availableBalance: '0' });

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogSgEligible.has('c1')).toBe(false);
      expect(comp.filteredCatalogContracts).toEqual([]);
    });

    it('excludes an LC with no child SG contracts at all', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A3S;
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      const c1 = mkContract('c1', 'S01');
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'IPLC_LC' ? of(mkCatalogPage([c1], 1)) : of(mkCatalogPage([])),
      );
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));

      comp.reloadCatalog();

      expect(comp.documentArrivalHints.catalogSgEligible.has('c1')).toBe(false);
      expect(comp.filteredCatalogContracts).toEqual([]);
    });
  });

  describe('loadParent (via onParentInstrumentTypeChange) — A9 LC Index SG Balance eligibility (loadParentSgEligibility)', () => {
    function setup(mockApi: ReturnType<typeof makeApiMock>, sgSnapshotOverrides: Partial<BalanceSnapshot>) {
      const p1 = mkContract('p1', 'S01');
      const sg1 = mkContract('sg1', 'S01', { instrumentType: 'SHGT' });
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'IPLC_LC' ? of(mkCatalogPage([p1], 1)) : of(mkCatalogPage([sg1], 1)),
      );
      mockApi.getSnapshot.mockImplementation((id: string) => (id === 'sg1' ? of(mkSnapshot('sg1', sgSnapshotOverrides)) : of(mkSnapshot(id))));
      return { p1, sg1 };
    }

    it("keeps an LC with an outstanding child SG, regardless of the LC's own balance", () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A9;
      comp.parentInstrumentType = 'IPLC_LC';
      setup(mockApi, { availableBalance: '5000' });

      comp.onParentInstrumentTypeChange();

      expect(comp.documentArrivalHints.parentSgEligible.has('p1')).toBe(true);
      expect(comp.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['p1']);
    });

    it('excludes an LC whose only child SG is fully redeemed (availableBalance 0)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A9;
      comp.parentInstrumentType = 'IPLC_LC';
      setup(mockApi, { availableBalance: '0' });

      comp.onParentInstrumentTypeChange();

      expect(comp.documentArrivalHints.parentSgEligible.has('p1')).toBe(false);
      expect(comp.filteredParentCatalog).toEqual([]);
    });

    it('excludes an LC with no child SG contracts at all', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A9;
      comp.parentInstrumentType = 'IPLC_LC';
      const p1 = mkContract('p1', 'S01');
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'IPLC_LC' ? of(mkCatalogPage([p1], 1)) : of(mkCatalogPage([])),
      );
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('p1')));

      comp.onParentInstrumentTypeChange();

      expect(comp.documentArrivalHints.parentSgEligible.has('p1')).toBe(false);
      expect(comp.filteredParentCatalog).toEqual([]);
    });
  });

  // A7's LC Index only shows LC Numbers with an outstanding Acceptance Balance — user-reported 2026-08-25
  // ("A07 交易選擇是 LC number 有Acceptance balance 再顯示2ndary ref"). Same shape as A9's own SG-balance
  // gate above, just a child IPLC_ACCEPTANCE instead of a child SHGT.
  describe('loadParent (via onParentInstrumentTypeChange) — A7 LC Index Acceptance Balance eligibility (loadParentAcceptanceEligibility)', () => {
    function setup(mockApi: ReturnType<typeof makeApiMock>, acceptanceSnapshotOverrides: Partial<BalanceSnapshot>) {
      const p1 = mkContract('p1', 'U01');
      const acc1 = mkContract('acc1', 'U01', { instrumentType: 'IPLC_ACCEPTANCE' });
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'IPLC_LC' ? of(mkCatalogPage([p1], 1)) : of(mkCatalogPage([acc1], 1)),
      );
      mockApi.getSnapshot.mockImplementation((id: string) => (id === 'acc1' ? of(mkSnapshot('acc1', acceptanceSnapshotOverrides)) : of(mkSnapshot(id))));
      return { p1, acc1 };
    }

    it("keeps an LC with an outstanding child Acceptance, regardless of the LC's own balance", () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A7;
      comp.parentInstrumentType = 'IPLC_LC';
      setup(mockApi, { availableBalance: '2000' });

      comp.onParentInstrumentTypeChange();

      expect(comp.documentArrivalHints.parentAcceptanceEligible.has('p1')).toBe(true);
      expect(comp.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['p1']);
    });

    it('excludes an LC whose only child Acceptance is fully settled (availableBalance 0)', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A7;
      comp.parentInstrumentType = 'IPLC_LC';
      setup(mockApi, { availableBalance: '0' });

      comp.onParentInstrumentTypeChange();

      expect(comp.documentArrivalHints.parentAcceptanceEligible.has('p1')).toBe(false);
      expect(comp.filteredParentCatalog).toEqual([]);
    });

    it('excludes an LC with no child Acceptance contracts at all', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A7;
      comp.parentInstrumentType = 'IPLC_LC';
      const p1 = mkContract('p1', 'U01');
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) =>
        instrumentType === 'IPLC_LC' ? of(mkCatalogPage([p1], 1)) : of(mkCatalogPage([])),
      );
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('p1')));

      comp.onParentInstrumentTypeChange();

      expect(comp.documentArrivalHints.parentAcceptanceEligible.has('p1')).toBe(false);
      expect(comp.filteredParentCatalog).toEqual([]);
    });
  });

  // Reviewer-reported 2026-08-26 ("A35 A7 先出現 ⚠ No eligible records... 再出現交易" / "選 A3S 或 A7 FULL
  // SETTLE 就可以看到這 ERROR 訊息一閃而過後 再顯示交易 INDEX") — the LIVE bug traced to a THIRD async step
  // (the hint-set fetch: loadCatalogSgEligibility for A3S, loadParentAcceptanceEligibility for A7) that
  // fires AFTER CatalogPickerService.loading has already gone false (contracts+snapshots done), during
  // which the hint-set Map/Set is still empty — `filteredCatalogContracts`/`filteredParentCatalog` read 0
  // eligible candidates for that whole window even though real ones exist. `hintsPending` closes this;
  // these tests use a controllable Subject for the hint fetch's own underlying catalog() call so the
  // in-flight window is actually observable (the earlier tests above all use synchronous `of(...)`, which
  // can never reproduce this).
  describe('hintsPending — suppresses noEligibleRecordsMessage during the hint-set fetch itself, not just during CatalogPickerService.loading (reviewer-reported "flash" bug)', () => {
    it('A3S (documentArrivalWithSg): message stays suppressed while loadCatalogSgEligibility is still in flight, even though catalogPicker.loading has already gone false', () => {
      const { comp, mockApi } = makeComponentA();
      triggerSelectFunction(comp, A3S);
      comp.model.movementType = 'UTILIZE';
      const c1 = mkContract('c1', 'S01');
      const sgSubject = new Subject<CatalogPage>();
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) => (instrumentType === 'IPLC_LC' ? of(mkCatalogPage([c1], 1)) : sgSubject));

      comp.reloadCatalog();

      // catalogPicker's own contracts+snapshots step is fully synchronous here (of(...)), so loading is
      // already false — but the SG hint fetch (sgSubject) hasn't resolved yet.
      expect(comp.catalogPicker.loading).toBe(false);
      expect(comp.eligibleCandidateCount).toBe(0); // the hint Set is still empty
      expect(comp.eligiblePickersLoading).toBe(true); // hintsPending must cover this gap
      expect(comp.noEligibleRecordsMessage).toBeNull();

      sgSubject.next(mkCatalogPage([mkContract('sg1', 'S01', { instrumentType: 'SHGT' })], 1));
      sgSubject.complete();

      expect(comp.eligiblePickersLoading).toBe(false);
      expect(comp.documentArrivalHints.catalogSgEligible.has('c1')).toBe(true);
      expect(comp.noEligibleRecordsMessage).toBe('Pick an eligible record from the list below to continue.');
    });

    it('A7 (requiresEligibleParentAcceptance): message stays suppressed while loadParentAcceptanceEligibility is still in flight', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A7;
      // eligibleCandidateCount/eligiblePickersLoading branch on policy.hasParent(model.instrumentType) —
      // in the real app this is already set to A7's own instrumentType by onSubChoice() before
      // afterResolved() ever triggers this reload; set it explicitly here since this test calls
      // onParentInstrumentTypeChange() directly, bypassing that flow.
      comp.model.instrumentType = 'IPLC_ACCEPTANCE';
      comp.parentInstrumentType = 'IPLC_LC';
      const p1 = mkContract('p1', 'U01');
      const accSubject = new Subject<CatalogPage>();
      (mockApi.catalog as jest.Mock).mockImplementation((instrumentType: string) => (instrumentType === 'IPLC_LC' ? of(mkCatalogPage([p1], 1)) : accSubject));

      comp.onParentInstrumentTypeChange();

      expect(comp.parentPicker.loading).toBe(false);
      expect(comp.eligibleCandidateCount).toBe(0);
      expect(comp.eligiblePickersLoading).toBe(true);
      expect(comp.noEligibleRecordsMessage).toBeNull();

      accSubject.next(mkCatalogPage([mkContract('acc1', 'U01', { instrumentType: 'IPLC_ACCEPTANCE' })], 1));
      accSubject.complete();

      expect(comp.eligiblePickersLoading).toBe(false);
      expect(comp.documentArrivalHints.parentAcceptanceEligible.has('p1')).toBe(true);
      expect(comp.noEligibleRecordsMessage).toBe('Pick an eligible record from the list below to continue.');
    });

    it('a function with no hint-set dependency (A2) is never held up by hintsPending — eligiblePickersLoading tracks catalogPicker.loading alone', () => {
      const { comp } = makeComponentA();
      triggerSelectFunction(comp, A2);
      comp.catalogPicker.total = 0;
      comp.catalogPicker.loading = false;
      (comp as any).hintsPending = 5; // simulates an unrelated in-flight hint fetch from a different function
      expect(comp.eligiblePickersLoading).toBe(false);
      expect(comp.noEligibleRecordsMessage).toBe('No eligible records available for this transaction.');
    });
  });

  describe('onCatalogSearch', () => {
    it('resets to page 1 and reloads the catalog', () => {
      const { comp, mockApi } = makeComponentA();
      comp.model.instrumentType = 'IPLC_LC';
      comp.model.movementType = 'UTILIZE';
      comp.catalogPicker.page = 4;
      comp.catalogPicker.search = 'U003';
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      comp.onCatalogSearch();

      expect(comp.catalogPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', 'U003', 1, comp.catalogPageSize, undefined, undefined, true);
    });
  });

  describe('onSelectFlattenedPayable', () => {
    it('sets selectedContract, refreshes its snapshot, wires payableMovements from the flattened cache, and selects the movement', () => {
      const { comp, mockApi } = makeComponentA();
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.contracts = [c1];
      const movement = mkMovement('m1', { sourceTransactionRef: 'IB00001', amount: '25000' });
      comp.documentArrivalHints.catalogPayableMovements.set('c1', [movement]);
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));

      comp.onSelectFlattenedPayable('c1', 'm1');

      expect(comp.selectedContract).toBe(c1);
      expect(mockApi.getSnapshot).toHaveBeenCalledWith('c1');
      expect(comp.selectedContractSnapshot).toEqual(mkSnapshot('c1'));
      expect(comp.pickerSelection.payableMovements).toEqual([movement]);
      expect(comp.pickerSelection.payableMovementsLoading).toBe(false);
      expect(comp.pickerSelection.selectedPayMovement).toBe(movement);
    });

    it('auto-fills and locks the Acceptance amount/IB Number for a settlesDocumentArrival function (A6)', () => {
      const { comp, mockApi } = makeComponentA();
      const c1 = mkContract('c1', '810');
      comp.selectedFunction = A6; // settlesDocumentArrival: true
      comp.catalogPicker.contracts = [c1];
      const movement = mkMovement('m1', { sourceTransactionRef: 'IB00001', amount: '25000' });
      comp.documentArrivalHints.catalogPayableMovements.set('c1', [movement]);
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('c1')));

      comp.onSelectFlattenedPayable('c1', 'm1');

      expect(comp.naturalKey.ibNumber).toBe('IB00001');
      expect(comp.model.amount).toBe('25000');
    });

    it('leaves selectedContract null when the contractId is not in catalogPicker.contracts', () => {
      const { comp } = makeComponentA();
      comp.catalogPicker.contracts = [mkContract('c1', '810')];

      comp.onSelectFlattenedPayable('missing', 'm1');

      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
    });
  });

  describe('catalogIbHint', () => {
    it('returns empty string when there are no pending IBs for the contract', () => {
      const { comp } = makeComponentA();
      const c1 = mkContract('c1', '810');
      expect(comp.catalogIbHint(c1)).toBe('');
    });

    it('renders a single pending IB inline', () => {
      const { comp } = makeComponentA();
      const c1 = mkContract('c1', '810');
      comp.documentArrivalHints.catalogPayableIbs.set('c1', ['IB00001']);
      expect(comp.catalogIbHint(c1)).toBe(' — IB00001');
    });

    it('renders multiple pending IBs with a count prefix', () => {
      const { comp } = makeComponentA();
      const c1 = mkContract('c1', '810');
      comp.documentArrivalHints.catalogPayableIbs.set('c1', ['IB00001', 'IB00002']);
      expect(comp.catalogIbHint(c1)).toBe(' — 2 pending: IB00001, IB00002');
    });
  });

  // Prev/Next are pure client-side windowing over the already-fetched, already-filtered set (display
  // page size 5 — see CatalogPickerService's own module doc comment); neither triggers a new api.catalog call.
  describe('catalogPrevPage / catalogNextPage', () => {
    it('catalogPrevPage is a no-op on page 1', () => {
      const { comp, mockApi } = makeComponentA();
      comp.catalogPicker.total = 12; // display pageSize 5 -> 3 pages
      comp.catalogPicker.page = 1;

      comp.catalogPrevPage();

      expect(comp.catalogPicker.page).toBe(1);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('catalogPrevPage moves back a page locally, without reloading', () => {
      const { comp, mockApi } = makeComponentA();
      comp.catalogPicker.total = 12;
      comp.catalogPicker.page = 3;

      comp.catalogPrevPage();

      expect(comp.catalogPicker.page).toBe(2);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('catalogNextPage is a no-op on the last page', () => {
      const { comp, mockApi } = makeComponentA();
      comp.catalogPicker.total = 12; // totalPages = 3
      comp.catalogPicker.page = 3;

      comp.catalogNextPage();

      expect(comp.catalogPicker.page).toBe(3);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('catalogNextPage moves forward a page locally, without reloading', () => {
      const { comp, mockApi } = makeComponentA();
      comp.catalogPicker.total = 12;
      comp.catalogPicker.page = 1;

      comp.catalogNextPage();

      expect(comp.catalogPicker.page).toBe(2);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });
  });

  describe('CatalogPickerService.load() without a qualifies callback (a direct caller with no separate qualifying filter)', () => {
    it('falls back to the raw fetched count, both immediately and after snapshots resolve', () => {
      const { comp, mockApi } = makeComponentA();
      const c1 = mkContract('c1', '001');
      const c2 = mkContract('c2', '002');
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([c1, c2])));
      mockApi.getSnapshot.mockImplementation((id: string) => of(mkSnapshot(id)));

      comp.catalogPicker.load({ guardFails: false, instrumentType: 'IPLC_LC' });

      expect(comp.catalogPicker.contracts).toEqual([c1, c2]);
      expect(comp.catalogPicker.total).toBe(2);
    });

    it('falls back to zero when the fetch returns nothing', () => {
      const { comp, mockApi } = makeComponentA();
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      comp.catalogPicker.load({ guardFails: false, instrumentType: 'IPLC_LC' });

      expect(comp.catalogPicker.contracts).toEqual([]);
      expect(comp.catalogPicker.total).toBe(0);
    });
  });

  describe('onParentInstrumentTypeChange', () => {
    it('resets selectedParent/exposureNature and reloads the parent catalog page 1', () => {
      const { comp, mockApi } = makeComponentA();
      comp.selectedFunction = A6; // tenorTypeOptions set -> parentTenorFamily 'USANCE'
      comp.parentInstrumentType = 'IPLC_LC';
      comp.selectedParent = mkContract('p1', '001');
      comp.exposureNature = 'MEMO';
      // A6's own filteredParentCatalog requires a real, non-SIGHT tenorType — business requirement
      // parentPicker.total tracks the true qualified count, not the server's raw total, so p1 needs
      // one to genuinely qualify.
      const p1 = mkContract('p1', '001', { tenorType: 'BUYERS_USANCE' });
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([p1], 1)));
      mockApi.getSnapshot.mockReturnValue(of(mkSnapshot('p1')));
      // p1 also needs a real outstanding, Checker-acknowledged (EARMARKED) Document Arrival of its own to
      // pass A6's eligibility filter.
      mockApi.listMovements.mockReturnValue(
        of([{ movementId: 'm1', status: 'PENDING', movementType: 'UTILIZE', sourceTransactionRef: 'IB01', acknowledgedAt: '2026-08-20T00:00:00.000Z' }]),
      );

      comp.onParentInstrumentTypeChange();

      expect(comp.selectedParent).toBeNull();
      expect(comp.exposureNature).toBe('ACTUAL');
      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, comp.parentPageSize, undefined, 'USANCE', true);
      expect(comp.parentPicker.contracts).toEqual([p1]);
      expect(comp.parentPicker.total).toBe(1);
    });

    it('clears the parent catalog without calling the api when parentInstrumentType is empty', () => {
      const { comp, mockApi } = makeComponentA();
      comp.parentInstrumentType = '';
      comp.parentPicker.contracts = [mkContract('p1', '001')];
      comp.parentPicker.total = 5;

      comp.onParentInstrumentTypeChange();

      expect(comp.parentPicker.contracts).toEqual([]);
      expect(comp.parentPicker.total).toBe(0);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('handles a catalog error by clearing parentPicker.contracts/parentPicker.total', () => {
      const { comp, mockApi } = makeComponentA();
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
      const { comp, mockApi } = makeComponentA();
      comp.parentInstrumentType = 'IPLC_LC';
      comp.parentPicker.page = 4;
      comp.parentPicker.search = 'U002';
      mockApi.catalog.mockReturnValue(of(mkCatalogPage([])));

      comp.onParentSearch();

      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', 'U002', 1, comp.parentPageSize, undefined, undefined, true);
    });
  });

  // Same client-side-only windowing as catalogPrevPage/catalogNextPage above.
  describe('parentPrevPage / parentNextPage', () => {
    it('parentPrevPage is a no-op on page 1', () => {
      const { comp, mockApi } = makeComponentA();
      comp.parentPicker.total = 8; // display pageSize 5 -> 2 pages
      comp.parentPicker.page = 1;

      comp.parentPrevPage();

      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('parentPrevPage moves back a page locally, without reloading', () => {
      const { comp, mockApi } = makeComponentA();
      comp.parentPicker.total = 8;
      comp.parentPicker.page = 2;

      comp.parentPrevPage();

      expect(comp.parentPicker.page).toBe(1);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('parentNextPage is a no-op on the last page', () => {
      const { comp, mockApi } = makeComponentA();
      comp.parentPicker.total = 8; // totalPages = 2
      comp.parentPicker.page = 2;

      comp.parentNextPage();

      expect(comp.parentPicker.page).toBe(2);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('parentNextPage moves forward a page locally, without reloading', () => {
      const { comp, mockApi } = makeComponentA();
      comp.parentPicker.total = 8;
      comp.parentPicker.page = 1;

      comp.parentNextPage();

      expect(comp.parentPicker.page).toBe(2);
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });
  });

  describe('onPayableMovementSearchChange', () => {
    it('sets payableMovementSearch and auto-picks when narrowed to exactly one match', () => {
      const { comp } = makeComponentA();
      const m1 = mkMovement('m1', { sourceTransactionRef: 'IB00001' });
      comp.pickerSelection.payableMovements = [m1, mkMovement('m2', { sourceTransactionRef: 'IB00002' })];

      comp.onPayableMovementSearchChange('IB00001');

      expect(comp.pickerSelection.payableMovementSearch).toBe('IB00001');
      expect(comp.pickerSelection.selectedPayMovement).toEqual(m1);
    });

    it('does not auto-pick when the search still matches more than one movement', () => {
      const { comp } = makeComponentA();
      comp.pickerSelection.payableMovements = [mkMovement('m1', { sourceTransactionRef: 'IB00001' }), mkMovement('m2', { sourceTransactionRef: 'IB00002' })];

      comp.onPayableMovementSearchChange('IB000');

      expect(comp.pickerSelection.selectedPayMovement).toBeNull();
    });

    it('does not auto-pick when the search matches nothing', () => {
      const { comp } = makeComponentA();
      comp.pickerSelection.payableMovements = [mkMovement('m1', { sourceTransactionRef: 'IB00001' })];

      comp.onPayableMovementSearchChange('zzz');

      expect(comp.pickerSelection.payableMovementSearch).toBe('zzz');
      expect(comp.pickerSelection.selectedPayMovement).toBeNull();
    });
  });

  describe('catalogPendingHint', () => {
    it('returns empty string when the function does not payExistingUtilize', () => {
      const { comp } = makeComponentA();
      comp.selectedFunction = A6; // no payExistingUtilize
      const c1 = mkContract('c1', '810');
      expect(comp.catalogPendingHint(c1)).toBe('');
    });

    it('returns empty string when there is no snapshot yet', () => {
      const { comp } = makeComponentA();
      comp.selectedFunction = A4; // payExistingUtilize: true
      const c1 = mkContract('c1', '810');
      expect(comp.catalogPendingHint(c1)).toBe('');
    });

    it('returns empty string when pendingEarmarkTotal is 0', () => {
      const { comp } = makeComponentA();
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.snapshots.set('c1', mkSnapshot('c1', { pendingEarmarkTotal: '0' }));
      expect(comp.catalogPendingHint(c1)).toBe('');
    });

    it('renders "Pending: <amount>" (thousand-separated) for a single pending IB', () => {
      const { comp } = makeComponentA();
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.snapshots.set('c1', mkSnapshot('c1', { pendingEarmarkTotal: '-25000' }));
      comp.documentArrivalHints.catalogPayableIbs.set('c1', ['IB00001']);
      expect(comp.catalogPendingHint(c1)).toBe(' — Pending: 25,000');
    });

    it('renders "Total Pending: <amount>" when more than one IB is pending', () => {
      const { comp } = makeComponentA();
      comp.selectedFunction = A4;
      const c1 = mkContract('c1', '810');
      comp.catalogPicker.snapshots.set('c1', mkSnapshot('c1', { pendingEarmarkTotal: '-1234567.89' }));
      comp.documentArrivalHints.catalogPayableIbs.set('c1', ['IB00001', 'IB00002']);
      expect(comp.catalogPendingHint(c1)).toBe(' — Total Pending: 1,234,567.89');
    });
  });

  describe('movementTypeChecksAvailableBalance', () => {
    it('returns false for movementTypes the microservice never checks against Available Balance (bug fix 2026-08-19 — A2 Amendment Increase false warning)', () => {
      const { comp } = makeComponentA();
      expect(comp.movementTypeChecksAvailableBalance('ISSUE')).toBe(false);
      expect(comp.movementTypeChecksAvailableBalance('AMEND_INCREASE')).toBe(false);
      expect(comp.movementTypeChecksAvailableBalance('CREATE')).toBe(false);
      expect(comp.movementTypeChecksAvailableBalance('AMEND')).toBe(false);
    });

    it('returns true for every movementType the microservice DOES check against Available Balance', () => {
      const { comp } = makeComponentA();
      expect(comp.movementTypeChecksAvailableBalance('AMEND_DECREASE')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('UTILIZE')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('HONOUR')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('ACCEPT')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('PARTIAL_REDEEM')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('FULL_REDEEM')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('PARTIAL_SETTLE')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('FULL_SETTLE')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('REIMBURSE')).toBe(true);
      expect(comp.movementTypeChecksAvailableBalance('RECLASSIFY_OUT')).toBe(true);
    });

    it('returns false for null/undefined/unrecognized movementType', () => {
      const { comp } = makeComponentA();
      expect(comp.movementTypeChecksAvailableBalance(null)).toBe(false);
      expect(comp.movementTypeChecksAvailableBalance(undefined)).toBe(false);
      expect(comp.movementTypeChecksAvailableBalance('SOME_FUTURE_TYPE')).toBe(false);
    });
  });

  // =========================================================================
  // Group B — from transaction-builder.component.selection.spec.ts (100% Maker content; that file's own
  // content moved here in full and the origin file was deleted, per the migration task's own "move a
  // whole describe() block" rule taken to its logical conclusion when literally the entire file's
  // content is Maker-owned). Covers: onSelectContract, onSelectArrivalSg, onSelectPayMovement,
  // submitA4, refreshSelectedContractSnapshot, searchExistingContract, onSelectParent,
  // carriedCurrency, ibIndexPrevPage/ibIndexNextPage, the pickerSelection prevPage/nextPage thin
  // delegations, loadIbIndex() guard, onSelectSettleableBalance, onSelectIbIndex.
  // =========================================================================

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

  /** Default mock covers every side-effect call this component's methods can trigger, so tests only need to override the specific call(s) they care about. */
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

  function makeComponentB(fnDef: TransactionFunction, api: BalanceComponentApiService, subChoiceValue?: string): MakerPanelComponent {
    const comp = new MakerPanelComponent(api);
    triggerSelectFunction(comp, fnDef);
    if (subChoiceValue) {
      comp.subChoiceValue = subChoiceValue;
      comp.onSubChoice();
    }
    return comp;
  }

  describe('onSelectContract', () => {
    it("loads the picked contract's live snapshot (plain function, no special branches)", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '5000' }))) });
      const comp = makeComponentB(getFn('A3'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectContract('C1');

      expect(comp.selectedContract?.balanceContractId).toBe('C1');
      expect(api.getSnapshot).toHaveBeenCalledWith('C1');
      expect(comp.selectedContractSnapshot?.availableBalance).toBe('5000');
    });

    it('sets selectedContract to null and skips the snapshot fetch when the id is not in catalogPicker.contracts', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A3'), api);
      comp.catalogPicker.contracts = [];

      comp.onSelectContract('missing');

      expect(comp.selectedContract).toBeNull();
      expect(comp.selectedContractSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('handles a snapshot-fetch error by leaving selectedContractSnapshot null and clearing snapshotLoading', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'snapshot boom' } }))) });
      const comp = makeComponentB(getFn('A3'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1' })];

      comp.onSelectContract('C1');

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.snapshotLoading).toBe(false);
    });

    it('A4 (payExistingUtilize): loads still-PENDING, Checker-acknowledged (EARMARKED) UTILIZE movements under the picked contract and auto-picks the sole one', () => {
      const pendingUtilize = {
        movementId: 'M1',
        status: 'PENDING',
        movementType: 'UTILIZE',
        sourceTransactionRef: 'IB01',
        amount: '1000',
        acknowledgedAt: '2026-08-20T00:00:00.000Z',
      };
      const releasedUtilize = { movementId: 'M2', status: 'RELEASED', movementType: 'UTILIZE' };
      const api = makeApi({ listMovements: jest.fn(() => of([pendingUtilize, releasedUtilize])) });
      const comp = makeComponentB(getFn('A4'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1' })];

      comp.onSelectContract('C1');

      expect(api.listMovements).toHaveBeenCalledWith('C1');
      expect(comp.pickerSelection.payableMovements).toEqual([pendingUtilize]);
      // Only one PENDING match -> auto-picked (onSelectPayMovement side effect).
      expect(comp.pickerSelection.selectedPayMovement?.movementId).toBe('M1');
    });

    it('B4 (movementTypeFromContractTenor + payableMovementInstrumentType): derives HONOUR for a Sight Confirmation and loads already-RELEASED B3 CREATEs across child EPLC_EXAMINATION contracts', () => {
      const examinationContract = makeContract({
        balanceContractId: 'EX1',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'EXP1', ibNumber: 'EB01', sgNumber: null },
      });
      // B4's candidate filter looks for status === 'RELEASED' (B3's genuine Checker Release), not
      // 'PENDING'+acknowledgedAt.
      const releasedCreate = { movementId: 'MX1', status: 'RELEASED', movementType: 'CREATE', amount: '2000' };
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX1' ? of([releasedCreate]) : of([]))),
      });
      const comp = makeComponentB(getFn('B4'), api);
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
      expect(comp.pickerSelection.payableMovements).toHaveLength(1);
      expect(comp.pickerSelection.payableMovements[0].movementId).toBe('MX1');
      // Only one match -> auto-picked; B4 has secondaryRefLabel ('EB Number') so both naturalKey.ibNumber and model.secondaryRef get carried, from the EPLC_EXAMINATION contract's own naturalKey.ibNumber (merged in as a synthetic sourceTransactionRef).
      expect(comp.naturalKey.ibNumber).toBe('EB01');
      expect(comp.model.secondaryRef).toBe('EB01');
      expect(comp.model.amount).toBe('2000');
      // Deliberately NOT passed here, unlike every other action-picker call site: B3's CREATE stays
      // PENDING until B4's compound Release finalizes it, so filtering by "already Released" would
      // exclude every real candidate B4 needs to find.
      expect(api.catalog).toHaveBeenCalledWith('EPLC_EXAMINATION', 'ACTIVE', undefined, 1, 50, 'EXP1');
    });

    it('B4: derives ACCEPT for a Usance Confirmation, and excludes a still-PENDING (not yet genuinely Released) B3 record (payableMovementRequiresRelease)', () => {
      const examinationContract = makeContract({
        balanceContractId: 'EX2',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'EXP2', ibNumber: 'EB02', sgNumber: null },
      });
      // A B3 record that hasn't been genuinely Checker-Released yet (still PENDING) must not be
      // selectable by B4.
      const stillPendingCreate = { movementId: 'MX2', status: 'PENDING', movementType: 'CREATE', amount: '3000' };
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_EXAMINATION' ? of(makeCatalogPage([examinationContract])) : of(makeCatalogPage([])),
        ),
        listMovements: jest.fn((id: string) => (id === 'EX2' ? of([stillPendingCreate]) : of([]))),
      });
      const comp = makeComponentB(getFn('B4'), api);
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
      expect(comp.pickerSelection.payableMovements).toHaveLength(0); // filtered out — still PENDING, not yet Released
    });

    // Status alone isn't enough — an already-consumed record stays RELEASED forever, so
    // status === 'RELEASED' alone would still match it. Must also exclude anything with
    // presentDocsConsumedAt already set.
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
      const comp = makeComponentB(getFn('B4'), api);
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
      expect(comp.pickerSelection.payableMovements).toHaveLength(0); // filtered out — already consumed by an earlier B4
    });

    it("A3S (documentArrivalWithSg): loads the LC's outstanding SHGT records and auto-picks/fetches the sole one's snapshot", () => {
      const sgContract = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) => (instrumentType === 'SHGT' ? of(makeCatalogPage([sgContract])) : of(makeCatalogPage([])))),
        getSnapshot: jest.fn((id: string) => (id === 'SG1' ? of(makeSnapshot({ availableBalance: '3000', confirmedBalance: '3000' })) : of(makeSnapshot()))),
      });
      const comp = makeComponentB(getFn('A3S'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectContract('C1');

      expect(comp.pickerSelection.sgsForArrival).toHaveLength(1);
      expect(comp.pickerSelection.selectedArrivalSg?.balanceContractId).toBe('SG1');
      expect(comp.pickerSelection.arrivalSgSnapshot?.availableBalance).toBe('3000');
      // An SG whose own A8 Issue isn't Released yet shouldn't be offered as a redemption target.
      expect(api.catalog).toHaveBeenCalledWith('SHGT', 'ACTIVE', undefined, 1, 50, 'LC1', undefined, true);
    });
  });

  describe('onSelectArrivalSg', () => {
    function setupSg() {
      const api = makeApi();
      const comp = makeComponentB(getFn('A3S'), api);
      comp.pickerSelection.sgsForArrival = [
        makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } }),
      ];
      return { api, comp };
    }

    it("fetches and stores the picked SG's live snapshot", () => {
      const { api, comp } = setupSg();
      (api.getSnapshot as jest.Mock).mockReturnValueOnce(of(makeSnapshot({ availableBalance: '2500', confirmedBalance: '7000' })));

      comp.onSelectArrivalSg('SG1');

      expect(comp.pickerSelection.selectedArrivalSg?.balanceContractId).toBe('SG1');
      expect(comp.pickerSelection.arrivalSgSnapshot?.confirmedBalance).toBe('7000');
    });

    it('sets arrivalSgSnapshot to null on a snapshot-fetch error', () => {
      const { api, comp } = setupSg();
      (api.getSnapshot as jest.Mock).mockReturnValueOnce(throwError(() => ({ error: { message: 'boom' } })));

      comp.onSelectArrivalSg('SG1');

      expect(comp.pickerSelection.arrivalSgSnapshot).toBeNull();
    });

    it('clears selectedArrivalSg/arrivalSgSnapshot and skips the API call when the id is not in sgsForArrival', () => {
      const { api, comp } = setupSg();

      comp.onSelectArrivalSg('missing');

      expect(comp.pickerSelection.selectedArrivalSg).toBeNull();
      expect(comp.pickerSelection.arrivalSgSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('onSelectPayMovement', () => {
    it('A6 (settlesDocumentArrival, no secondaryRefLabel): carries and locks IB Number + Amount from the picked Document Arrival', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A6'), api);
      comp.pickerSelection.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000' })];

      comp.onSelectPayMovement('M1');

      expect(comp.pickerSelection.selectedPayMovement?.movementId).toBe('M1');
      expect(comp.naturalKey.ibNumber).toBe('IB01');
      expect(comp.model.amount).toBe('5000');
      expect(comp.model.secondaryRef).toBeUndefined(); // A6 has no secondaryRefLabel
    });

    it('B4 (settlesDocumentArrival + secondaryRefLabel "EB Number"): also carries the reference into model.secondaryRef', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('B4'), api);
      comp.pickerSelection.payableMovements = [makeMovement({ movementId: 'MX1', sourceTransactionRef: 'EB01', amount: '2000', movementType: 'CREATE' })];

      comp.onSelectPayMovement('MX1');

      expect(comp.naturalKey.ibNumber).toBe('EB01');
      expect(comp.model.secondaryRef).toBe('EB01');
      expect(comp.model.amount).toBe('2000');
    });

    it('A4 (no settlesDocumentArrival): sets selectedPayMovement but leaves naturalKey/model untouched', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A4'), api);
      comp.pickerSelection.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '999' })];
      comp.naturalKey.ibNumber = '';

      comp.onSelectPayMovement('M1');

      expect(comp.pickerSelection.selectedPayMovement?.movementId).toBe('M1');
      expect(comp.naturalKey.ibNumber).toBe('');
    });

    it('sets selectedPayMovement to null when the movementId is not found', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A6'), api);
      comp.pickerSelection.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000' })];

      comp.onSelectPayMovement('missing');

      expect(comp.pickerSelection.selectedPayMovement).toBeNull();
    });
  });

  // A4 has no single-actor release method — its picker (onSelectPayMovement, above) is browse-only, and
  // release happens via the generic Checker panel's checkerAct('release'), covered in
  // transaction-builder.component.actions.spec.ts's checkerAct() describe block. submitA4() is A4's own
  // real, backend-persisted Maker action (calls api.submitByMaker(), not api.release() or createMovement()).
  describe('submitA4', () => {
    it('does nothing when no movement is selected', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A4'), api);
      comp.pickerSelection.selectedPayMovement = null;

      comp.submitA4();

      expect(api.submitByMaker).not.toHaveBeenCalled();
    });

    it('calls api.submitByMaker() with the picked movement and model.createdBy, sets submitResult exactly like the generic submit() does', () => {
      const api = makeApi({ submitByMaker: jest.fn(() => of({ movementId: 'M1', status: 'PENDING', makerSubmittedBy: 'maker1' })) });
      const comp = makeComponentB(getFn('A4'), api);
      comp.pickerSelection.selectedPayMovement = makeMovement({ movementId: 'M1' });
      comp.model.createdBy = 'maker1';

      comp.submitA4();

      expect(api.submitByMaker).toHaveBeenCalledWith('M1', 'maker1');
      expect(api.createMovement).not.toHaveBeenCalled();
      expect(comp.submitResult).toEqual({ movementId: 'M1', status: 'PENDING', makerSubmittedBy: 'maker1' });
      expect(comp.submitting).toBe(false);
    });

    it('falls back to maker1 when model.createdBy is falsy', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A4'), api);
      comp.pickerSelection.selectedPayMovement = makeMovement({ movementId: 'M1' });
      comp.model.createdBy = '';

      comp.submitA4();

      expect(api.submitByMaker).toHaveBeenCalledWith('M1', 'maker1');
    });

    it('sets submitError and clears submitting on a submitByMaker() failure', () => {
      const api = makeApi({ submitByMaker: jest.fn(() => throwError(() => ({ error: { message: 'submit boom' } }))) });
      const comp = makeComponentB(getFn('A4'), api);
      comp.pickerSelection.selectedPayMovement = makeMovement({ movementId: 'M1' });

      comp.submitA4();

      expect(comp.submitError).toBe('submit boom');
      expect(comp.submitting).toBe(false);
      expect(comp.submitResult).toBeNull();
    });
  });

  // Common Requirement: every successful Maker Submit or Checker Release must refresh Look Up Current
  // Balance too, not just the Checker queue — regression coverage for a real gap this requirement's own
  // fix closed (several success paths previously called emitSync() with alsoSyncLookup left false).
  describe('Common Requirement — Refresh Look Up Current Balance (syncRequested.alsoSyncLookup)', () => {
    function captureSync(comp: MakerPanelComponent): { lcNumber: string; alsoSyncLookup: boolean }[] {
      const captured: { lcNumber: string; alsoSyncLookup: boolean }[] = [];
      comp.syncRequested.subscribe((e) => captured.push({ lcNumber: e.lcNumber, alsoSyncLookup: e.alsoSyncLookup }));
      return captured;
    }

    it("submitA4()'s Maker Submit success syncs Look Up Current Balance too", () => {
      const api = makeApi({ submitByMaker: jest.fn(() => of({ movementId: 'M1', status: 'PENDING' })) });
      const comp = makeComponentB(getFn('A4'), api);
      comp.selectedContract = makeContract();
      comp.pickerSelection.selectedPayMovement = makeMovement({ movementId: 'M1' });
      const captured = captureSync(comp);

      comp.submitA4();

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });

    it('a plain Checker Release/Reject (the refreshRequested signal) syncs Look Up Current Balance too', () => {
      const comp = makeComponentB(getFn('A1'), makeApi());
      comp.naturalKey.lcNumber = 'LC001';
      const captured = captureSync(comp);

      comp.refreshRequested = 1;
      comp.ngOnChanges({ refreshRequested: makeChange(null, 1) } as any);

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });

    it('the FIRST refreshRequested change (initial binding, not a real Checker action) is a no-op', () => {
      const comp = makeComponentB(getFn('A1'), makeApi());
      comp.naturalKey.lcNumber = 'LC001';
      const captured = captureSync(comp);

      comp.ngOnChanges({ refreshRequested: { previousValue: null, currentValue: 0, firstChange: true, isFirstChange: () => true } } as any);

      expect(captured).toHaveLength(0);
    });

    it("A3S's own Checker acknowledgment outcome (documentArrivalAcknowledged) syncs Look Up Current Balance too", () => {
      const comp = makeComponentB(getFn('A3S'), makeApi());
      comp.selectedContract = makeContract();
      const captured = captureSync(comp);

      comp.externalCheckerOutcome = { kind: 'documentArrivalAcknowledged' };
      comp.ngOnChanges({ externalCheckerOutcome: makeChange(null, comp.externalCheckerOutcome) } as any);

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });

    it('any other successful Checker outcome (release/reject/EC delete, carrying a real result) syncs Look Up Current Balance too', () => {
      const comp = makeComponentB(getFn('A2'), makeApi());
      comp.selectedContract = makeContract();
      const captured = captureSync(comp);

      comp.externalCheckerOutcome = { kind: 'released', result: makeMovement({ movementId: 'mv-2', status: 'RELEASED' }) };
      comp.ngOnChanges({ externalCheckerOutcome: makeChange(null, comp.externalCheckerOutcome) } as any);

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });

    it('a FAILED Checker outcome never syncs anything — nothing succeeded server-side', () => {
      const comp = makeComponentB(getFn('A2'), makeApi());
      comp.selectedContract = makeContract();
      const captured = captureSync(comp);

      comp.externalCheckerOutcome = { kind: 'failed', message: 'boom' };
      comp.ngOnChanges({ externalCheckerOutcome: makeChange(null, comp.externalCheckerOutcome) } as any);

      expect(captured).toHaveLength(0);
    });

    // Business instruction 2026-08-20 ("除了A1 & B1，其他功能當選取LC NUMBER後 Look Up Current Balance
    // 自動輸入選取到的LC NUMBER 做 LOOKUP處理") — reverses the prior design this same describe block used
    // to document ("a mere selection pick... never Look Up Current Balance"): every function that PICKS
    // an existing LC (A2-A9/B2-B5) now syncs Look Up the moment that pick resolves, not only after a
    // Submit/Release success. A1/B1 have no pick step (they create a brand-new LC) so are unaffected —
    // covered separately below.
    it('a mere selection pick (onSelectContract) now ALSO syncs Look Up Current Balance', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A2'), api);
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1' })];
      const captured = captureSync(comp);

      comp.onSelectContract('C1');

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });

    it('onSelectParent (A8) also syncs Look Up Current Balance on a mere pick', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A8'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null } })];
      const captured = captureSync(comp);

      comp.onSelectParent('P1');

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });

    it('onSelectIbIndex (A7 Step 2) also syncs Look Up Current Balance on a mere pick', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A7'), api);
      comp.ibIndexPicker.contracts = [
        makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC001', ibNumber: 'IB01', sgNumber: null } }),
      ];
      const captured = captureSync(comp);

      comp.onSelectIbIndex('IB1');

      expect(captured).toContainEqual({ lcNumber: 'LC001', alsoSyncLookup: true });
    });
  });

  describe('onSelectPayMovement clears a stale submitResult (A4 only)', () => {
    it('resets submitResult/submitError when a NEW Document Arrival is picked for A4', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A4'), api);
      comp.pickerSelection.payableMovements = [makeMovement({ movementId: 'M1' }), makeMovement({ movementId: 'M2' })];
      comp.submitResult = makeMovement({ movementId: 'M1', status: 'PENDING' });
      comp.submitError = 'stale error';

      comp.onSelectPayMovement('M2');

      expect(comp.submitResult).toBeNull();
      expect(comp.submitError).toBeNull();
    });

    it('does NOT reset submitResult for a non-A4 function (A6) — settlesDocumentArrival keeps its own existing behavior', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A6'), api);
      comp.pickerSelection.payableMovements = [makeMovement({ movementId: 'M1', sourceTransactionRef: 'IB01', amount: '5000' })];
      comp.submitResult = makeMovement({ movementId: 'OLD', status: 'PENDING' });

      comp.onSelectPayMovement('M1');

      expect(comp.submitResult).toEqual(makeMovement({ movementId: 'OLD', status: 'PENDING' }));
    });
  });

  describe('refreshSelectedContractSnapshot', () => {
    it('clears the snapshot and makes no API call when nothing is selected', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A3'), api);
      comp.selectedContract = null;

      comp.refreshSelectedContractSnapshot();

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('fetches and stores the snapshot for a plain function (no amount auto-fill branch)', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '4242' }))) });
      const comp = makeComponentB(getFn('A3'), api);
      comp.selectedContract = makeContract({ balanceContractId: 'C1' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.selectedContractSnapshot?.availableBalance).toBe('4242');
      expect(comp.snapshotLoading).toBe(false);
    });

    it("A7 Full Settle: carries and locks Amount from the Acceptance's Available Balance", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '6600' }))) });
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
      comp.selectedContract = makeContract({ balanceContractId: 'IB1', instrumentType: 'IPLC_ACCEPTANCE' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.model.amount).toBe('6600');
    });

    it("A9 (autoRedeemType): defaults Amount to the SG's Available Balance", () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '999' }))) });
      const comp = makeComponentB(getFn('A9'), api);
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
      const comp = makeComponentB(syntheticB5, api);
      comp.model.instrumentType = 'EPLC_ACCEPTANCE';
      comp.model.movementType = 'REIMBURSE';
      comp.selectedContract = makeContract({ balanceContractId: 'EB1', instrumentType: 'EPLC_ACCEPTANCE' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.model.amount).toBe('1234');
    });

    it('clears the snapshot and snapshotLoading on a fetch error', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => throwError(() => ({ error: { message: 'boom' } }))) });
      const comp = makeComponentB(getFn('A3'), api);
      comp.selectedContract = makeContract({ balanceContractId: 'C1' });

      comp.refreshSelectedContractSnapshot();

      expect(comp.selectedContractSnapshot).toBeNull();
      expect(comp.snapshotLoading).toBe(false);
    });
  });

  describe('searchExistingContract', () => {
    it('does nothing when model.instrumentType is unset', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A9'), api);
      comp.model.instrumentType = undefined;

      expect(() => comp.searchExistingContract()).not.toThrow();
      expect(comp.searchError).toBeNull();
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires LC Number', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: '', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(comp.searchError).toBe('LC Number is mandatory to search.');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires SG Number for a SHGT search', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: '' };

      comp.searchExistingContract();

      expect(comp.searchError).toBe('SG Number is mandatory to search.');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('requires IB Number for an Acceptance search', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: '' };

      comp.searchExistingContract();

      expect(comp.searchError).toContain('IB Number is mandatory to search');
      expect(api.resolveContract).not.toHaveBeenCalled();
    });

    it('non-decreasing movementType: resolves and selects the contract without an availability check', () => {
      const found = makeContract({ balanceContractId: 'SG1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: 'SG01' } });
      const api = makeApi({ resolveContract: jest.fn(() => of(found)) });
      const comp = makeComponentB(getFn('A8'), api); // A8 = SHGT ISSUE, not a decreasing movementType
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
      const comp = makeComponentB(getFn('A9'), api); // A9 = SHGT FULL_REDEEM, decreasing
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
      const comp = makeComponentB(getFn('A9'), api);
      comp.searchNaturalKey = { lcNumber: 'LC1', ibNumber: '', sgNumber: 'SG01' };

      comp.searchExistingContract();

      expect(comp.selectedContract?.balanceContractId).toBe('SG1');
      expect(comp.searchError).toBeNull();
    });

    it('resolve error: clears the selection and shows the server message', () => {
      const api = makeApi({ resolveContract: jest.fn(() => throwError(() => ({ error: { message: 'not found' } }))) });
      const comp = makeComponentB(getFn('A9'), api);
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
      const comp = makeComponentB(getFn('A8'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('P1');

      expect(comp.selectedParent?.balanceContractId).toBe('P1');
      expect(comp.naturalKey.lcNumber).toBe('LC1');
    });

    // Business instruction 2026-08-20 ("B3金額輸入檢查與B2 Decrease相同 <= Tight Available Balance") — A8/B3
    // previously never populated selectedContract/selectedContractSnapshot after picking the Parent, so
    // the balance box + Available/Tight Available Balance warnings (both gated on selectedContract in the
    // template) never rendered at all for either. onSelectParent() now aliases selectedContract to the
    // parent for this specific "create a new child directly under the parent, no further picker" shape.
    it('A8 (creating movement, no further picker): aliases selectedContract to the picked Parent and loads its snapshot', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '100', tightAvailableBalance: '90' }))) });
      const comp = makeComponentB(getFn('A8'), api);
      const parent = makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null } });
      comp.parentPicker.contracts = [parent];

      comp.onSelectParent('P1');

      expect(comp.selectedContract).toBe(parent);
      expect(api.getSnapshot).toHaveBeenCalledWith('P1');
      expect(comp.selectedContractSnapshot?.tightAvailableBalance).toBe('90');
    });

    it('B3 (creating movement, no further picker): same alias — selectedContract becomes the picked parent EPLC_CONFIRMATION', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '100', tightAvailableBalance: '90' }))) });
      const comp = makeComponentB(getFn('B3'), api);
      const parent = makeContract({
        balanceContractId: 'CNF1',
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null },
      });
      comp.parentPicker.contracts = [parent];

      comp.onSelectParent('CNF1');

      expect(comp.selectedContract).toBe(parent);
      expect(comp.selectedContractSnapshot?.tightAvailableBalance).toBe('90');
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
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
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

    it('A6 (settlesDocumentArrival + tenorTypeOptions): loads still-PENDING, Checker-acknowledged (EARMARKED) Document Arrivals and carries Tenor Type/Days from the Parent', () => {
      const pendingArrival = {
        movementId: 'M1',
        status: 'PENDING',
        movementType: 'UTILIZE',
        sourceTransactionRef: 'IB01',
        amount: '1500',
        acknowledgedAt: '2026-08-20T00:00:00.000Z',
      };
      const api = makeApi({ listMovements: jest.fn(() => of([pendingArrival])) });
      const comp = makeComponentB(getFn('A6'), api);
      comp.parentPicker.contracts = [
        makeContract({ balanceContractId: 'P1', naturalKey: { lcNumber: 'LC1', ibNumber: null, sgNumber: null }, tenorType: 'SELLERS_USANCE', tenorDays: 90 }),
      ];

      comp.onSelectParent('P1');

      expect(api.listMovements).toHaveBeenCalledWith('P1');
      expect(comp.pickerSelection.payableMovements).toEqual([pendingArrival]);
      expect(comp.model.tenorType).toBe('SELLERS_USANCE');
      expect(comp.model.tenorDays).toBe(90);
      // A6 is settlesDocumentArrival — excluded from the A8/B3-only selectedContract alias above (A6 has
      // its own Step-2 payable-movement picker, a different meaning for "the target of this submission").
      expect(comp.selectedContract).toBeNull();
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
      const comp = makeComponentB(getFn('B5'), api);
      comp.parentPicker.contracts = [
        makeContract({ balanceContractId: 'CNF1', instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } }),
      ];

      comp.onSelectParent('CNF1');

      expect(comp.pickerSelection.settleableBalances).toEqual([
        { balanceContractId: 'ACC1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' },
      ]);
      // An Acceptance whose own CREATE isn't Released yet shouldn't be offered as a settlement target.
      expect(api.catalog).toHaveBeenCalledWith('EPLC_ACCEPTANCE', 'ACTIVE', undefined, 1, 50, 'EXP1', undefined, true);
    });

    it('B5 (settleableBalanceIndex): a catalog error for the candidate type is swallowed (catchError) and leaves settleableBalances empty', () => {
      const api = makeApi({
        catalog: jest.fn((instrumentType: InstrumentType) =>
          instrumentType === 'EPLC_ACCEPTANCE' ? throwError(() => ({ error: { message: 'catalog boom' } })) : of(makeCatalogPage([])),
        ),
      });
      const comp = makeComponentB(getFn('B5'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      expect(() => comp.onSelectParent('CNF1')).not.toThrow();

      expect(comp.pickerSelection.settleableBalances).toEqual([]);
      expect(comp.pickerSelection.settleableBalancesLoading).toBe(false);
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
      const comp = makeComponentB(getFn('B5'), api);
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } })];

      comp.onSelectParent('CNF1');

      expect(comp.pickerSelection.settleableBalances).toEqual([]);
      expect(comp.pickerSelection.settleableBalancesLoading).toBe(false);
    });

    it('does nothing (leaves selectedParent null, no side loads) when the contractId is not in parentPicker.contracts', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A6'), api);
      comp.parentPicker.contracts = [];

      comp.onSelectParent('missing');

      expect(comp.selectedParent).toBeNull();
      expect(comp.naturalKey.lcNumber).toBe('');
    });
  });

  // A1/B1 Currency Code is a plain input; every other function carries it from A1/B1, protected.
  describe('carriedCurrency / Currency carry-and-protect (business instruction 2026-08-16)', () => {
    function currencyFieldProps(comp: MakerPanelComponent): { label: string; disabled: boolean } {
      const field = comp.fields.find((f) => f.key === 'currency');
      return { label: field?.props?.label as string, disabled: !!field?.props?.disabled };
    }

    it('A1 (LC Issue): carriedCurrency is null and the Currency field is a plain, editable Input', () => {
      const comp = makeComponentB(getFn('A1'), makeApi());

      expect(comp.carriedCurrency).toBeNull();
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency', disabled: false });
    });

    it('B1 (Confirm LC): carriedCurrency is null and the Currency field is a plain, editable Input', () => {
      const comp = makeComponentB(getFn('B1'), makeApi());

      expect(comp.carriedCurrency).toBeNull();
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency', disabled: false });
    });

    it("A2 (flat Catalog, non-hasParent): onSelectContract carries the picked LC's Currency into model.currency and locks the field", () => {
      const comp = makeComponentB(getFn('A2'), makeApi());
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', currency: 'EUR' })];

      comp.onSelectContract('C1');

      expect(comp.model.currency).toBe('EUR');
      expect(comp.carriedCurrency).toBe('EUR');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it("B2 (flat Catalog, non-hasParent, Export side): onSelectContract carries the picked Confirmation's Currency", () => {
      const comp = makeComponentB(getFn('B2'), makeApi());
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', instrumentType: 'EPLC_CONFIRMATION', currency: 'GBP' })];

      comp.onSelectContract('C1');

      expect(comp.model.currency).toBe('GBP');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it("A6 (Parent LC picker, hasParent): onSelectParent carries the parent LC's Currency and locks the field, before any Step 2 picker", () => {
      const comp = makeComponentB(getFn('A6'), makeApi());
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', currency: 'JPY' })];

      comp.onSelectParent('P1');

      expect(comp.model.currency).toBe('JPY');
      expect(comp.carriedCurrency).toBe('JPY');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it("B5 (Parent LC picker, hasParent, Export side): onSelectParent carries the Confirmation's Currency", () => {
      const comp = makeComponentB(getFn('B5'), makeApi());
      comp.parentPicker.contracts = [makeContract({ balanceContractId: 'P1', instrumentType: 'EPLC_CONFIRMATION', currency: 'CNY' })];

      comp.onSelectParent('P1');

      expect(comp.model.currency).toBe('CNY');
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency (carried from the existing record, protected)', disabled: true });
    });

    it('selectedParent takes precedence over selectedContract when both happen to be set', () => {
      const comp = makeComponentB(getFn('A6'), makeApi());
      comp.selectedParent = makeContract({ balanceContractId: 'P1', currency: 'JPY' });
      comp.selectedContract = makeContract({ balanceContractId: 'C1', currency: 'USD' });

      expect(comp.carriedCurrency).toBe('JPY');
    });

    it('switching back to A1 clears the lock (resetForFunction resets selectedContract/selectedParent to null)', () => {
      const comp = makeComponentB(getFn('A2'), makeApi());
      comp.catalogPicker.contracts = [makeContract({ balanceContractId: 'C1', currency: 'EUR' })];
      comp.onSelectContract('C1');
      expect(currencyFieldProps(comp).disabled).toBe(true);

      triggerSelectFunction(comp, getFn('A1'));

      expect(comp.carriedCurrency).toBeNull();
      expect(currencyFieldProps(comp)).toEqual({ label: 'Currency', disabled: false });
      expect(comp.model.currency).toBe('USD'); // resetForFunction's own model reset default
    });
  });

  // Prev/Next are pure client-side windowing over the already-fetched, already-filtered set (display
  // page size 5); neither triggers a new api.catalog call, regardless of LC context.
  describe('ibIndexPrevPage / ibIndexNextPage', () => {
    function setupIb() {
      const api = makeApi();
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
      comp.model.instrumentType = 'IPLC_ACCEPTANCE';
      comp.searchNaturalKey.lcNumber = 'LC1';
      (api.catalog as jest.Mock).mockClear();
      return { api, comp };
    }

    it('ibIndexPrevPage is a no-op on page 1', () => {
      const { api, comp } = setupIb();
      comp.ibIndexPicker.page = 1;
      comp.ibIndexPicker.total = 12; // display pageSize 5 -> 3 pages

      comp.ibIndexPrevPage();

      expect(comp.ibIndexPicker.page).toBe(1);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexPrevPage moves back a page locally, without reloading', () => {
      const { api, comp } = setupIb();
      comp.ibIndexPicker.page = 2;
      comp.ibIndexPicker.total = 12;

      comp.ibIndexPrevPage();

      expect(comp.ibIndexPicker.page).toBe(1);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage is a no-op on the last page', () => {
      const { api, comp } = setupIb();
      comp.ibIndexPicker.page = 3; // totalPages = 3
      comp.ibIndexPicker.total = 12;

      comp.ibIndexNextPage();

      expect(comp.ibIndexPicker.page).toBe(3);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage moves forward a page locally, without reloading', () => {
      const { api, comp } = setupIb();
      comp.ibIndexPicker.page = 1;
      comp.ibIndexPicker.total = 12;

      comp.ibIndexNextPage();

      expect(comp.ibIndexPicker.page).toBe(2);
      expect(api.catalog).not.toHaveBeenCalled();
    });

    it('ibIndexNextPage moves the page locally even before any LC context is set (no reload, no API call either way)', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
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

  /**
   * arrivalSg/settleableBalances/payableMovements prevPage()/nextPage() are one-line delegations to
   * `pickerSelection`'s like-named methods — these tests prove the delegation itself; the underlying
   * paging math is covered by `picker-selection.service.spec.ts`.
   */
  describe('arrivalSgPrevPage / arrivalSgNextPage / settleableBalancesPrevPage / settleableBalancesNextPage / payableMovementsPrevPage / payableMovementsNextPage — thin delegation to pickerSelection', () => {
    it('arrivalSgPrevPage/arrivalSgNextPage move pickerSelection.arrivalSgPaging.page within bounds', () => {
      const comp = makeComponentB(getFn('A3S'), makeApi());
      comp.pickerSelection.arrivalSgPaging.page = 1;
      comp.pickerSelection.arrivalSgPaging.total = 12; // display pageSize 5 -> 3 pages

      comp.arrivalSgPrevPage();
      expect(comp.pickerSelection.arrivalSgPaging.page).toBe(1); // no-op on page 1

      comp.arrivalSgNextPage();
      expect(comp.pickerSelection.arrivalSgPaging.page).toBe(2);

      comp.arrivalSgPrevPage();
      expect(comp.pickerSelection.arrivalSgPaging.page).toBe(1);
    });

    it('settleableBalancesPrevPage/settleableBalancesNextPage move pickerSelection.settleableBalancesPaging.page within bounds', () => {
      const comp = makeComponentB(getFn('B5'), makeApi());
      comp.pickerSelection.settleableBalancesPaging.page = 1;
      comp.pickerSelection.settleableBalancesPaging.total = 12;

      comp.settleableBalancesPrevPage();
      expect(comp.pickerSelection.settleableBalancesPaging.page).toBe(1);

      comp.settleableBalancesNextPage();
      expect(comp.pickerSelection.settleableBalancesPaging.page).toBe(2);

      comp.settleableBalancesPrevPage();
      expect(comp.pickerSelection.settleableBalancesPaging.page).toBe(1);
    });

    it('payableMovementsPrevPage/payableMovementsNextPage move pickerSelection.payableMovementsPaging.page within bounds', () => {
      const comp = makeComponentB(getFn('A4'), makeApi());
      comp.pickerSelection.payableMovementsPaging.page = 1;
      comp.pickerSelection.payableMovementsPaging.total = 12;

      comp.payableMovementsPrevPage();
      expect(comp.pickerSelection.payableMovementsPaging.page).toBe(1);

      comp.payableMovementsNextPage();
      expect(comp.pickerSelection.payableMovementsPaging.page).toBe(2);

      comp.payableMovementsPrevPage();
      expect(comp.pickerSelection.payableMovementsPaging.page).toBe(1);
    });
  });

  describe('loadIbIndex() guard (via onSelectParent) — clears the index when the guard fails', () => {
    it('clears ibIndexPicker.contracts/total without calling the api when the picked Parent has no LC Number of its own', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
      // A degenerate parent (empty lcNumber) still resolves via onSelectParent() and still reaches
      // loadIbIndex() (usesTwoFieldSearch only depends on model.instrumentType/requiredNaturalKeyFields,
      // both already set by makeComponentB's own subChoice), but loadIbIndex()'s own guard
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
      const comp = makeComponentB(getFn('B5'), api);
      comp.selectedParent = makeContract({ balanceContractId: 'CNF1', naturalKey: { lcNumber: 'EXP1', ibNumber: null, sgNumber: null } });
      comp.pickerSelection.settleableBalances = [
        { balanceContractId: 'SB1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' },
      ];

      comp.onSelectSettleableBalance('SB1');

      expect(comp.model.instrumentType).toBe('EPLC_ACCEPTANCE');
      expect(comp.selectedContract?.balanceContractId).toBe('SB1');
      expect(comp.searchNaturalKey.ibNumber).toBe('EB01');
      expect(api.getSnapshot).toHaveBeenCalledWith('SB1');
    });

    it('does nothing when the balanceContractId is not in settleableBalances', () => {
      const api = makeApi();
      const comp = makeComponentB(getFn('B5'), api);
      comp.pickerSelection.settleableBalances = [
        { balanceContractId: 'SB1', instrumentType: 'EPLC_ACCEPTANCE', ibNumber: 'EB01', availableBalance: '4000', currency: 'USD' },
      ];
      comp.selectedContract = null;

      comp.onSelectSettleableBalance('missing');

      expect(comp.selectedContract).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('onSelectIbIndex', () => {
    it('selects the row directly, carries its IB/SG Number into searchNaturalKey, and refreshes the snapshot', () => {
      const api = makeApi({ getSnapshot: jest.fn(() => of(makeSnapshot({ availableBalance: '3300' }))) });
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
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
      const comp = makeComponentB(getFn('A7'), api, 'FULL_SETTLE');
      comp.ibIndexPicker.contracts = [makeContract({ balanceContractId: 'IB1' })];
      comp.searchNaturalKey.lcNumber = ''; // keep contextLcNumber falsy so any sync stays inert

      comp.onSelectIbIndex('missing');

      expect(comp.selectedContract).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Group C — from transaction-builder.component.actions.spec.ts (submit()'s own validation guards,
  // isSubmitReady, request-building, and its 4 compound shapes — A3S/B4 Sight/B4 Usance/B5). Every other
  // describe block in that origin file (release()/reject()/deleteMakerPending()/checkerAct()/
  // approveArrival()/runLookup()/etc) is genuinely Checker/parent-owned and stayed in
  // transaction-builder.component.actions.spec.ts unchanged.
  // =========================================================================

  const A3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3')!;
  const A8 = IMPORT_FUNCTIONS.find((f) => f.code === 'A8')!;
  const B3 = EXPORT_FUNCTIONS.find((f) => f.code === 'B3')!;
  const B4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4')!;
  const B5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5')!;

  function makeContractC(overrides: Partial<BalanceContract> = {}): BalanceContract {
    return {
      balanceContractId: 'bc-1',
      logicalContractId: 'lgl-1',
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null },
      status: 'ACTIVE',
      currency: 'USD',
      ...overrides,
    };
  }

  function makeSnapshotC(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
    return {
      balanceContractId: 'bc-1',
      logicalContractId: 'lgl-1',
      currency: 'USD',
      confirmedBalance: '1000',
      availableBalance: '1000',
      pendingEarmarkTotal: '0',
      ...overrides,
    };
  }

  function makeMovementC(overrides: any = {}): any {
    return {
      movementId: 'mv-1',
      balanceContractId: 'bc-1',
      status: 'PENDING',
      movementType: 'UTILIZE',
      amount: '500',
      currency: 'USD',
      sourceTransactionRef: 'IB001',
      eventSeq: 1,
      ...overrides,
    };
  }

  function apiErrC(message: string) {
    return throwError(() => ({ error: { message } }));
  }

  function makeApiC() {
    return {
      createMovement: jest.fn(() => of({ body: { movementId: 'mv-new', status: 'PENDING' } })),
      release: jest.fn(() => of({ movementId: 'mv-released', status: 'RELEASED' })),
      reject: jest.fn(() => of({ movementId: 'mv-rejected', status: 'REJECTED' })),
      cancel: jest.fn(() => of({ movementId: 'mv-cancelled', status: 'CANCELLED' })),
      resolveContract: jest.fn(() => of(makeContractC())),
      catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
      getSnapshot: jest.fn(() => of(makeSnapshotC())),
      listMovements: jest.fn(() => of([] as any[])),
      findByBusinessEventId: jest.fn(() => of([] as any[])),
    };
  }

  function setupC() {
    const api = makeApiC();
    const comp = new MakerPanelComponent(api as unknown as BalanceComponentApiService);
    return { comp, api };
  }

  function lastReqC(api: ReturnType<typeof makeApiC>, callIndex = 0): CreateMovementRequest {
    return (api.createMovement.mock.calls as any[])[callIndex][0];
  }

  // ---------------------------------------------------------------------
  // submit() — validation guards (no createMovement call)
  // ---------------------------------------------------------------------
  describe('submit() — validation guards', () => {
    it('requires amount/currency/createdBy', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A1);
      comp.naturalKey.lcNumber = 'LC001';
      // model.amount left unset
      comp.submit();
      expect(comp.submitError).toBe('Fill in amount, currency, createdBy.');
      expect(comp.submitting).toBe(false);
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('rejects an Amount with more decimal places than the typed Currency allows (e.g. JPY has no cents)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A1);
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '10000.5';
      comp.model.currency = 'JPY';
      comp.model.createdBy = 'maker1';
      comp.model.expiryDate = '2028-12-28';
      comp.submit();
      expect(comp.submitError).toBe('Amount 10000.5 has more decimal places than JPY allows (0).');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires the dynamic secondary reference label (A2)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A2);
      comp.subChoiceValue = 'AMEND_INCREASE';
      comp.onSubChoice();
      comp.model.amount = '500';
      comp.selectedContract = makeContractC();
      // model.secondaryRef left unset
      comp.submit();
      expect(comp.submitError).toBe('Amendment No./Times is mandatory for A2.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires SG Number when issuing a Shipping Guarantee (A8)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A8);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      // naturalKey.sgNumber left unset
      comp.submit();
      expect(comp.submitError).toBe('SG Number is mandatory when issuing a Shipping Guarantee.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires the Parent LC to be picked first for a lcNumberFromParent function (A6)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A6);
      comp.model.amount = '1000';
      // naturalKey.lcNumber left unset — never picked a Parent LC
      comp.submit();
      expect(comp.submitError).toBe("Pick the Parent LC first — that selection supplies this record's LC Number.");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires LC Number for a natural-key creating function with no parent (A1)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A1);
      comp.model.amount = '1000';
      comp.model.expiryDate = '2028-12-28';
      // naturalKey.lcNumber left unset
      comp.submit();
      expect(comp.submitError).toBe('LC Number is mandatory.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires IB Number when the instrument natural key needs it (A6)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A6);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      // naturalKey.ibNumber left unset
      comp.submit();
      expect(comp.submitError).toBe('IB Number is mandatory.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires Tenor Type when tenorTypeOptions are declared (A6)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A6);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      comp.naturalKey.ibNumber = 'IB01';
      // model.tenorType left unset
      comp.submit();
      expect(comp.submitError).toBe('Tenor Type is mandatory for A6.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it("requires Tenor Days > 0 for A1 Seller's/Buyer's Usance", () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A1);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.tenorType = 'SELLERS_USANCE';
      comp.model.expiryDate = '2028-12-28';
      // model.tenorDays left unset
      comp.submit();
      expect(comp.submitError).toBe("Tenor Days must be greater than 0 for Seller's/Buyer's Usance.");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires picking the still-PENDING Document Arrival before creating an Acceptance (A6)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A6);
      comp.model.amount = '1000';
      comp.naturalKey.lcNumber = 'LC001';
      comp.naturalKey.ibNumber = 'IB01';
      comp.model.tenorType = 'SELLERS_USANCE';
      comp.model.tenorDays = 90;
      // selectedPayMovement left unset
      comp.submit();
      expect(comp.submitError).toBe('Pick the still-PENDING Document Arrival (2ndary Index) to convert first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires picking a Shipping Guarantee for Document Arrival w/ Shipping Gtee (A3S)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A3S);
      comp.model.amount = '1000';
      comp.model.secondaryRef = 'IB01';
      comp.selectedContract = makeContractC();
      // selectedArrivalSg / arrivalSgSnapshot left unset
      comp.submit();
      expect(comp.submitError).toBe('Pick the Shipping Guarantee this Document Arrival is against first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('A9 autoRedeemType: requires a snapshot before redeeming', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A9);
      comp.model.amount = '500';
      comp.selectedContract = makeContractC({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      // selectedContractSnapshot left unset
      comp.submit();
      expect(comp.submitError).toBe('Search for the Shipping Guarantee to redeem first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('A9 (locked to Full Redeem, BA-confirmed 2026-08-21): rejects an amount exceeding Available Balance', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A9);
      comp.model.amount = '2000';
      comp.selectedContract = makeContractC({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      comp.selectedContractSnapshot = makeSnapshotC({ availableBalance: '1000' });
      comp.submit();
      expect(comp.submitError).toBe('A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (1000) — Partial Redeem is no longer supported here.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('B5 settlesAcceptanceOnMature: requires a snapshot before settling', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, B5);
      comp.model.amount = '500';
      comp.selectedContract = makeContractC({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null } });
      // selectedContractSnapshot left unset
      comp.submit();
      expect(comp.submitError).toBe('Search for the Acceptance to settle first.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('B5 settlesAcceptanceOnMature: rejects an amount exceeding Available Balance', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, B5);
      comp.model.amount = '2000';
      comp.selectedContract = makeContractC({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null } });
      comp.selectedContractSnapshot = makeSnapshotC({ availableBalance: '1000' });
      comp.submit();
      expect(comp.submitError).toBe("Amount must not exceed the Acceptance's Available Balance (1000).");
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('requires an existing contract to be picked for a non-creating function (A2)', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A2);
      comp.subChoiceValue = 'AMEND_DECREASE';
      comp.onSubChoice();
      comp.model.amount = '100';
      comp.model.secondaryRef = 'AMD01';
      // selectedContract left unset
      comp.submit();
      expect(comp.submitError).toBe('Pick a contract from the Catalog below.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // isSubmitReady
  // ---------------------------------------------------------------------
  describe('isSubmitReady', () => {
    it('A1 (no eligible-target requirement) — false with mandatory fields missing, true once Amount/LC Number are filled in', () => {
      const { comp } = setupC();
      triggerSelectFunction(comp, A1);
      expect(comp.isSubmitReady).toBe(false); // no Amount, no LC Number yet

      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '100000';
      comp.model.expiryDate = '2028-12-28';
      // model.currency/createdBy already default 'USD'/'maker1'; tenorType defaults to SIGHT via resetForFunction()
      expect(comp.isSubmitReady).toBe(true);
    });

    it('A2 — false before an eligible target is picked (mandatory fields otherwise valid)', () => {
      const { comp } = setupC();
      triggerSelectFunction(comp, A2);
      comp.subChoiceValue = 'AMEND_DECREASE';
      comp.onSubChoice();
      comp.model.amount = '100';
      comp.model.secondaryRef = 'AMD01';
      // selectedContract left unset — hasEligibleTargetSelected is false
      expect(comp.isSubmitReady).toBe(false);
    });

    it('A2 — still false once an eligible target IS picked but a mandatory field (Amendment No.) is still blank', () => {
      const { comp } = setupC();
      triggerSelectFunction(comp, A2);
      comp.subChoiceValue = 'AMEND_DECREASE';
      comp.onSubChoice();
      comp.model.amount = '100';
      comp.selectedContract = makeContractC();
      // model.secondaryRef left unset — validateSubmit() would still fail
      expect(comp.hasEligibleTargetSelected).toBe(true);
      expect(comp.isSubmitReady).toBe(false);
    });

    it('A2 — true once BOTH an eligible target is picked AND every mandatory field is valid', () => {
      const { comp } = setupC();
      triggerSelectFunction(comp, A2);
      comp.subChoiceValue = 'AMEND_DECREASE';
      comp.onSubChoice();
      comp.model.amount = '100';
      comp.model.secondaryRef = 'AMD01';
      comp.selectedContract = makeContractC();
      expect(comp.isSubmitReady).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // submit() — request-building + happy/error paths
  // ---------------------------------------------------------------------
  describe('submit() — request building', () => {
    it('A1 LC Issue: builds via the natural-key path, Sight omits tenorDays from the wire, and handles success', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A1);
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '100000';
      comp.model.tolerancePct = '10';
      comp.model.eventSeq = 42;
      comp.model.expiryDate = '2028-12-28';
      // tenorType defaults to SIGHT via resetForFunction()

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      const req = lastReqC(api);
      expect(req).toMatchObject({
        instrumentType: 'IPLC_LC',
        movementType: 'ISSUE',
        eventSeq: 42,
        amount: '100000',
        currency: 'USD',
        createdBy: 'maker1',
        tolerancePct: '10',
        tenorType: 'SIGHT',
        expiryDate: '2028-12-28',
        naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null },
      });
      // 0 is falsy — `if (this.model.tenorDays)` never fires for Sight's forced 0.
      expect(req.tenorDays).toBeUndefined();
      expect(req.sourceTransactionRef).toBeUndefined();
      expect(req.balanceContractId).toBeUndefined();

      expect(comp.submitting).toBe(false);
      expect(comp.submitResult).toEqual({ movementId: 'mv-new', status: 'PENDING' });
      expect(comp.submitError).toBeNull();
    });

    it('A1 LC Issue Usance: includes tenorDays on the wire and defaults tolerancePct absent when not typed', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A1);
      comp.naturalKey.lcNumber = 'LC002';
      comp.model.amount = '50000';
      comp.model.tenorType = 'BUYERS_USANCE';
      comp.model.tenorDays = 90;
      comp.model.expiryDate = '2028-12-28';
      // tolerancePct left unset

      comp.submit();

      const req = lastReqC(api);
      expect(req.tenorDays).toBe(90);
      expect(req.tenorType).toBe('BUYERS_USANCE');
      expect(req.tolerancePct).toBeUndefined();
    });

    it('A1 LC Issue: surfaces the server error code/message and resets submitting on failure', () => {
      const { comp, api } = setupC();
      api.createMovement.mockReturnValueOnce(apiErrC('NATURAL_KEY_ALREADY_EXISTS: LC001 already exists') as any);
      triggerSelectFunction(comp, A1);
      comp.naturalKey.lcNumber = 'LC001';
      comp.model.amount = '100000';
      comp.model.expiryDate = '2028-12-28';

      comp.submit();

      expect(comp.submitting).toBe(false);
      expect(comp.submitError).toBe('NATURAL_KEY_ALREADY_EXISTS: LC001 already exists');
      // submitResult must stay null (not the raw HTTP error body) on a primary-call failure, or
      // formLocked (!!submitResult) would incorrectly lock the form after a failed Submit.
      expect(comp.submitResult).toBeNull();
    });

    it('A2 Amendment: builds via the existing balanceContractId path with sourceTransactionRef', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A2);
      comp.subChoiceValue = 'AMEND_INCREASE';
      comp.onSubChoice();
      comp.model.amount = '5000';
      comp.model.secondaryRef = 'AMD01';
      comp.selectedContract = makeContractC({ balanceContractId: 'bc-42' });

      comp.submit();

      const req = lastReqC(api);
      expect(req.movementType).toBe('AMEND_INCREASE');
      expect(req.balanceContractId).toBe('bc-42');
      expect(req.naturalKey).toBeUndefined();
      expect(req.sourceTransactionRef).toBe('AMD01');
    });

    it('sets exposureNature and parentLogicalContractId when the top-level request itself targets EPLC_ACCEPTANCE/CREATE with a parent picked', () => {
      // None of the currently-registered UI functions route their OWN top-level `req` through
      // instrumentType EPLC_ACCEPTANCE/movementType CREATE (A6 is IPLC_ACCEPTANCE; B4's Usance branch
      // builds its EPLC_ACCEPTANCE leg on a SEPARATE sub-request, not `req` itself) — this exercises
      // submit()'s own generic `model.instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE'`
      // branch directly via component state, same as the task brief's "set fields directly" guidance.
      const { comp, api } = setupC();
      comp.selectedFunction = null;
      comp.model = { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'CREATE', amount: '1000', currency: 'USD', createdBy: 'maker1', eventSeq: 7 };
      comp.naturalKey = { lcNumber: 'LC001', ibNumber: 'IB01', sgNumber: '' };
      comp.selectedParent = makeContractC({ logicalContractId: 'lgl-parent-1' });
      comp.exposureNature = 'ACTUAL';

      comp.submit();

      const req = lastReqC(api);
      expect(req.parentLogicalContractId).toBe('lgl-parent-1');
      expect(req.exposureNature).toBe('ACTUAL');
    });

    it('A9 (locked to Full Redeem): submits FULL_REDEEM when the (locked) amount equals Available Balance', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A9);
      comp.selectedContract = makeContractC({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      comp.selectedContractSnapshot = makeSnapshotC({ availableBalance: '500' });
      comp.model.amount = '500';

      comp.submit();

      expect(lastReqC(api).movementType).toBe('FULL_REDEEM');
    });

    it('A9 (locked to Full Redeem, BA-confirmed 2026-08-21): rejects rather than deriving PARTIAL_REDEEM when amount is below Available Balance — the Amount field is disabled in the real UI (builder-fields.ts amountFromSgRedeem); this exercises submit-rules.ts\'s own defense-in-depth backstop for a caller that bypasses it', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A9);
      comp.selectedContract = makeContractC({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } });
      comp.selectedContractSnapshot = makeSnapshotC({ availableBalance: '500' });
      comp.model.amount = '300';

      comp.submit();

      expect(comp.submitError).toBe('A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (500) — Partial Redeem is no longer supported here.');
      expect(api.createMovement).not.toHaveBeenCalled();
    });

    it('A6 (settlesDocumentArrival, plain): submit only creates the Acceptance and never releases anything — LC Balance stays untouched', () => {
      const { comp, api } = setupC();
      triggerSelectFunction(comp, A6);
      comp.naturalKey.lcNumber = 'LC001';
      comp.naturalKey.ibNumber = 'IB01';
      comp.model.amount = '1000';
      comp.model.tenorType = 'SELLERS_USANCE';
      comp.model.tenorDays = 60;
      comp.pickerSelection.selectedPayMovement = makeMovementC({ movementType: 'UTILIZE', sourceTransactionRef: 'IB01', amount: '1000' });

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(lastReqC(api)).toMatchObject({ instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' });
      // The whole point of A6's Maker Submit: no release call touches the Document Arrival / LC Balance.
      expect(api.release).not.toHaveBeenCalled();
      expect(comp.submitResult).toEqual({ movementId: 'mv-new', status: 'PENDING' });
    });
  });

  // ---------------------------------------------------------------------
  // submit() — A3S compound (documentArrivalWithSg)
  // ---------------------------------------------------------------------
  describe('submit() — A3S documentArrivalWithSg compound', () => {
    function primed(comp: MakerPanelComponent) {
      triggerSelectFunction(comp, A3S);
      comp.model.amount = '1000';
      comp.model.secondaryRef = 'IB01';
      comp.selectedContract = makeContractC({ balanceContractId: 'bc-lc' });
      comp.pickerSelection.selectedArrivalSg = makeContractC({
        balanceContractId: 'bc-sg',
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null },
      });
      comp.pickerSelection.arrivalSgSnapshot = makeSnapshotC({ confirmedBalance: '1000' });
    }

    it('creates the SG redemption THEN the Document Arrival, in that order, on full success', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'sg-redeem-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'utilize-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(2);
      expect(lastReqC(api, 0)).toMatchObject({ instrumentType: 'SHGT', balanceContractId: 'bc-sg', movementType: 'FULL_REDEEM', amount: '1000' });
      expect(lastReqC(api, 1)).toMatchObject({ instrumentType: 'IPLC_LC', balanceContractId: 'bc-lc' });
      // Both legs share one businessEventId.
      expect(lastReqC(api, 0).businessEventId).toBe(lastReqC(api, 1).businessEventId);
      expect(comp.compoundLegs.arrivalSgRedeemMovementId).toBe('sg-redeem-1');
      expect(comp.submitResult).toEqual({ movementId: 'utilize-1', status: 'PENDING' });
      expect(comp.submitting).toBe(false);
    });

    // The SG's own FULL_REDEEM/PARTIAL_REDEEM is a real, in-scope contingent account family, but
    // submitResult only ever tracks the second (LC UTILIZE) call — arrivalSgRedeemMovement carries the
    // full first-leg response so its Account Entries button can be offered too.
    it("captures the SG redemption leg's own full response (including its contingentAccountEntry) separately from submitResult", () => {
      const { comp, api } = setupC();
      const sgEntry = {
        drAccount: 'Shipping Guarantees Outstanding',
        crAccount: "Customers' Liability under Shipping Guarantees",
        currency: 'USD',
        amount: '1000',
      };
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'sg-redeem-1', status: 'PENDING', contingentAccountEntry: sgEntry } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'utilize-1', status: 'PENDING', contingentAccountEntry: null } }) as any);
      primed(comp);

      comp.submit();

      expect(comp.compoundLegs.arrivalSgRedeemMovement).toEqual({ movementId: 'sg-redeem-1', status: 'PENDING', contingentAccountEntry: sgEntry });
      expect(comp.submitResult!.contingentAccountEntry).toBeNull();
    });

    it('a failed SG reservation never attempts the Document Arrival call', () => {
      const { comp, api } = setupC();
      api.createMovement.mockReturnValueOnce(apiErrC('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('Could not reserve the Shipping Guarantee redemption: INSUFFICIENT_AVAILABLE_BALANCE');
      expect(comp.submitting).toBe(false);
    });

    // Bug fixed 2026-08-20 (reviewer-reported live, "After the A3S transaction fails with an error, the
    // selected SG becomes unavailable and cannot be selected or reused" — S001/G01+G02 repro): the SG's
    // own reservation is now auto-cancelled (compensating rollback) rather than left orphaned PENDING —
    // compoundLegs.arrivalSgRedeemMovementId stays unset, nothing left for the Checker to act on.
    it('SG reservation succeeds but the Document Arrival fails — auto-cancels the SG reservation (rollback), does NOT keep the SG movementId', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'sg-redeem-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErrC('LEGS_UNBALANCED') as any);
      primed(comp);

      comp.submit();

      expect(api.cancel).toHaveBeenCalledWith('sg-redeem-1', expect.any(String), 'AUTO_ROLLBACK_LC_LEG_FAILED');
      expect(comp.compoundLegs.arrivalSgRedeemMovementId).toBeNull();
      expect(comp.submitError).toBe(
        'Document Arrival failed: LEGS_UNBALANCED. The reserved Shipping Guarantee redemption was automatically cancelled, so its capacity is available again.',
      );
      expect(comp.submitting).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // submit() — B4 Sight/HONOUR compound (createsIssuingBankReceivableOnHonour)
  // ---------------------------------------------------------------------
  describe('submit() — B4 Sight/HONOUR compound', () => {
    function primed(comp: MakerPanelComponent) {
      triggerSelectFunction(comp, B4);
      comp.model.movementType = 'HONOUR';
      comp.model.amount = '2000';
      comp.model.secondaryRef = 'EB01';
      comp.selectedContract = makeContractC({ balanceContractId: 'bc-cnf', instrumentType: 'EPLC_CONFIRMATION', logicalContractId: 'lgl-cnf' });
      comp.pickerSelection.selectedPayMovement = makeMovementC({ movementType: 'CREATE', sourceTransactionRef: 'EB01', amount: '2000' });
    }

    it('creates the Confirmation HONOUR then the Due from Issuing Bank asset', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'honour-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'receivable-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(2);
      expect(lastReqC(api, 0)).toMatchObject({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'HONOUR' });
      expect(lastReqC(api, 1)).toMatchObject({ instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK', movementType: 'CREATE', parentLogicalContractId: 'lgl-cnf' });
      expect(comp.submitResult).toEqual({ movementId: 'honour-1', status: 'PENDING' });
      expect(comp.compoundLegs.dueFromIssuingBankMovementId).toBe('receivable-1');
    });

    it('a failed HONOUR never creates the asset', () => {
      const { comp, api } = setupC();
      api.createMovement.mockReturnValueOnce(apiErrC('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    });

    it('HONOUR succeeds but the asset create fails — surfaces the compound error', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'honour-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErrC('REQUEST_VALIDATION_FAILED') as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe('Confirmation honoured (PENDING), but the Due from Issuing Bank asset failed to record: REQUEST_VALIDATION_FAILED');
    });
  });

  // ---------------------------------------------------------------------
  // submit() — B4 Usance/ACCEPT compound (createsAcceptanceReimbReceivableOnCreate)
  // ---------------------------------------------------------------------
  describe('submit() — B4 Usance/ACCEPT compound', () => {
    function primed(comp: MakerPanelComponent) {
      triggerSelectFunction(comp, B4);
      comp.model.movementType = 'ACCEPT';
      comp.model.amount = '3000';
      comp.model.secondaryRef = 'EB02';
      comp.selectedContract = makeContractC({
        balanceContractId: 'bc-cnf',
        instrumentType: 'EPLC_CONFIRMATION',
        logicalContractId: 'lgl-cnf',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
      });
      comp.pickerSelection.selectedPayMovement = makeMovementC({ movementType: 'ACCEPT', sourceTransactionRef: 'EB02', amount: '3000' });
    }

    it('creates ACCEPT, then the Acceptance liability, then the Reimbursement Receivable asset', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'acceptance-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'receivable-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(3);
      expect(lastReqC(api, 0)).toMatchObject({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'ACCEPT' });
      expect(lastReqC(api, 1)).toMatchObject({
        instrumentType: 'EPLC_ACCEPTANCE',
        movementType: 'CREATE',
        exposureNature: 'ACTUAL',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
      });
      expect(lastReqC(api, 2)).toMatchObject({ instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE', movementType: 'CREATE' });
      expect(comp.submitResult).toEqual({ movementId: 'accept-1', status: 'PENDING' });
      expect(comp.compoundLegs.acceptanceMovementId).toBe('acceptance-1');
      expect(comp.compoundLegs.acceptanceReimbReceivableMovementId).toBe('receivable-1');
    });

    // Same fix and reasoning as the A3S SG-redemption test above, applied to this compound's own
    // second leg (the new EPLC_ACCEPTANCE CREATE) — a real, in-scope contingent account family whose
    // entry was also being silently dropped, same root cause.
    it("captures the Acceptance liability leg's own full response (including its contingentAccountEntry) separately from submitResult", () => {
      const { comp, api } = setupC();
      const acceptanceEntry = {
        drAccount: "Customers' Liability under Acceptances & DPU",
        crAccount: 'Acceptances & DPU Outstanding',
        currency: 'USD',
        amount: '3000',
      };
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING', contingentAccountEntry: null } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'acceptance-1', status: 'PENDING', contingentAccountEntry: acceptanceEntry } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'receivable-1', status: 'PENDING' } }) as any);
      primed(comp);

      comp.submit();

      expect(comp.compoundLegs.acceptanceMovement).toEqual({ movementId: 'acceptance-1', status: 'PENDING', contingentAccountEntry: acceptanceEntry });
      expect(comp.submitResult!.contingentAccountEntry).toBeNull();
    });

    it('a failed ACCEPT never creates the Acceptance', () => {
      const { comp, api } = setupC();
      api.createMovement.mockReturnValueOnce(apiErrC('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(1);
      expect(comp.submitError).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    });

    it('ACCEPT succeeds, Acceptance CREATE fails — surfaces the compound error, no Receivable call', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErrC('REQUEST_VALIDATION_FAILED') as any);
      primed(comp);

      comp.submit();

      expect(api.createMovement).toHaveBeenCalledTimes(2);
      expect(comp.submitError).toBe('Confirmation accepted (PENDING), but the Acceptance liability failed to record: REQUEST_VALIDATION_FAILED');
    });

    it('ACCEPT + Acceptance succeed, Receivable CREATE fails — surfaces the compound error', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'accept-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'acceptance-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErrC('REQUEST_VALIDATION_FAILED') as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe(
        'Confirmation accepted (PENDING) and Acceptance created (PENDING), but the Reimbursement Receivable asset failed to record: REQUEST_VALIDATION_FAILED',
      );
    });
  });

  // ---------------------------------------------------------------------
  // submit() — B5 settlesAcceptanceOnMature compound
  // ---------------------------------------------------------------------
  describe('submit() — B5 settlesAcceptanceOnMature compound', () => {
    function primed(comp: MakerPanelComponent) {
      triggerSelectFunction(comp, B5);
      comp.model.amount = '500';
      comp.selectedContract = makeContractC({
        balanceContractId: 'bc-accept',
        instrumentType: 'EPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null },
      });
      comp.selectedContractSnapshot = makeSnapshotC({ availableBalance: '500' });
    }

    it('settles the Acceptance then resolves and reimburses the matching Receivable', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'settle-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(of({ body: { movementId: 'reimb-1', status: 'PENDING' } }) as any);
      api.resolveContract.mockReturnValueOnce(
        of(makeContractC({ balanceContractId: 'bc-receivable', instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE' })) as any,
      );
      primed(comp);

      comp.submit();

      expect(lastReqC(api, 0)).toMatchObject({ instrumentType: 'EPLC_ACCEPTANCE', balanceContractId: 'bc-accept', movementType: 'FULL_SETTLE' });
      expect(api.resolveContract).toHaveBeenCalledWith('EPLC_ACCEPTANCE_REIMB_RECEIVABLE', { lcNumber: 'LC001', ibNumber: 'EB01' });
      expect(lastReqC(api, 1)).toMatchObject({
        instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
        balanceContractId: 'bc-receivable',
        movementType: 'REIMBURSE',
      });
      expect(comp.submitResult).toEqual({ movementId: 'settle-1', status: 'PENDING' });
      expect(comp.compoundLegs.matchedReceivableMovementId).toBe('reimb-1');
    });

    it('a failed Acceptance settle never resolves the Receivable', () => {
      const { comp, api } = setupC();
      api.createMovement.mockReturnValueOnce(apiErrC('INSUFFICIENT_AVAILABLE_BALANCE') as any);
      primed(comp);

      comp.submit();

      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(comp.submitError).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    });

    it('settle succeeds but resolveContract fails — surfaces the compound error', () => {
      const { comp, api } = setupC();
      api.createMovement.mockReturnValueOnce(of({ body: { movementId: 'settle-1', status: 'PENDING' } }) as any);
      api.resolveContract.mockReturnValueOnce(apiErrC('NOT_FOUND') as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe('Acceptance settled (PENDING), but its matching Reimbursement Receivable could not be found: NOT_FOUND');
    });

    it('settle + resolve succeed but the Receivable createMovement fails — surfaces the compound error', () => {
      const { comp, api } = setupC();
      api.createMovement
        .mockReturnValueOnce(of({ body: { movementId: 'settle-1', status: 'PENDING' } }) as any)
        .mockReturnValueOnce(apiErrC('REQUEST_VALIDATION_FAILED') as any);
      api.resolveContract.mockReturnValueOnce(of(makeContractC({ balanceContractId: 'bc-receivable' })) as any);
      primed(comp);

      comp.submit();

      expect(comp.submitError).toBe('Acceptance settled (PENDING), but the matching Reimbursement Receivable failed to record: REQUEST_VALIDATION_FAILED');
    });
  });

  // =========================================================================
  // Group D — from transaction-builder.component.gaps.spec.ts (the Maker-owned coverage-gap tests: ~30
  // plain `get` accessors, catalog/parent/IB-Index paging+filtering getters, arrivalSgRedeem* getters,
  // context/natural-key getters, error-callback branches inside onSelectContract's helper chain,
  // afterResolved()'s amount-default branches, rebuildFields()'s own Formly `expressions` callbacks, and
  // a handful of ??/|| fallback branches). The two genuinely Checker/parent-owned tests this origin file
  // also carried (isCheckerCompoundOwnSubmission's own getter-coverage test, and checkerAct()'s
  // describeApiError fallback branch) stayed in transaction-builder.component.gaps.spec.ts.
  // =========================================================================

  function fn(code: string): TransactionFunction {
    const found = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === code);
    if (!found) throw new Error(`No TransactionFunction with code "${code}" in the registry`);
    return found;
  }

  function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
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

  function snapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
    return {
      balanceContractId: 'bc-1',
      logicalContractId: 'lc-1',
      currency: 'USD',
      confirmedBalance: '100000',
      availableBalance: '80000',
      pendingEarmarkTotal: '20000',
      ...overrides,
    };
  }

  function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
    return {
      movementId: 'mv-1',
      balanceContractId: 'bc-1',
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

  function mockApiD(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
    return {
      createMovement: jest.fn(),
      release: jest.fn(),
      reject: jest.fn(),
      cancel: jest.fn(),
      acknowledge: jest.fn(),
      resolveContract: jest.fn(() => of(contract())),
      catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
      closeEligible: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 200 })),
      reopenEligible: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 200 })),
      getSnapshot: jest.fn(() => of(snapshot())),
      listMovements: jest.fn(() => of([])),
      ...overrides,
    } as unknown as BalanceComponentApiService;
  }

  describe('plain getters — default/empty state', () => {
    it('isCreatingMovement / requiredNaturalKeyFields / hasParent / parentOptions / toleranceApplicable / ready are all falsy/empty before any function is picked', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.isCreatingMovement).toBe(false);
      expect(c.requiredNaturalKeyFields).toEqual([]);
      expect(c.hasParent).toBe(false);
      expect(c.parentOptions).toEqual([]);
      expect(c.toleranceApplicable).toBe(false);
      expect(c.ready).toBe(false);
      expect(c.usesTwoFieldSearch).toBe(false);
    });

    it('ready becomes true once a fixed-movementType function (A1) is selected, false again after selecting a subChoice function (A2) before the subChoice is picked', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      expect(c.ready).toBe(true);
      expect(c.isCreatingMovement).toBe(true);
      expect(c.hasParent).toBe(false);

      triggerSelectFunction(c, fn('A2'));
      expect(c.ready).toBe(false);
    });

    it('hasParent / parentOptions / requiredNaturalKeyFields for a parented instrument (A6, IPLC_ACCEPTANCE)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      expect(c.hasParent).toBe(true);
      expect(c.parentOptions).toEqual(['IPLC_LC']);
      expect(c.requiredNaturalKeyFields).toEqual(['ibNumber']);
    });

    it('ibNumberLabel reads "IB Number" on the Import side and "EB Number" on the Export side', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.activeFunctionSide = 'IMPORT';
      expect(c.ibNumberLabel).toBe('IB Number');
      c.activeFunctionSide = 'EXPORT';
      expect(c.ibNumberLabel).toBe('EB Number');
    });

    it('toleranceApplicable is true for A1 (IPLC_LC ISSUE) and false for A8 (SHGT ISSUE, ISSUE-string collision case)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      expect(c.toleranceApplicable).toBe(true);

      const c2 = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c2, fn('A8'));
      expect(c2.toleranceApplicable).toBe(false);
    });

    it('currencyDecimalPlaces / amountDecimalMismatch follow the typed Currency (JPY 0dp) and Amount', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.currencyDecimalPlaces).toBe(2); // no currency typed yet -> default fallback
      expect(c.amountDecimalMismatch).toBe(false); // no amount typed yet -> never a false-positive warning

      c.model.currency = 'JPY';
      expect(c.currencyDecimalPlaces).toBe(0);

      c.model.amount = '10000';
      expect(c.amountDecimalMismatch).toBe(false);

      c.model.amount = '10000.5';
      expect(c.amountDecimalMismatch).toBe(true);

      c.model.currency = 'USD';
      expect(c.currencyDecimalPlaces).toBe(2);
      expect(c.amountDecimalMismatch).toBe(false); // "10000.5" is within USD's own 2dp
    });
  });

  describe('formLocked / displayFields — UX improvement 2026-08-17, "fields become read-only once Submit succeeds"', () => {
    it('formLocked is false and displayFields === fields (same reference, no read-only wrapping) before any Submit', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      expect(c.formLocked).toBe(false);
      expect(c.displayFields).toBe(c.fields);
    });

    it('formLocked stays false, and displayFields stays editable, after a validation-only failure (submitError set, submitResult still null)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      c.submitError = 'Amount is required.';
      expect(c.formLocked).toBe(false);
      expect(c.displayFields).toBe(c.fields);
    });

    it('formLocked becomes true once submitResult is set (a real movement was created), and displayFields is a read-only-decorated copy — every field disabled, expressions stripped', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      c.submitResult = movement({ movementId: 'mv-new', status: 'PENDING' });
      expect(c.formLocked).toBe(true);
      expect(c.displayFields).not.toBe(c.fields);
      expect(c.displayFields.length).toBe(c.fields.length);
      for (const f of c.displayFields) {
        expect(f.props?.disabled).toBe(true);
        expect(f.expressions).toBeUndefined();
      }
    });

    it('formLocked resets to false, and displayFields becomes editable again, once resetForFunction() moves to a different function', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      c.submitResult = movement({ movementId: 'mv-new', status: 'PENDING' });
      expect(c.formLocked).toBe(true);

      triggerSelectFunction(c, fn('A2'));
      // A2 is subject to the pre-Submit eligibility gate too, so displayFields needs a selectedContract
      // here to isolate this test's own concern (formLocked resetting on a function switch) from that
      // separate gate — see the "requiresEligibleTarget / hasEligibleTargetSelected / fieldsLocked"
      // describe block below for that gate's own coverage.
      c.selectedContract = contract();
      expect(c.formLocked).toBe(false);
      expect(c.displayFields).toBe(c.fields);
    });

    it('formLocked stays true on a partial compound-submit failure that still populated submitResult from the primary leg', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      c.submitResult = movement({ movementId: 'mv-primary', status: 'PENDING' });
      c.submitError = 'The secondary leg failed to post.';
      expect(c.formLocked).toBe(true);
      expect(c.displayFields).not.toBe(c.fields);
    });
  });

  describe('requiresEligibleTarget / hasEligibleTargetSelected / fieldsLocked / noEligibleRecordsMessage — business requirement 2026-08-19 ("A2–A9 / B2–B5 — No Eligible Records")', () => {
    it('A1 (exempt) — requiresEligibleTarget false, fieldsLocked false, no message, regardless of picker state', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      c.catalogPicker.total = 0;
      expect(c.requiresEligibleTarget).toBe(false);
      expect(c.hasEligibleTargetSelected).toBe(true);
      expect(c.fieldsLocked).toBe(false);
      expect(c.displayFields).toBe(c.fields);
      expect(c.noEligibleRecordsMessage).toBeNull();
    });

    it('A2 (flat Catalog) with zero eligible candidates — requiresEligibleTarget true, fields locked, "No eligible records" message', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A2'));
      c.catalogPicker.total = 0;
      expect(c.requiresEligibleTarget).toBe(true);
      expect(c.hasEligibleTargetSelected).toBe(false);
      expect(c.fieldsLocked).toBe(true);
      expect(c.displayFields).not.toBe(c.fields);
      expect(c.eligibleCandidateCount).toBe(0);
      expect(c.noEligibleRecordsMessage).toBe('No eligible records available for this transaction.');
    });

    it('A2 (flat Catalog) with candidates available but none picked yet — locked, softer "pick one" message', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A2'));
      c.catalogPicker.total = 3;
      expect(c.fieldsLocked).toBe(true);
      expect(c.eligibleCandidateCount).toBe(3);
      expect(c.noEligibleRecordsMessage).toBe('Pick an eligible record from the list below to continue.');
    });

    it('A2 (flat Catalog) once a contract is picked — unlocked, no message', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A2'));
      c.catalogPicker.total = 3;
      c.selectedContract = contract();
      expect(c.hasEligibleTargetSelected).toBe(true);
      expect(c.fieldsLocked).toBe(false);
      expect(c.displayFields).toBe(c.fields);
      expect(c.noEligibleRecordsMessage).toBeNull();
    });

    it('A6 (hasParent) reads eligibleCandidateCount off parentPicker.total, not catalogPicker.total', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.catalogPicker.total = 99; // must be ignored for a hasParent function
      c.parentPicker.total = 0;
      expect(c.eligibleCandidateCount).toBe(0);
      expect(c.noEligibleRecordsMessage).toBe('No eligible records available for this transaction.');
    });

    it('formLocked (post-Submit) still locks fields even once an eligible target is selected', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A2'));
      c.selectedContract = contract();
      c.submitResult = movement({ movementId: 'mv-new', status: 'PENDING' });
      expect(c.hasEligibleTargetSelected).toBe(true);
      expect(c.formLocked).toBe(true);
      expect(c.fieldsLocked).toBe(true);
      expect(c.noEligibleRecordsMessage).toBeNull(); // formLocked is a different lock reason, not "no target"
    });

    // Reviewer-reported 2026-08-26 ("A35 A7 先出現 ⚠ No eligible records... 再出現交易" / "如果有交易 ⚠ No
    // eligible records... 訊息不應該出現") — catalogPicker/parentPicker.total both start at 0 the instant
    // load() resets paging, before the HTTP round trip resolves; noEligibleRecordsMessage must suppress
    // its own text entirely while the relevant picker is still loading, not read the (still-stale) count.
    it('A2 (flat Catalog) suppresses the message entirely while catalogPicker is still loading, even though total currently reads 0', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A2'));
      c.catalogPicker.total = 0;
      c.catalogPicker.loading = true;
      expect(c.eligiblePickersLoading).toBe(true);
      expect(c.noEligibleRecordsMessage).toBeNull();
    });

    it('A2 (flat Catalog) shows the real message again once catalogPicker finishes loading', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A2'));
      c.catalogPicker.total = 0;
      c.catalogPicker.loading = false;
      expect(c.noEligibleRecordsMessage).toBe('No eligible records available for this transaction.');
    });

    it('A6 (hasParent) suppresses the message while parentPicker is still loading, ignoring catalogPicker.loading entirely', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.parentPicker.total = 0;
      c.parentPicker.loading = true;
      c.catalogPicker.loading = false; // must not matter for a hasParent function
      expect(c.eligiblePickersLoading).toBe(true);
      expect(c.noEligibleRecordsMessage).toBeNull();
    });

    it('A6 (hasParent) shows the real message again once parentPicker finishes loading', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.parentPicker.total = 0;
      c.parentPicker.loading = false;
      expect(c.eligiblePickersLoading).toBe(false);
      expect(c.noEligibleRecordsMessage).toBe('No eligible records available for this transaction.');
    });
  });

  describe('flattenedPayableRows, catalog/parent paging + filtering getters', () => {
    it('flattenedPayableRows is empty with no catalog contracts, and builds/sorts rows by LC Number then IB reference when populated', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A4'));
      expect(c.flattenedPayableRows).toEqual([]);

      c.catalogPicker.contracts = [
        contract({ balanceContractId: 'b', naturalKey: { lcNumber: 'B001' } }),
        contract({ balanceContractId: 'a', naturalKey: { lcNumber: 'A001' } }),
      ];
      c.documentArrivalHints.catalogPayableMovements.set('b', [movement({ movementId: 'm-b2', sourceTransactionRef: 'IB02' })]);
      c.documentArrivalHints.catalogPayableMovements.set('a', [
        movement({ movementId: 'm-a2', sourceTransactionRef: 'IB02' }),
        movement({ movementId: 'm-a1', sourceTransactionRef: 'IB01' }),
      ]);
      // filteredCatalogContracts (which flattenedPayableRows windows via pagedFilteredCatalogContracts)
      // requires a catalogPayableIbs entry too — always populated alongside catalogPayableMovements in
      // real usage (loadDocumentArrivalHints()), so both need setting here.
      c.documentArrivalHints.catalogPayableIbs.set('b', ['IB02']);
      c.documentArrivalHints.catalogPayableIbs.set('a', ['IB02', 'IB01']);
      const rows = c.flattenedPayableRows;
      expect(rows.map((r) => r.movement.movementId)).toEqual(['m-a1', 'm-a2', 'm-b2']);
    });

    it('catalogPicker.totalPages / parentPicker.totalPages are always at least 1', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.catalogPicker.totalPages).toBe(1);
      expect(c.parentPicker.totalPages).toBe(1);
      // Display page size is 5 for every picker CatalogPickerService backs.
      c.catalogPicker.total = 13;
      expect(c.catalogPicker.totalPages).toBe(3);
      c.parentPicker.total = 21;
      expect(c.parentPicker.totalPages).toBe(5);
    });

    it('filteredCatalogContracts: no tenor filter / no movementType -> passthrough', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.catalogPicker.contracts = [contract()];
      expect(c.filteredCatalogContracts).toEqual([contract()]);
    });

    it('filteredCatalogContracts: payExistingUtilize (A4) is eligibility-driven — keeps a 0-balance candidate WITH an outstanding Document Arrival, excludes one without (business requirement 2026-08-19, "A4/A6 — LC Index Eligibility Criteria")', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A4'));
      c.catalogPicker.contracts = [
        contract({ balanceContractId: 'eligible', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'ineligible', tenorType: 'SIGHT' }),
      ];
      (c as any).catalogPicker.snapshots.set('eligible', snapshot({ availableBalance: '0' }));
      c.documentArrivalHints.catalogPayableIbs.set('eligible', ['IB01']);
      // 'ineligible' has no catalogPayableIbs entry at all — no outstanding Document Arrival of its own.
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['eligible']);
    });

    it('filteredCatalogContracts: a decreasing movementType (A3) excludes 0-available contracts but keeps ones with no snapshot yet', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A3'));
      c.catalogPicker.contracts = [
        contract({ balanceContractId: 'zero' }),
        contract({ balanceContractId: 'nonzero' }),
        contract({ balanceContractId: 'unknown' }),
      ];
      (c as any).catalogPicker.snapshots.set('zero', snapshot({ availableBalance: '0' }));
      (c as any).catalogPicker.snapshots.set('nonzero', snapshot({ availableBalance: '500' }));
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId).sort()).toEqual(['nonzero', 'unknown'].sort());
    });

    it('filteredCatalogContracts: tenorFilter excludes the opposite tenor family but keeps contracts with no tenorType recorded', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A4')); // catalogTenorFilter: 'SIGHT'
      c.catalogPicker.contracts = [
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'usance', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'legacy' }),
      ];
      // Both surviving candidates still need a catalogPayableIbs entry to pass A4's eligibility filter —
      // 'usance' is excluded by the tenor filter regardless, so it deliberately gets none.
      c.documentArrivalHints.catalogPayableIbs.set('sight', ['IB01']);
      c.documentArrivalHints.catalogPayableIbs.set('legacy', ['IB02']);
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId).sort()).toEqual(['legacy', 'sight'].sort());
    });

    it('filteredCatalogContracts: documentArrivalWithSg (A3S) is SG-Balance-eligibility-driven (business requirement 2026-08-19, "A3S/A9 — LC Index Criteria") — keeps a candidate WITH an outstanding SG Balance, excludes one without, regardless of the LC\'s own Available Balance', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A3S'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'sg-eligible' }), contract({ balanceContractId: 'sg-exhausted' })];
      // The LC's own Available Balance is irrelevant to A3S eligibility now — 'sg-eligible' is 0 here,
      // proving the OLD 0-balance-on-the-LC-itself heuristic is genuinely gone, not just supplemented.
      (c as any).catalogPicker.snapshots.set('sg-eligible', snapshot({ availableBalance: '0' }));
      c.documentArrivalHints.catalogSgEligible.add('sg-eligible');
      // 'sg-exhausted' has no catalogSgEligible entry at all — every child SG is fully redeemed (or none exist).
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['sg-eligible']);
    });

    it('filteredCatalogContracts: Close (A10) is close-eligibility-driven — keeps a candidate the server-computed hint-set includes, excludes one it doesn\'t, regardless of Available Balance', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A10'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'close-eligible' }), contract({ balanceContractId: 'close-ineligible' })];
      (c as any).catalogPicker.snapshots.set('close-eligible', snapshot({ availableBalance: '0' }));
      c.documentArrivalHints.catalogCloseEligible.add('close-eligible');
      // 'close-ineligible' has no catalogCloseEligible entry — SG/Acceptance still outstanding, or an open Event.
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['close-eligible']);
    });

    it('reloadCatalog() (A10) also fetches the close-eligible hint-set via ONE aggregate call — not per-candidate like every other hint above', () => {
      const api = mockApiD({
        catalog: jest.fn(() => of({ items: [contract({ balanceContractId: 'c1' }), contract({ balanceContractId: 'c2' })], total: 2, page: 1, pageSize: 10 })),
        closeEligible: jest.fn(() => of({ items: [contract({ balanceContractId: 'c1' })], total: 1, page: 1, pageSize: 200 })),
      });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A10'));

      expect(api.closeEligible).toHaveBeenCalledTimes(1);
      expect(api.closeEligible).toHaveBeenCalledWith('IPLC_LC');
      expect(c.documentArrivalHints.catalogCloseEligible).toEqual(new Set(['c1']));
    });

    it('onSelectContract (A10) auto-fills model.amount from the snapshot\'s Confirmed Balance, not Available Balance, once resolved', () => {
      const api = mockApiD({ getSnapshot: jest.fn(() => of(snapshot({ confirmedBalance: '7000', availableBalance: '9000' }))) });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A10'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'c1' })];

      c.onSelectContract('c1');

      expect(c.model.amount).toBe('7000');
    });

    it('F1: filteredCatalogContracts for A11 (Reopen) is reopen-eligibility-driven — keeps a candidate the server-computed hint-set includes, excludes one it doesn\'t', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A11'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'reopen-eligible' }), contract({ balanceContractId: 'reopen-ineligible' })];
      c.documentArrivalHints.catalogReopenEligible.add('reopen-eligible');
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['reopen-eligible']);
    });

    it('F1: reloadCatalog() (A11) queries the CLOSED status (not the default ACTIVE) and fetches the reopen-eligible hint-set via ONE aggregate call', () => {
      const api = mockApiD({
        catalog: jest.fn(() => of({ items: [contract({ balanceContractId: 'c1', status: 'CLOSED' })], total: 1, page: 1, pageSize: 10 })),
        reopenEligible: jest.fn(() => of({ items: [contract({ balanceContractId: 'c1' })], total: 1, page: 1, pageSize: 200 })),
      });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A11'));

      expect(api.catalog).toHaveBeenCalledWith('IPLC_LC', 'CLOSED', undefined, 1, c.catalogPageSize, undefined, undefined, true);
      expect(api.reopenEligible).toHaveBeenCalledTimes(1);
      expect(api.reopenEligible).toHaveBeenCalledWith('IPLC_LC');
      expect(c.documentArrivalHints.catalogReopenEligible).toEqual(new Set(['c1']));
    });

    it('F1: A10 (Close) still queries the default ACTIVE status — the CLOSED override applies only to A11/B7\'s own requiresReopenEligibility', () => {
      const api = mockApiD({ catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })) });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A10'));

      expect(api.catalog).toHaveBeenCalledWith('IPLC_LC', 'ACTIVE', undefined, 1, c.catalogPageSize, undefined, undefined, true);
    });

    it('F1: onSelectContract (A11) locks model.amount to the fixed literal \'0\' immediately, with no snapshot fetch needed — unlike A10\'s own Confirmed-Balance-derived amount above', () => {
      const api = mockApiD({ getSnapshot: jest.fn(() => of(snapshot({ confirmedBalance: '0', availableBalance: '0' }))) });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A11'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'c1', status: 'CLOSED' })];

      c.onSelectContract('c1');

      expect(c.model.amount).toBe('0');
    });

    it('parentTenorFamily: undefined with no function, USANCE when tenorTypeOptions is set (A6), USANCE when catalogTenorFilter is USANCE (A7)', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.parentTenorFamily).toBeUndefined();
      triggerSelectFunction(c, fn('A6'));
      expect(c.parentTenorFamily).toBe('USANCE');
      const c2 = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c2, fn('A7'));
      expect(c2.parentTenorFamily).toBe('USANCE');
    });

    it('filteredParentCatalog: tenorTypeOptions functions (A6) require an exact tenor match, exclude legacy/Sight, AND (business requirement 2026-08-19) require an outstanding Document Arrival of their own', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.model.tenorType = 'BUYERS_USANCE';
      c.parentPicker.contracts = [
        contract({ balanceContractId: 'match', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'other-tenor', tenorType: 'SELLERS_USANCE' }),
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'legacy' }),
        contract({ balanceContractId: 'match-but-ineligible', tenorType: 'BUYERS_USANCE' }),
      ];
      // Only 'match' has an outstanding Document Arrival of its own — 'match-but-ineligible' would
      // otherwise pass the tenor check too, but has no parentPayableIbs entry.
      c.documentArrivalHints.parentPayableIbs.set('match', ['IB01']);
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['match']);
    });

    it('filteredParentCatalog: settlesDocumentArrival (A6) is eligibility-driven (business requirement 2026-08-19, "A6 — LC Index Eligibility Criteria") — supersedes the old 2026-08-18 0-balance-bypass-only fix, now requires a real parentPayableIbs entry too', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.model.tenorType = 'BUYERS_USANCE';
      c.parentPicker.contracts = [contract({ balanceContractId: 'fully-earmarked', tenorType: 'BUYERS_USANCE' })];
      (c as any).parentPicker.snapshots.set('fully-earmarked', snapshot({ availableBalance: '0' }));
      c.documentArrivalHints.parentPayableIbs.set('fully-earmarked', ['IB01']);
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['fully-earmarked']);
    });

    it('filteredParentCatalog: settlesDocumentArrival (A6) excludes an otherwise-eligible-by-tenor LC that has no outstanding Document Arrival of its own', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.model.tenorType = 'BUYERS_USANCE';
      c.parentPicker.contracts = [contract({ balanceContractId: 'no-arrival', tenorType: 'BUYERS_USANCE' })];
      expect(c.filteredParentCatalog).toEqual([]);
    });

    it('filteredParentCatalog: amountVsAvailableDerivation REDEEM (A9) is SG-Balance-eligibility-driven (business requirement 2026-08-19, "A3S/A9 — LC Index Criteria") — keeps a candidate WITH an outstanding SG Balance, excludes one without, regardless of the LC\'s own Available Balance', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A9'));
      c.parentPicker.contracts = [contract({ balanceContractId: 'sg-eligible' }), contract({ balanceContractId: 'sg-exhausted' })];
      (c as any).parentPicker.snapshots.set('sg-eligible', snapshot({ availableBalance: '0' }));
      c.documentArrivalHints.parentSgEligible.add('sg-eligible');
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['sg-eligible']);
    });

    it('filteredParentCatalog: catalogTenorFilter USANCE (B5) excludes only Sight, keeps legacy, and skips the 0-balance filter', () => {
      // B5 shares A7's own catalogTenorFilter: 'USANCE', but (unlike A7 since 2026-08-25) has no
      // requiresEligibleParentAcceptance gate of its own, so it still demonstrates the plain
      // catalogTenorFilter-driven unconditional pass-through this getter falls back to.
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('B5'));
      c.parentPicker.contracts = [
        contract({ balanceContractId: 'usance', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'legacy' }),
      ];
      (c as any).parentPicker.snapshots.set('usance', snapshot({ availableBalance: '0' }));
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId).sort()).toEqual(['legacy', 'usance'].sort());
    });

    it('filteredParentCatalog: requiresEligibleParentAcceptance (A7, 2026-08-25) is Acceptance-Balance-eligibility-driven — keeps a candidate WITH an outstanding Acceptance Balance, excludes one without, regardless of the LC\'s own Available Balance', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A7'));
      c.parentPicker.contracts = [
        contract({ balanceContractId: 'acceptance-eligible', tenorType: 'BUYERS_USANCE' }),
        contract({ balanceContractId: 'acceptance-exhausted', tenorType: 'BUYERS_USANCE' }),
      ];
      (c as any).parentPicker.snapshots.set('acceptance-eligible', snapshot({ availableBalance: '0' }));
      c.documentArrivalHints.parentAcceptanceEligible.add('acceptance-eligible');
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['acceptance-eligible']);
    });

    it('filteredParentCatalog: no tenor flags at all (A8) applies only the 0-balance filter', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A8'));
      c.parentPicker.contracts = [contract({ balanceContractId: 'zero' }), contract({ balanceContractId: 'nonzero' })];
      (c as any).parentPicker.snapshots.set('zero', snapshot({ availableBalance: '0' }));
      (c as any).parentPicker.snapshots.set('nonzero', snapshot({ availableBalance: '500' }));
      expect(c.filteredParentCatalog.map((x) => x.balanceContractId)).toEqual(['nonzero']);
    });
  });

  describe('filteredPayableMovements / catalogPendingHint / displayStatus', () => {
    it('filteredPayableMovements passes through with no search text and filters by sourceTransactionRef case-insensitively', () => {
      const c = new MakerPanelComponent(mockApiD());
      const m1 = movement({ movementId: '1', sourceTransactionRef: 'IB01' });
      const m2 = movement({ movementId: '2', sourceTransactionRef: 'IB02' });
      c.pickerSelection.payableMovements = [m1, m2];
      expect(c.pickerSelection.filteredPayableMovements.length).toBe(2);
      c.pickerSelection.payableMovementSearch = 'ib01';
      expect(c.pickerSelection.filteredPayableMovements).toEqual([m1]);
    });

    it('filteredPayableMovements: a movement missing sourceTransactionRef falls back to "" for the search comparison instead of crashing', () => {
      const c = new MakerPanelComponent(mockApiD());
      const m2 = movement({ movementId: '2', sourceTransactionRef: 'IB02' });
      c.pickerSelection.payableMovements = [movement({ movementId: '1', sourceTransactionRef: null }), m2];
      c.pickerSelection.payableMovementSearch = 'ib';
      expect(c.pickerSelection.filteredPayableMovements).toEqual([m2]);
    });

    it('catalogPendingHint returns "" outside payExistingUtilize, or with no/zero pending, and formats single vs multiple pending with thousands separators', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.catalogPendingHint(contract())).toBe('');

      triggerSelectFunction(c, fn('A4'));
      expect(c.catalogPendingHint(contract({ balanceContractId: 'no-snap' }))).toBe('');

      (c as any).catalogPicker.snapshots.set('zero', snapshot({ pendingEarmarkTotal: '0' }));
      expect(c.catalogPendingHint(contract({ balanceContractId: 'zero' }))).toBe('');

      (c as any).catalogPicker.snapshots.set('one', snapshot({ pendingEarmarkTotal: '-1234567.89' }));
      (c as any).documentArrivalHints.catalogPayableIbs.set('one', ['IB01']);
      expect(c.catalogPendingHint(contract({ balanceContractId: 'one' }))).toBe(' — Pending: 1,234,567.89');

      (c as any).catalogPicker.snapshots.set('many', snapshot({ pendingEarmarkTotal: '-5000' }));
      (c as any).documentArrivalHints.catalogPayableIbs.set('many', ['IB01', 'IB02']);
      expect(c.catalogPendingHint(contract({ balanceContractId: 'many' }))).toBe(' — Total Pending: 5,000');
    });

    it('displayStatus relabels RELEASED to APPROVED by default and passes every other status through unchanged', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.displayStatus('RELEASED')).toBe('APPROVED');
      expect(c.displayStatus('RELEASED', 'IPLC_LC', 'ISSUE')).toBe('APPROVED');
      expect(c.displayStatus('PENDING')).toBe('PENDING');
      expect(c.displayStatus('REJECTED')).toBe('REJECTED');
    });

    it('displayStatus relabels RELEASED to EARMARKED and PENDING to EARMARKING specifically for Import Document Arrival (IPLC_LC/UTILIZE) and Export Present Docs (EPLC_EXAMINATION/CREATE)', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.displayStatus('RELEASED', 'IPLC_LC', 'UTILIZE')).toBe('EARMARKED');
      expect(c.displayStatus('RELEASED', 'EPLC_EXAMINATION', 'CREATE')).toBe('EARMARKED');
      expect(c.displayStatus('PENDING', 'IPLC_LC', 'UTILIZE')).toBe('EARMARKING');
      expect(c.displayStatus('PENDING', 'EPLC_EXAMINATION', 'CREATE')).toBe('EARMARKING');
    });
  });

  describe('arrivalSgRedeem* getters (A3S)', () => {
    it('are all null with no SG snapshot loaded', () => {
      const c = new MakerPanelComponent(mockApiD());
      expect(c.arrivalSgRedeemAmount).toBeNull();
      expect(c.arrivalSgRedeemType).toBeNull();
      expect(c.arrivalSgRemaining).toBeNull();
    });

    it('are null when a snapshot is loaded but Bill Amount is blank, zero, negative, or non-numeric', () => {
      const c = new MakerPanelComponent(mockApiD());
      (c as any).pickerSelection.arrivalSgSnapshot = snapshot({ confirmedBalance: '1000' });
      for (const bad of ['', '0', '-5', 'abc']) {
        c.model.amount = bad;
        expect(c.arrivalSgRedeemAmount).toBeNull();
      }
    });

    it('computes MIN(Bill Amount, SG outstanding), FULL_REDEEM when it fully covers, and the correct remaining balance', () => {
      const c = new MakerPanelComponent(mockApiD());
      (c as any).pickerSelection.arrivalSgSnapshot = snapshot({ confirmedBalance: '1000' });

      c.model.amount = '400';
      expect(c.arrivalSgRedeemAmount).toBe('400');
      expect(c.arrivalSgRedeemType).toBe('PARTIAL_REDEEM');
      expect(c.arrivalSgRemaining).toBe('600');

      c.model.amount = '5000';
      expect(c.arrivalSgRedeemAmount).toBe('1000');
      expect(c.arrivalSgRedeemType).toBe('FULL_REDEEM');
      expect(c.arrivalSgRemaining).toBe('0');
    });
  });

  describe('tightAvailableBalanceForWarning (business instruction 2026-08-20, "A35 可以使用SG交易的金額")', () => {
    it('is null when the contract has no tightAvailableBalance at all', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: null });
      expect(c.tightAvailableBalanceForWarning).toBeNull();
    });

    it('returns the plain tightAvailableBalance for a plain A3 (not documentArrivalWithSg)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A3'));
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: '24' });
      (c as any).pickerSelection.arrivalSgSnapshot = snapshot({ confirmedBalance: '10' });
      expect(c.tightAvailableBalanceForWarning).toBe('24');
    });

    it('returns the plain tightAvailableBalance for A35 before an SG is picked (no arrivalSgSnapshot yet)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A3S'));
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: '24' });
      expect(c.tightAvailableBalanceForWarning).toBe('24');
    });

    it('widens by the selected SG\'s own Outstanding for A35 — the S01/G01 live-reproduced case (Tight 24 + SG 10 = 34)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A3S'));
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: '24' });
      (c as any).pickerSelection.arrivalSgSnapshot = snapshot({ confirmedBalance: '10' });
      expect(c.tightAvailableBalanceForWarning).toBe('34');
    });

    it('returns the plain tightAvailableBalance for B4 before a presentation is picked (no selectedPayMovement yet)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'HONOUR';
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: '0' });
      expect(c.tightAvailableBalanceForWarning).toBe('0');
    });

    it('widens by the referenced B3 presentation\'s own ceilingAmount for B4 HONOUR (Tight 0 + 10000 = 10000)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'HONOUR';
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: '0' });
      (c as any).pickerSelection.selectedPayMovement = mkMovement('b3-1', { ceilingAmount: '10000' });
      expect(c.tightAvailableBalanceForWarning).toBe('10000');
    });

    it('widens the same way for B4 ACCEPT (Usance)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'ACCEPT';
      c.selectedContractSnapshot = snapshot({ tightAvailableBalance: '5000' });
      (c as any).pickerSelection.selectedPayMovement = mkMovement('b3-2', { ceilingAmount: '10000' });
      expect(c.tightAvailableBalanceForWarning).toBe('15000');
    });
  });

  describe('isAmendDecreaseDirection (business instruction 2026-08-20, "A2 Decrease 輸入金額控制規則 B2 Decrease... 都適用")', () => {
    it('is true for A2\'s own genuine AMEND_DECREASE movementType', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND_DECREASE';
      expect(c.isAmendDecreaseDirection).toBe(true);
    });

    it('is false for A2\'s own AMEND_INCREASE', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND_INCREASE';
      expect(c.isAmendDecreaseDirection).toBe(false);
    });

    it('is true for B2\'s own AMEND with amendDirection DECREASE — model.movementType is always \'AMEND\', never a distinct decrease movementType', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND';
      c.amendDirection = 'DECREASE';
      expect(c.isAmendDecreaseDirection).toBe(true);
    });

    it('is false for B2\'s own AMEND with amendDirection INCREASE', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND';
      c.amendDirection = 'INCREASE';
      expect(c.isAmendDecreaseDirection).toBe(false);
    });

    it('is false for a plain AMEND with no amendDirection set yet (B2 before the sub-choice is picked)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND';
      c.amendDirection = null;
      expect(c.isAmendDecreaseDirection).toBe(false);
    });

    it('is false for an unrelated movementType (e.g. UTILIZE)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'UTILIZE';
      expect(c.isAmendDecreaseDirection).toBe(false);
    });
  });

  describe('checksAgainstPlainAvailable (bug found live 2026-08-20 — "B3 20000" against an LC already fully earmarked showed no warning at all)', () => {
    it('is true for UTILIZE/HONOUR/ACCEPT (DECREASING_MOVEMENT_TYPES) — these have a genuine plain-Available tier', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'UTILIZE';
      expect(c.checksAgainstPlainAvailable).toBe(true);
      c.model.movementType = 'HONOUR';
      expect(c.checksAgainstPlainAvailable).toBe(true);
      c.model.movementType = 'ACCEPT';
      expect(c.checksAgainstPlainAvailable).toBe(true);
    });

    it('is true for AMEND_DECREASE / B2\'s own Decrease direction', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND_DECREASE';
      expect(c.checksAgainstPlainAvailable).toBe(true);
    });

    it('is false for CREATE (B3) and ISSUE (A8) — no separate plain-Available tier server-side', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'CREATE';
      c.selectedContract = contract({ instrumentType: 'EPLC_CONFIRMATION' });
      expect(c.checksAgainstPlainAvailable).toBe(false);

      c.model.movementType = 'ISSUE';
      c.model.instrumentType = 'SHGT';
      expect(c.checksAgainstPlainAvailable).toBe(false);
    });
  });

  describe('checksAgainstTightAvailable (business instruction 2026-08-20, "B3金額輸入檢查與B2 Decrease相同 <= Tight Available Balance")', () => {
    it('is true for UTILIZE (A3/A3S)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'UTILIZE';
      expect(c.checksAgainstTightAvailable).toBe(true);
    });

    it('is true for an AMEND_DECREASE (A2)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'AMEND_DECREASE';
      expect(c.checksAgainstTightAvailable).toBe(true);
    });

    it('is true for CREATE against an aliased parent EPLC_CONFIRMATION (B3)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'CREATE';
      c.selectedContract = contract({ instrumentType: 'EPLC_CONFIRMATION' });
      expect(c.checksAgainstTightAvailable).toBe(true);
    });

    it('is false for CREATE against a non-EPLC_CONFIRMATION contract (e.g. A6\'s own IPLC_ACCEPTANCE)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'CREATE';
      c.selectedContract = contract({ instrumentType: 'IPLC_ACCEPTANCE' });
      expect(c.checksAgainstTightAvailable).toBe(false);
    });

    it('is true for ISSUE with hasParent (A8) — false for a root ISSUE with no parent (A1/B1)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'ISSUE';
      c.model.instrumentType = 'SHGT'; // SHGT has a parent (IPLC_LC) — hasParent() reads model.instrumentType
      expect(c.checksAgainstTightAvailable).toBe(true);

      c.model.instrumentType = 'IPLC_LC'; // A1's own root ISSUE — no parent
      expect(c.checksAgainstTightAvailable).toBe(false);
    });

    it('is true for HONOUR (B4 Sight)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'HONOUR';
      expect(c.checksAgainstTightAvailable).toBe(true);
    });

    it('is true for ACCEPT (B4 Usance)', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'ACCEPT';
      expect(c.checksAgainstTightAvailable).toBe(true);
    });

    it('is false for an unrelated movementType/instrumentType combination', () => {
      const c = new MakerPanelComponent(mockApiD());
      c.model.movementType = 'PARTIAL_REDEEM';
      c.selectedContract = contract({ instrumentType: 'SHGT' });
      expect(c.checksAgainstTightAvailable).toBe(false);
    });
  });

  describe('IB Index / context getters', () => {
    it('filteredIbIndexCatalog: passthrough for a non-decreasing movementType, filters 0-balance for a decreasing one', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      c.ibIndexPicker.contracts = [contract({ balanceContractId: 'x' })];
      expect(c.filteredIbIndexCatalog).toEqual(c.ibIndexPicker.contracts);

      const c2 = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c2, fn('A7'));
      c2.model.movementType = 'FULL_SETTLE';
      c2.ibIndexPicker.contracts = [contract({ balanceContractId: 'zero' }), contract({ balanceContractId: 'nonzero' })];
      (c2 as any).ibIndexPicker.snapshots.set('zero', snapshot({ availableBalance: '0' }));
      (c2 as any).ibIndexPicker.snapshots.set('nonzero', snapshot({ availableBalance: '10' }));
      expect(c2.filteredIbIndexCatalog.map((x) => x.balanceContractId)).toEqual(['nonzero']);
    });

    it('lcNumberFromParent / contextLcNumber across every picker shape: parent (A6), freely-typed (A1), two-field search (A7), flat catalog', () => {
      const cParent = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(cParent, fn('A6'));
      cParent.selectedParent = contract({ naturalKey: { lcNumber: 'PARENT01' } });
      expect(cParent.lcNumberFromParent).toBe(true);
      expect(cParent.contextLcNumber).toBe('PARENT01');

      const cTyped = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(cTyped, fn('A1'));
      cTyped.naturalKey.lcNumber = 'TYPED01';
      expect(cTyped.lcNumberFromParent).toBe(false);
      expect(cTyped.contextLcNumber).toBe('TYPED01');
      cTyped.naturalKey.lcNumber = '';
      expect(cTyped.contextLcNumber).toBeNull();

      const cSearch = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(cSearch, fn('A7'));
      cSearch.subChoiceValue = 'FULL_SETTLE';
      cSearch.onSubChoice(); // resolves model.instrumentType/movementType so usesTwoFieldSearch turns true
      cSearch.searchNaturalKey.lcNumber = 'SEARCHED01';
      expect(cSearch.contextLcNumber).toBe('SEARCHED01');
      cSearch.selectedContract = contract({ naturalKey: { lcNumber: 'RESOLVED01' } });
      expect(cSearch.contextLcNumber).toBe('RESOLVED01');

      const cFlat = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(cFlat, fn('A3'));
      expect(cFlat.contextLcNumber).toBeNull();
      cFlat.selectedContract = contract({ naturalKey: { lcNumber: 'FLAT01' } });
      expect(cFlat.contextLcNumber).toBe('FLAT01');
    });

    it('contextSecondaryRef: null with no secondary field, then reads typed/search/resolved values for an ibNumber-bearing function (A7)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      expect(c.contextSecondaryRef).toBeNull();

      const c2 = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c2, fn('A6'));
      c2.naturalKey.ibNumber = 'IB-TYPED';
      expect(c2.contextSecondaryRef).toBe('IB-TYPED');

      const c3 = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c3, fn('A7'));
      c3.subChoiceValue = 'FULL_SETTLE';
      c3.onSubChoice();
      c3.searchNaturalKey.ibNumber = 'IB-SEARCHED';
      expect(c3.contextSecondaryRef).toBe('IB-SEARCHED');
      c3.selectedContract = contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB-RESOLVED' } });
      expect(c3.contextSecondaryRef).toBe('IB-RESOLVED');

      // usesTwoFieldSearch branch, empty searchNaturalKey.ibNumber and no selectedContract resolved yet
      // -> the inner `|| null` fallback, not just the outer `??` one exercised above.
      const c3b = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c3b, fn('A7'));
      c3b.subChoiceValue = 'FULL_SETTLE';
      c3b.onSubChoice();
      c3b.searchNaturalKey.ibNumber = '';
      expect(c3b.contextSecondaryRef).toBeNull();
    });

    it('searchExistingContract (A7, Acceptance Settlement): a resolved Acceptance with 0 Available Balance reports "<IB label> ... nothing left to settle"', () => {
      const foundAcceptance = contract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } });
      const api = mockApiD({
        resolveContract: jest.fn(() => of(foundAcceptance)) as any,
        getSnapshot: jest.fn(() => of(snapshot({ availableBalance: '0' }))) as any,
      });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A7'));
      c.subChoiceValue = 'FULL_SETTLE';
      c.onSubChoice();
      c.searchNaturalKey = { lcNumber: 'S001', ibNumber: 'IB01', sgNumber: '' };
      c.searchExistingContract();
      expect(c.searchError).toBe('IB Number IB01 already has a 0 Available Balance — nothing left to settle.');
      expect(c.selectedContract).toBeNull();

      // Final fallback branch: checkerSecondaryField (function-policy.ts) reads
      // selectedFunction.instrumentType (available immediately on selection), but usesTwoFieldSearch
      // reads model.instrumentType (still unset for a subChoice function like A7 until onSubChoice()
      // resolves it) — so right after resetForFunction(), before onSubChoice(), neither isCreatingMovement
      // nor usesTwoFieldSearch is true yet.
      const c5 = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c5, fn('A7'));
      expect(c5.usesTwoFieldSearch).toBe(false);
      expect(c5.contextSecondaryRef).toBeNull();
      c5.selectedContract = contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB-FALLBACK' } });
      expect(c5.contextSecondaryRef).toBe('IB-FALLBACK');
    });
  });

  describe('remaining small default-value (??/||) branch gaps found in the full combined coverage run', () => {
    it('loadPayableIbHints/flattenedPayableRows: a pending movement missing sourceTransactionRef falls back to the "(no IB Number)" label and empty-string sort key (two same-LC-number rows, to force the sort comparator to actually run)', () => {
      const twoContracts = [
        contract({ balanceContractId: 'bc-1', naturalKey: { lcNumber: 'S001' } }),
        contract({ balanceContractId: 'bc-2', naturalKey: { lcNumber: 'S001' } }),
      ];
      const api = mockApiD({
        catalog: jest.fn(() => of({ items: twoContracts, total: 2, page: 1, pageSize: 10 })) as any,
        listMovements: jest.fn(() => of([{ status: 'PENDING', movementType: 'UTILIZE', acknowledgedAt: '2026-08-20T00:00:00.000Z' }])) as any, // no sourceTransactionRef, on every contract
      });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A4'));
      c.onCatalogSearch();
      expect(c.documentArrivalHints.catalogPayableIbs.get('bc-1')).toEqual(['(no IB Number)']);
      const rows = c.flattenedPayableRows;
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.movement.sourceTransactionRef === undefined)).toBe(true);
    });

    it('flattenedPayableRows: a filtered catalog contract with no entry in catalogPayableMovements contributes zero rows (the Map.get() ?? [] fallback)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A4'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'no-movements' })];
      // catalogPayableMovements deliberately left empty for this contract.
      expect(c.flattenedPayableRows).toEqual([]);
    });

    it('onSelectPayMovement (B4): a picked movement missing sourceTransactionRef falls back to empty-string IB Number / secondaryRef', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('B4')); // settlesDocumentArrival + secondaryRefLabel: 'EB Number'
      c.pickerSelection.payableMovements = [movement({ movementId: 'm-1', amount: '5000', sourceTransactionRef: null })];
      c.onSelectPayMovement('m-1');
      expect(c.naturalKey.ibNumber).toBe('');
      expect(c.model.secondaryRef).toBe('');
      expect(c.model.amount).toBe('5000');
    });

    it("filteredCatalogContracts: the tenorFilter ternary's USANCE side (as opposed to A4's SIGHT side already covered elsewhere)", () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A7')); // catalogTenorFilter: 'USANCE' — exercised directly against the getter,
      // independent of A7's normal two-field-search flow (which never populates catalogPicker.contracts itself).
      c.catalogPicker.contracts = [
        contract({ balanceContractId: 'sight', tenorType: 'SIGHT' }),
        contract({ balanceContractId: 'usance', tenorType: 'BUYERS_USANCE' }),
      ];
      expect(c.filteredCatalogContracts.map((x) => x.balanceContractId)).toEqual(['usance']);
    });

    it('searchExistingContract (B5): a truthy searchNaturalKey.ibNumber is sent as-is, not defaulted to null', () => {
      const resolveContractSpy: jest.Mock = jest.fn(() => throwError(() => ({ error: { message: 'miss' } })));
      const api = mockApiD({ resolveContract: resolveContractSpy as any });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('B5'));
      c.searchNaturalKey = { lcNumber: 'S001', ibNumber: 'IB-PRESENT', sgNumber: '' };
      c.searchExistingContract();
      expect(resolveContractSpy.mock.calls.length).toBe(1);
      const naturalKeyArg = resolveContractSpy.mock.calls[0][1];
      expect(naturalKeyArg.ibNumber).toBe('IB-PRESENT');
    });

    it('searchExistingContract: a resolveContract error clears selectedContract/snapshot and sets searchError, with no retry (Quality-report-balance.md BAL-101 — a previously-implemented dual-instrument-fallback retry was removed as dead code)', () => {
      const resolveContractSpy: jest.Mock = jest.fn(() => throwError(() => ({ error: { message: 'not found' } })));
      const api = mockApiD({ resolveContract: resolveContractSpy as any });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('B5'));
      c.searchNaturalKey = { lcNumber: 'S001', ibNumber: 'IB01', sgNumber: '' };
      c.selectedContract = contract(); // must be cleared by the error handler
      c.searchExistingContract();

      expect(resolveContractSpy.mock.calls.length).toBe(1);
      expect(c.selectedContract).toBeNull();
      expect(c.selectedContractSnapshot).toBeNull();
      expect(c.searchError).toBe('not found');
    });
  });

  describe("error-callback branches inside onSelectContract's helper chain", () => {
    it('loadSgsForArrival: a catalog() error clears loading/list state (A3S)', () => {
      const api = mockApiD({ catalog: jest.fn(() => throwError(() => new Error('boom'))) as any });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A3S'));
      // onSelectContract() itself re-resolves selectedContract from catalogPicker.contracts by id — must be
      // populated first, or the lookup falls back to null and loadSgsForArrival() short-circuits on
      // its own `if (!lcNumber) return;` guard before ever reaching the catalog() call under test.
      c.catalogPicker.contracts = [contract({ balanceContractId: 'bc-1', naturalKey: { lcNumber: 'S001' } })];
      c.onSelectContract('bc-1');
      expect(c.pickerSelection.sgsForArrivalLoading).toBe(false);
      expect(c.pickerSelection.sgsForArrival).toEqual([]);
    });

    it('loadSgsForArrival: no lcNumber to search on (selectedContract never resolved) -> early return, no catalog() call at all', () => {
      const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 50 }));
      const api = mockApiD({ catalog: catalogSpy as any });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A3S'));
      catalogSpy.mockClear(); // resetForFunction()'s own reloadCatalog() already called it once, unrelated to this guard
      c.catalogPicker.contracts = []; // picking an id that matches nothing leaves selectedContract null
      c.onSelectContract('does-not-exist');
      expect(c.pickerSelection.sgsForArrivalLoading).toBe(false);
      expect(c.pickerSelection.sgsForArrival).toEqual([]);
      expect(catalogSpy).not.toHaveBeenCalled();
    });

    it('loadPayableMovements: a listMovements() error clears loading/list state (A4)', () => {
      const api = mockApiD({
        catalog: jest.fn(() => of({ items: [contract({ balanceContractId: 'bc-1' })], total: 1, page: 1, pageSize: 10 })) as any,
        listMovements: jest.fn(() => throwError(() => new Error('boom'))) as any,
      });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A4'));
      c.catalogPicker.contracts = [contract({ balanceContractId: 'bc-1' })];
      c.onSelectContract('bc-1');
      expect(c.pickerSelection.payableMovementsLoading).toBe(false);
      expect(c.pickerSelection.payableMovements).toEqual([]);
    });

    it('loadPayableMovements: no contractId at all (unresolved pick) -> clears payableMovements without calling listMovements (A4)', () => {
      const listMovementsSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const api = mockApiD({ listMovements: listMovementsSpy as any });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('A4'));
      c.catalogPicker.contracts = []; // picking an id that matches nothing leaves selectedContract null
      c.pickerSelection.payableMovements = [movement({ movementId: 'stale' })]; // must be cleared, not left stale
      c.onSelectContract('does-not-exist');
      expect(c.pickerSelection.payableMovements).toEqual([]);
      expect(listMovementsSpy).not.toHaveBeenCalled();
    });

    it('loadPayableMovementsAcrossChildContracts (B4): no lcNumber at all -> clears payableMovements without calling the API', () => {
      const catalogSpy = jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 }));
      const api = mockApiD({ catalog: catalogSpy as any });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('B4'));
      // No selectedContract/selectedParent set at all, so lcNumber resolves to undefined.
      catalogSpy.mockClear();
      c.pickerSelection.loadPayableMovements({
        contractId: 'confirmation-id',
        lcNumber: undefined,
        selectedFunction: fn('B4'),
        selectedFunctionStrategy: functionStrategyModule.deriveFunctionStrategy(fn('B4')),
        onAutoPicked: () => {},
      });
      expect(c.pickerSelection.payableMovements).toEqual([]);
      expect(catalogSpy).not.toHaveBeenCalled();
    });

    it('loadPayableMovementsAcrossChildContracts (B4): a listMovements() failure for one child contract is swallowed (catchError -> []), an outer catalog() failure clears loading/list state', () => {
      const child = contract({ balanceContractId: 'child-1', instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'S001', ibNumber: 'EB01' } });
      const api = mockApiD({
        catalog: jest.fn(() => of({ items: [child], total: 1, page: 1, pageSize: 50 })) as any,
        listMovements: jest.fn(() => throwError(() => new Error('boom'))) as any,
      });
      const c = new MakerPanelComponent(api);
      triggerSelectFunction(c, fn('B4'));
      c.selectedContract = contract({ naturalKey: { lcNumber: 'S001' } });
      c.pickerSelection.loadPayableMovements({
        contractId: c.selectedContract.balanceContractId,
        lcNumber: 'S001',
        selectedFunction: fn('B4'),
        selectedFunctionStrategy: functionStrategyModule.deriveFunctionStrategy(fn('B4')),
        onAutoPicked: () => {},
      });
      expect(c.pickerSelection.payableMovementsLoading).toBe(false);
      expect(c.pickerSelection.payableMovements).toEqual([]);

      const apiErr = mockApiD({ catalog: jest.fn(() => throwError(() => new Error('boom'))) as any });
      const c2 = new MakerPanelComponent(apiErr);
      triggerSelectFunction(c2, fn('B4'));
      c2.selectedContract = contract({ naturalKey: { lcNumber: 'S001' } });
      c2.pickerSelection.loadPayableMovements({
        contractId: c2.selectedContract.balanceContractId,
        lcNumber: 'S001',
        selectedFunction: fn('B4'),
        selectedFunctionStrategy: functionStrategyModule.deriveFunctionStrategy(fn('B4')),
        onAutoPicked: () => {},
      });
      expect(c2.pickerSelection.payableMovementsLoading).toBe(false);
      expect(c2.pickerSelection.payableMovements).toEqual([]);
    });
  });

  describe("afterResolved()'s amount-default branches (via onSubChoice, with a contract snapshot already present)", () => {
    it("FULL_SETTLE branch defaults model.amount to the snapshot's Available Balance, not Confirmed (A7)", () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A7'));
      c.selectedContractSnapshot = snapshot({ confirmedBalance: '1000', availableBalance: '750' });
      c.subChoiceValue = 'FULL_SETTLE';
      c.onSubChoice();
      expect(c.model.amount).toBe('750');
    });

    it("autoRedeemType branch defaults model.amount to the snapshot's Available Balance (A9-shaped function forced through onSubChoice for direct coverage)", () => {
      const c = new MakerPanelComponent(mockApiD());
      // A9 has no subChoice in the real registry (fixed FULL_REDEEM) — afterResolved()'s
      // autoRedeemType branch is normally reached via refreshSelectedContractSnapshot() instead.
      // Exercise it directly through the same private path with a synthetic subChoice variant,
      // matching the pattern already used elsewhere in this suite for hard-to-reach symmetry branches.
      const synthetic: TransactionFunction = {
        ...fn('A9'),
        subChoice: { key: 'movementType', label: 'X', options: [{ value: 'FULL_REDEEM', label: 'Full' }] },
      };
      triggerSelectFunction(c, synthetic);
      c.selectedContractSnapshot = snapshot({ confirmedBalance: '1000', availableBalance: '600' });
      c.subChoiceValue = 'FULL_REDEEM';
      c.onSubChoice();
      expect(c.model.amount).toBe('600');
    });

    it('settlesAcceptanceOnMature branch defaults model.amount to the snapshot\'s Available Balance (B5-shaped synthetic, per the field\'s own "unreachable in practice without a subChoice" doc comment)', () => {
      const c = new MakerPanelComponent(mockApiD());
      const synthetic: TransactionFunction = {
        ...fn('B5'),
        subChoice: { key: 'movementType', label: 'X', options: [{ value: 'FULL_SETTLE', label: 'Full' }] },
      };
      triggerSelectFunction(c, synthetic);
      c.model.instrumentType = 'EPLC_ACCEPTANCE';
      c.selectedContractSnapshot = snapshot({ confirmedBalance: '1000', availableBalance: '300' });
      c.subChoiceValue = 'RECLASSIFY_OUT'; // anything other than FULL_SETTLE, so the first branch doesn't win
      c.onSubChoice();
      expect(c.model.amount).toBe('300');
    });
  });

  describe("rebuildFields()'s A1/B1 Tenor Days Formly `expressions` callbacks", () => {
    function tenorDaysField(c: MakerPanelComponent) {
      const field = c.fields.find((f) => f.key === 'tenorDays');
      if (!field?.expressions) throw new Error('tenorDays field has no expressions — check A1 is unlocked');
      return field.expressions as Record<string, (f: any) => any>;
    }

    it('disables/requires/labels/classes/zeros Tenor Days based on the live Tenor Type value, for A1 with no locked tenor', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      const exprs = tenorDaysField(c);

      expect(exprs['props.disabled']({ model: { tenorType: 'SIGHT' } })).toBe(true);
      expect(exprs['props.disabled']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(false);

      expect(exprs['props.required']({ model: { tenorType: 'SIGHT' } })).toBe(false);
      expect(exprs['props.required']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(true);
      expect(exprs['props.required']({ model: {} })).toBe(false);

      expect(exprs['props.min']({ model: { tenorType: 'SIGHT' } })).toBeNull();
      expect(exprs['props.min']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(1);

      expect(exprs['props.label']({ model: { tenorType: 'SIGHT' } })).toBe('Tenor Days (Sight — always 0, protected)');
      expect(exprs['props.label']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe('Tenor Days');

      expect(exprs['className']({ model: { tenorType: 'BUYERS_USANCE' } })).toBe('tb-field--required');
      expect(exprs['className']({ model: { tenorType: 'SIGHT' } })).toBe('');

      expect(exprs['model.tenorDays']({ model: { tenorType: 'SIGHT', tenorDays: 30 } })).toBe(0);
      expect(exprs['model.tenorDays']({ model: { tenorType: 'BUYERS_USANCE', tenorDays: 90 } })).toBe(90);
    });

    it('same expressions are wired for B1 (Confirm LC)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('B1'));
      const exprs = tenorDaysField(c);
      expect(exprs['props.disabled']({ model: { tenorType: 'SIGHT' } })).toBe(true);
    });
  });

  describe("rebuildFields()'s Amount field props.step Formly `expressions` callback (Amount input follows Currency decimal places)", () => {
    it('the initial props.step matches whatever Currency is already typed at rebuild time (default 2dp when none is)', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      const amountField = c.fields.find((f) => f.key === 'amount');
      expect(amountField?.props?.step).toBeCloseTo(0.01);
    });

    it("props.step expression reacts live to the Currency field's own value (JPY -> whole-number step, KWD -> 3dp step)", () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A1'));
      const amountField = c.fields.find((f) => f.key === 'amount');
      if (!amountField?.expressions) throw new Error('amount field has no expressions — check A1 is unlocked');
      const exprs = amountField.expressions as Record<string, (f: any) => any>;

      expect(exprs['props.step']({ model: { currency: 'JPY' } })).toBe(1);
      expect(exprs['props.step']({ model: { currency: 'KWD' } })).toBeCloseTo(0.001);
      expect(exprs['props.step']({ model: { currency: 'USD' } })).toBeCloseTo(0.01);
      expect(exprs['props.step']({ model: {} })).toBeCloseTo(0.01); // no currency typed yet -> default fallback
    });
  });

  describe('remaining ??-fallback branches found in a follow-up combined-coverage pass (raising the floor from 90% to 95%)', () => {
    it('onSelectParent (A6, tenorTypeOptions): a parent LC with no declared tenorType/tenorDays falls back to undefined, not carrying over a stale value', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A6'));
      c.parentPicker.contracts = [contract({ balanceContractId: 'p1', instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } })]; // no tenorType/tenorDays set
      c.onSelectParent('p1');
      expect(c.model.tenorType).toBeUndefined();
      expect(c.model.tenorDays).toBeUndefined();
    });

    it('onSelectIbIndex: a found contract with no ibNumber on its natural key (e.g. an SHGT row, A8) falls back to "" rather than undefined', () => {
      const c = new MakerPanelComponent(mockApiD());
      triggerSelectFunction(c, fn('A8'));
      c.ibIndexPicker.contracts = [contract({ balanceContractId: 'ib1', instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'SG01' } })];
      c.onSelectIbIndex('ib1');
      expect(c.searchNaturalKey.ibNumber).toBe('');
      expect(c.searchNaturalKey.sgNumber).toBe('SG01');
    });
  });
});
