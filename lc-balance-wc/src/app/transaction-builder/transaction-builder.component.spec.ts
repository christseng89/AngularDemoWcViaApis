import { of } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import type { BalanceComponentApiService, BalanceMovement, BalanceSnapshot, CatalogPage } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, TransactionFunction } from './balance-component.model';

/**
 * Direct-instantiation, no-TestBed unit tests for TransactionBuilderComponent's remaining
 * parent-owned surface: constructor, selectFunctionSide, selectFunction (parent-owned reset only —
 * the Maker-side reset lives on MakerPanelComponent.resetForFunction()), displayStatus,
 * statusBadgeClass, movementTypeChecksAvailableBalance. Maker-owned state is covered in
 * maker-panel.component.spec.ts.
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
  it('presents Checker action errors through the shared non-retry feedback policy', () => {
    const { comp: c } = makeComponent();
    expect(c.checkerFeedback).toBeNull();
    c.checkerError = 'approval failed';
    expect(c.checkerFeedback).toMatchObject({ severity: 'ERROR', title: 'Unable to approve the transaction', retryable: false });
  });
  describe('constructor', () => {
    it('initializes default parent-owned state', () => {
      const { comp } = makeComponent();

      expect(comp.activeFunctionSide).toBe('IMPORT');
      expect(comp.selectedFunction).toBeNull();
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerBusy).toBe(false);
      expect(comp.checkerError).toBeNull();
      expect(comp.checkerId).toBe('checker1');
      // checkerLcNumber moved to CheckerPanelComponent; covered by checker-panel.component.spec.ts.
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

    it('clears the selected Function and its Maker/Checker state when switching sides', () => {
      const { comp } = makeComponent();
      comp.selectFunction(A1);
      comp.selectedCheckerMovement = mkMovement('m-side');
      comp.checkerError = 'stale';
      comp.releaseSuccessHint = 'stale';
      const priorResetNonce = comp.checkerResetNonce;

      comp.selectFunctionSide('EXPORT');

      expect(comp.selectedFunction).toBeNull();
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerError).toBeNull();
      expect(comp.releaseSuccessHint).toBeNull();
      expect(comp.checkerResetNonce).toBe(priorResetNonce + 1);
    });

    it('keeps the current Function when the already-active side is clicked again', () => {
      const { comp } = makeComponent();
      comp.selectFunction(A1);

      comp.selectFunctionSide('IMPORT');

      expect(comp.selectedFunction).toBe(A1);
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
      // selectFunction() never calls the api — Maker/Checker-child-owned now.
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
      // Checker queue state moved to CheckerPanelComponent; selectFunction() signals it via
      // checkerResetNonce (checkerLcNumber itself is deliberately excluded — see resetPanel()).
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

  // Status mapping: Import A3/A3S, Export B3 -> EARMARKING/EARMARKED; every other function -> PENDING/APPROVED.
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

    // Business instruction 2026-08-20 ("A4 選取 EARMARKED 的交易" / "狀態必須是 EARMARKED") — once the
    // Checker genuinely acknowledges (A3/A3S's own "Approve"), the display already reads EARMARKED even
    // though status stays PENDING (A4/A6 hasn't finalized it yet) — A4/A6's own picker eligibility relies
    // on this same signal (see document-arrival-hints.service.ts / picker-selection.service.ts).
    it('relabels PENDING as EARMARKED (not EARMARKING) once acknowledgedAt is set', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('PENDING', 'IPLC_LC', 'UTILIZE', null, '2026-08-20T00:00:00.000Z')).toBe('EARMARKED');
      expect(comp.displayStatus('PENDING', 'EPLC_EXAMINATION', 'CREATE', null, '2026-08-20T00:00:00.000Z')).toBe('EARMARKED');
    });

    it('does NOT relabel PENDING as EARMARKED for a non-earmark function even when acknowledgedAt is set', () => {
      const { comp } = makeComponent();
      expect(comp.displayStatus('PENDING', 'IPLC_LC', 'ISSUE', null, '2026-08-20T00:00:00.000Z')).toBe('PENDING');
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
    });

    // A split UTILIZE's 'create' (A3) and 'finalize' (A4) rows share the same (instrumentType,
    // movementType) — phase disambiguates which one is the real earmark.
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

  // Mirrors displayStatus()'s EARMARKING/EARMARKED split — EARMARKING shares PENDING's amber class;
  // only the RELEASED side gets a distinct color.
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

    it('returns the earmark class for a PENDING Document Arrival/Present Docs once acknowledgedAt is set, but plain pending class without it', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeClass('PENDING', 'IPLC_LC', 'UTILIZE', null, '2026-08-20T00:00:00.000Z')).toBe('tb-status-badge--earmark');
      expect(comp.statusBadgeClass('PENDING', 'IPLC_LC', 'UTILIZE')).toBe('tb-status-badge--pending');
    });

    it('returns the negative class for REJECTED/CANCELLED', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeClass('REJECTED')).toBe('tb-status-badge--negative');
      expect(comp.statusBadgeClass('CANCELLED')).toBe('tb-status-badge--negative');
    });
  });

  // Contract-level ContractStatus (LC Master Records Index), user-requested 2026-08-21 ("LC Active shows
  // Green, Close shows Red") — a different enum from statusBadgeClass()'s own MovementStatus above.
  describe('contractStatusBadgeClass', () => {
    it('returns the approved (green) class for ACTIVE and the negative (red) class for CLOSED', () => {
      const { comp } = makeComponent();
      expect(comp.contractStatusBadgeClass('ACTIVE')).toBe('tb-status-badge--approved');
      expect(comp.contractStatusBadgeClass('CLOSED')).toBe('tb-status-badge--negative');
    });
  });

  // Thin delegation to the shared functionActionIcon()/statusBadgeIcon() pure functions (P2 UI/UX
  // pass); full branch coverage lives in balance-component.model.spec.ts.
  describe('functionActionIcon / statusBadgeIcon', () => {
    it('delegates to the shared functionActionIcon() rule', () => {
      const { comp } = makeComponent();
      expect(comp.functionActionIcon('A1')).toBe('issue');
      expect(comp.functionActionIcon('A2')).toBe('amend');
    });

    it('delegates to the shared statusBadgeIcon() rule', () => {
      const { comp } = makeComponent();
      expect(comp.statusBadgeIcon('tb-status-badge--approved')).toBe('ok');
      expect(comp.statusBadgeIcon('tb-status-badge--pending')).toBe('pending');
    });
  });

  // Thin delegation to the shared displayMovementType()/displayMovementAmount() pure functions; full
  // branch coverage lives in balance-component.model.spec.ts.
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
