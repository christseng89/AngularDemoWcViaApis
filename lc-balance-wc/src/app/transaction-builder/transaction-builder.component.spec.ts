import { of } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import type { BalanceComponentApiService, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, TransactionFunction } from './balance-component.model';

/**
 * Direct-instantiation, no-TestBed unit tests (house style — see
 * lc-payment-wc's leg-allocator.component.spec.ts) for TransactionBuilderComponent's own remaining
 * parent-owned surface, post-MakerPanelComponent extraction (2026-08-19, desiger-comments.md "Feature
 * Components + Facade" pilot #3): constructor (parent-owned defaults only), selectFunctionSide,
 * selectFunction (parent-owned reset only — the Maker-side reset this method used to perform inline now
 * lives on MakerPanelComponent.resetForFunction(), triggered via the shared checkerResetNonce/
 * resetTrigger signal — see maker-panel.component.spec.ts for that half), displayStatus, statusBadgeClass,
 * movementTypeChecksAvailableBalance.
 *
 * Everything that used to live in this file testing Maker-owned state directly (comp.model/
 * comp.selectedContract/comp.catalogPicker/comp.submitResult/reloadCatalog/onSubChoice/
 * onCatalogSearch/onSelectFlattenedPayable/catalogIbHint/catalogPrevPage-catalogNextPage/
 * CatalogPickerService.load/onParentInstrumentTypeChange/onParentSearch/parentPrevPage-parentNextPage/
 * onPayableMovementSearchChange/catalogPendingHint/movementTypeChecksAvailableBalance) moved to
 * maker-panel.component.spec.ts — MakerPanelComponent now owns all of it directly.
 */

function findFn(list: TransactionFunction[], code: string): TransactionFunction {
  const fn = list.find((f) => f.code === code);
  if (!fn) throw new Error(`Function ${code} not found in registry`);
  return fn;
}

const A1 = findFn(IMPORT_FUNCTIONS, 'A1'); // LC Issue — fixed movementType ISSUE, tenorTypeOptions, no parent
const B1 = findFn(EXPORT_FUNCTIONS, 'B1'); // Confirm LC — export side, fixed movementType

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

function makeApiMock() {
  return {
    createMovement: jest.fn(),
    release: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    acknowledge: jest.fn(),
    resolveContract: jest.fn(),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 } as CatalogPage)),
    getSnapshot: jest.fn((id: string) =>
      of({
        balanceContractId: id,
        logicalContractId: `logical-${id}`,
        currency: 'USD',
        confirmedBalance: '0',
        availableBalance: '0',
        pendingEarmarkTotal: '0',
      } as BalanceSnapshot),
    ),
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
    it('initializes default parent-owned state', () => {
      const { comp } = makeComponent();

      expect(comp.activeFunctionSide).toBe('IMPORT');
      expect(comp.selectedFunction).toBeNull();
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerBusy).toBe(false);
      expect(comp.checkerError).toBeNull();
      expect(comp.checkerId).toBe('checker1');
      // BAL-003 pilot #2 (2026-08-19) — checkerLcNumber moved to CheckerPanelComponent, its own initial
      // state now covered by checker-panel.component.spec.ts.
      expect(comp.checkerSyncSignal).toBeNull();
      expect(comp.checkerResetNonce).toBe(0);
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.accountEntryDialogMovement).toBeNull();
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
    it('sets selectedFunction/activeFunctionSide, clears releaseSuccessHint/arrivalApproved/the Account Entries dialog, and does not touch the api directly', () => {
      const { comp, mockApi } = makeComponent();
      comp.releaseSuccessHint = 'stale hint';
      comp.arrivalApproved = true;
      comp.openAccountEntryDialog(mkMovement('m1'), 'IPLC_LC');

      comp.selectFunction(A1);

      expect(comp.selectedFunction).toBe(A1);
      expect(comp.activeFunctionSide).toBe('IMPORT');
      expect(comp.releaseSuccessHint).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.accountEntryDialogMovement).toBeNull();
      expect(comp.accountEntryDialogInstrumentType).toBeNull();
      // selectFunction() itself never calls the api — that's all Maker/Checker-child-owned now.
      expect(mockApi.catalog).not.toHaveBeenCalled();
    });

    it('resets Checker-side/parent-owned selection state and increments checkerResetNonce, signalling the Maker/Checker children to reset themselves', () => {
      const { comp } = makeComponent();
      comp.selectedCheckerMovement = mkMovement('m2');
      comp.checkerError = 'stale';
      const priorResetNonce = comp.checkerResetNonce;

      comp.selectFunction(A1);

      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerError).toBeNull();
      // BAL-003 pilot #2 (2026-08-19) — checkerContract/checkerSearchError/checkerItems/checkerLcNumber
      // moved to CheckerPanelComponent; selectFunction() now signals it to reset via checkerResetNonce
      // instead (checkerLcNumber itself is still deliberately NOT part of that reset — see
      // CheckerPanelComponent.resetPanel()'s own doc comment, unchanged reasoning). The equivalent
      // Maker-side reset (model/naturalKey/catalogPicker/etc, ~30 fields) is now covered by
      // maker-panel.component.spec.ts's own "resetForFunction() (via ngOnChanges resetTrigger)" describe
      // block, triggered the same way a real template binding would (resetTrigger changing).
      expect(comp.checkerResetNonce).toBe(priorResetNonce + 1);
    });

    it('re-syncs lookup.instrumentType per side (B1) — a parent-owned concern, independent of the Maker-side natural-key reset', () => {
      const { comp } = makeComponent();
      comp.lookUp.lookup.sgNumber = 'SG1';

      comp.selectFunction(B1);

      expect(comp.activeFunctionSide).toBe('EXPORT');
      expect(comp.lookUp.lookup.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(comp.lookUp.lookup.sgNumber).toBe('');
    });
  });

  // Settled requirement, 2026-08-18 ("Both Look Up Current Balance and Inquire Events must use exactly
  // the same Status mapping logic... do not get this wrong again") — the full mapping table:
  //   Import A3/A3S, Export B3        : Not Released -> EARMARKING, Released -> EARMARKED
  //   Every other function            : Not Released -> PENDING,    Released -> APPROVED
  describe('displayStatus', () => {
    it('relabels RELEASED as APPROVED (display-only) for a function OTHER than Document Arrival/Present Docs', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'ISSUE')).toBe('APPROVED');
      expect(comp.displayStatus('RELEASED')).toBe('APPROVED'); // no instrumentType/movementType supplied at all
    });

    it('relabels RELEASED as EARMARKED for Import LC Document Arrival (IPLC_LC/UTILIZE) and Export Present Docs (EPLC_EXAMINATION/CREATE) only', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'UTILIZE')).toBe('EARMARKED');
      expect(comp.displayStatus('RELEASED', 'EPLC_EXAMINATION', 'CREATE')).toBe('EARMARKED');
    });

    it('does NOT relabel a different movementType on the same two instrumentTypes as EARMARKED', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'ISSUE')).toBe('APPROVED');
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'AMEND_INCREASE')).toBe('APPROVED');
    });

    it('relabels PENDING as EARMARKING for the SAME two Document Arrival/Present Docs functions — the not-yet-released half of the pair', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('PENDING', 'IPLC_LC', 'UTILIZE')).toBe('EARMARKING');
      expect(comp.displayStatus('PENDING', 'EPLC_EXAMINATION', 'CREATE')).toBe('EARMARKING');
    });

    it('leaves PENDING as plain PENDING for every other function', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('PENDING', 'IPLC_LC', 'ISSUE')).toBe('PENDING');
      expect(comp.displayStatus('PENDING')).toBe('PENDING'); // no instrumentType/movementType supplied at all
    });

    it('passes every non-PENDING/RELEASED status through unchanged, ignoring instrumentType/movementType entirely', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('REJECTED', 'IPLC_LC', 'UTILIZE')).toBe('REJECTED');
      expect(comp.displayStatus('CANCELLED')).toBe('CANCELLED');
      expect(comp.displayStatus('SUPERSEDED')).toBe('SUPERSEDED');
    });

    // Bug fixed 2026-08-18, reviewer-caught live on the real running app: "Import LC S01 => A4 · Sight
    // Settlement / IPLC_LC / UTILIZE / 12000 / B01 / — / EARMARKED / 8/18/26, 9:04 AM — 應該是 Approved
    // 對嗎?" (shouldn't that be Approved?). Inquire Events' own merged timeline splits a finalized Sight
    // Document Arrival into a 'create' row (A3's own submission) and a 'finalize' row (A4's own Release)
    // — both sharing the IDENTICAL (IPLC_LC, UTILIZE), so the earlier fix (scoped by instrumentType/
    // movementType alone) wrongly labeled A4's OWN row EARMARKED too, even though the Function column
    // right next to it correctly said "A4 · Sight Settlement", not A3.
    it("does NOT relabel RELEASED as EARMARKED for a 'finalize'-phase row (A4's own completion of a Sight Document Arrival) — reproduces the exact reported LC S01 case", () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'UTILIZE', 'finalize')).toBe('APPROVED');
    });

    it("still relabels RELEASED as EARMARKED for the SAME (IPLC_LC, UTILIZE) pair under 'create'/'primary'/omitted phase — A3/A3S's own row, unaffected by the fix", () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'UTILIZE', 'create')).toBe('EARMARKED');
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'UTILIZE', 'primary')).toBe('EARMARKED');
      expect(comp.displayStatus('RELEASED', 'IPLC_LC', 'UTILIZE')).toBe('EARMARKED');
    });
  });

  // 2026-08-18, user-requested ("EARMARK 可否用與APPROVED PENDING不同顏色區分" — a color distinct from
  // both APPROVED and PENDING) — mirrors displayStatus()'s own EARMARKING/EARMARKED-vs-PENDING/APPROVED
  // decision exactly. EARMARKING (a PENDING-status earmark movement) deliberately shares PENDING's own
  // amber class, unchanged — only the RELEASED side gets a distinct color.
  describe('statusBadgeClass', () => {
    it('returns the pending class for PENDING, regardless of instrumentType/movementType (EARMARKING included)', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeClass('PENDING')).toBe('tb-status-badge--pending');
      expect(comp.statusBadgeClass('PENDING', 'IPLC_LC', 'UTILIZE')).toBe('tb-status-badge--pending');
    });

    it('returns the approved class for RELEASED outside Document Arrival/Present Docs', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeClass('RELEASED', 'IPLC_LC', 'ISSUE')).toBe('tb-status-badge--approved');
      expect(comp.statusBadgeClass('RELEASED')).toBe('tb-status-badge--approved');
    });

    it('returns a DIFFERENT, dedicated earmark class for RELEASED Import Document Arrival / Export Present Docs — distinct from both approved and pending', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeClass('RELEASED', 'IPLC_LC', 'UTILIZE')).toBe('tb-status-badge--earmark');
      expect(comp.statusBadgeClass('RELEASED', 'EPLC_EXAMINATION', 'CREATE')).toBe('tb-status-badge--earmark');
      expect(comp.statusBadgeClass('RELEASED', 'IPLC_LC', 'UTILIZE')).not.toBe(comp.statusBadgeClass('RELEASED', 'IPLC_LC', 'ISSUE'));
      expect(comp.statusBadgeClass('RELEASED', 'IPLC_LC', 'UTILIZE')).not.toBe(comp.statusBadgeClass('PENDING'));
    });

    it('returns the negative class for REJECTED/CANCELLED and the neutral class for SUPERSEDED', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeClass('REJECTED')).toBe('tb-status-badge--negative');
      expect(comp.statusBadgeClass('CANCELLED')).toBe('tb-status-badge--negative');
      expect(comp.statusBadgeClass('SUPERSEDED')).toBe('tb-status-badge--neutral');
    });
  });

  // 2026-08-20, user-directed ("B2 Decrease...Look Up Current Balance and Inquire Events B2 Type與Amount
  // 處理應該跟A2一樣 AMEND_INCREASE AMEND_DECREASE") — thin delegation to the shared
  // displayMovementType()/displayMovementAmount() pure functions, same convention as displayStatus()/
  // statusBadgeClass() above. Full branch coverage of the underlying rule itself lives in
  // balance-component.model.spec.ts; these just prove the delegation wiring.
  describe('displayMovementType / displayMovementAmount', () => {
    it('relabels a negative B2 (EPLC_CONFIRMATION/AMEND) amount as AMEND_DECREASE with the de-signed magnitude', () => {
      const { comp } = makeComponent();
      expect(comp.displayMovementType('EPLC_CONFIRMATION', 'AMEND', '-7000')).toBe('AMEND_DECREASE');
      expect(comp.displayMovementAmount('EPLC_CONFIRMATION', 'AMEND', '-7000')).toBe('7000');
    });

    it('passes every other (instrumentType, movementType) pair through unchanged, e.g. IPLC_LC/ISSUE', () => {
      const { comp } = makeComponent();
      expect(comp.displayMovementType('IPLC_LC', 'ISSUE', '5000')).toBe('ISSUE');
      expect(comp.displayMovementAmount('IPLC_LC', 'ISSUE', '5000')).toBe('5000');
    });
  });
});
