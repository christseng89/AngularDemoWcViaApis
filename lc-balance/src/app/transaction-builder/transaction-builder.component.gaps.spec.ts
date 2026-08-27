import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import type { InquiredEvent } from './inquire-events.service';
import type { MakerCheckerContext } from './maker-panel.component';
import * as functionStrategyModule from './function-strategy';

/**
 * Closes coverage gaps in TransactionBuilderComponent's own remaining, parent-owned surface: the Look
 * Up Current Balance `activeLookup*` getters, the Checker-side `isCheckerCompoundOwnSubmission`/
 * `checkerActionInFlight`/`isArrivalAcknowledgmentStep`/`checkerActionButtonLabel` getters,
 * `checkerAct()`'s describeApiError fallback branch, and the Account Entries dialog state/methods
 * (the dialog UI itself lives in AccountEntriesDialogComponent). Maker-owned state coverage is in
 * maker-panel.component.spec.ts.
 */

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

/** lookUp.lookupMovements/acceptanceMovements/sgMovements are InquiredEvent[]; these tests exercise only tab-routing, so a 'primary'-phase wrapper is enough. */
function eventRow(overrides: Partial<{ movement: BalanceMovement; contract: BalanceContract }> = {}): InquiredEvent {
  return { movement: movement(), contract: contract(), eventTime: movement().createdAt, eventStatus: movement().status, phase: 'primary', ...overrides };
}

function mockApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    createMovement: jest.fn(),
    release: jest.fn(),
    reject: jest.fn(),
    cancel: jest.fn(),
    acknowledge: jest.fn(),
    resolveContract: jest.fn(() => of(contract())),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getSnapshot: jest.fn(() => of(snapshot())),
    listMovements: jest.fn(() => of([])),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

/** Replaces the parent's private `makerContext` mirror directly, same shape as actions.spec.ts's `setMakerContext()`. */
function setMakerContext(comp: TransactionBuilderComponent, overrides: Partial<MakerCheckerContext> = {}): void {
  (comp as any).makerContext = {
    submitResult: null,
    selectedPayMovement: null,
    matchedReceivableMovementId: null,
    dueFromIssuingBankMovementId: null,
    acceptanceMovementId: null,
    acceptanceReimbReceivableMovementId: null,
    arrivalSgRedeemMovementId: null,
    createdBy: 'maker1',
    ...overrides,
  };
}

describe('TransactionBuilderComponent — coverage gap-closing (getters + error branches)', () => {
  describe('activeLookup* getters — LC vs ACCEPTANCE vs SG tab', () => {
    function withLookupResult(c: TransactionBuilderComponent, overrides: Partial<BalanceContract> = {}) {
      c.lookUp.lookupResult = { contract: contract(overrides), snapshot: snapshot() };
    }

    it('default (LC) tab reads from lookupMovements/lookupResult', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookUp.lookupMovements = [eventRow({ movement: movement({ movementId: 'mv-1' }) })];
      withLookupResult(c);
      expect(c.lookUp.activeLookupMovements).toEqual([eventRow({ movement: movement({ movementId: 'mv-1' }) })]);
      expect(c.lookUp.activeLookupSnapshot).toEqual(snapshot());
      expect(c.lookUp.activeLookupContract).toEqual(contract());
      expect(c.lookUp.activeLookupLabel).toBe('LC S001');
    });

    it('ACCEPTANCE tab reads from acceptanceMovements/acceptanceSnapshot/selectedLookupAcceptance, and appends IB Number when present', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookUp.lookupTab = 'ACCEPTANCE';
      c.lookUp.acceptanceMovements = [eventRow({ movement: movement({ movementId: 'mv-2' }) })];
      c.lookUp.acceptanceSnapshot = snapshot({ confirmedBalance: '5' });
      c.lookUp.selectedLookupAcceptance = contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } });
      withLookupResult(c);
      expect(c.lookUp.activeLookupMovements).toEqual([eventRow({ movement: movement({ movementId: 'mv-2' }) })]);
      expect(c.lookUp.activeLookupSnapshot).toEqual(snapshot({ confirmedBalance: '5' }));
      expect(c.lookUp.activeLookupContract).toEqual(contract({ naturalKey: { lcNumber: 'S001', ibNumber: 'IB01' } }));
      expect(c.lookUp.activeLookupLabel).toBe('LC S001 / IB IB01');
    });

    it('ACCEPTANCE tab label falls back to bare LC when the selected acceptance has no ibNumber', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookUp.lookupTab = 'ACCEPTANCE';
      c.lookUp.selectedLookupAcceptance = contract({ naturalKey: { lcNumber: 'S001' } });
      withLookupResult(c);
      expect(c.lookUp.activeLookupLabel).toBe('LC S001');
    });

    it('SG tab reads from sgMovements/sgSnapshot/selectedLookupSg, and appends SG Number when present', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookUp.lookupTab = 'SG';
      c.lookUp.sgMovements = [eventRow({ movement: movement({ movementId: 'mv-3' }) })];
      c.lookUp.sgSnapshot = snapshot({ confirmedBalance: '9' });
      c.lookUp.selectedLookupSg = contract({ naturalKey: { lcNumber: 'S001', sgNumber: 'SG01' } });
      withLookupResult(c);
      expect(c.lookUp.activeLookupMovements).toEqual([eventRow({ movement: movement({ movementId: 'mv-3' }) })]);
      expect(c.lookUp.activeLookupSnapshot).toEqual(snapshot({ confirmedBalance: '9' }));
      expect(c.lookUp.activeLookupContract).toEqual(contract({ naturalKey: { lcNumber: 'S001', sgNumber: 'SG01' } }));
      expect(c.lookUp.activeLookupLabel).toBe('LC S001 / SG SG01');
    });

    it('SG tab label falls back to bare LC when the selected SG has no sgNumber', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookUp.lookupTab = 'SG';
      c.lookUp.selectedLookupSg = contract({ naturalKey: { lcNumber: 'S001' } });
      withLookupResult(c);
      expect(c.lookUp.activeLookupLabel).toBe('LC S001');
    });

    it('activeLookupLabel falls back to the typed lookup.lcNumber when no lookupResult is loaded yet', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.lookUp.lookup.lcNumber = 'TYPED01';
      expect(c.lookUp.activeLookupLabel).toBe('LC TYPED01');
    });

    it('activeLookupSnapshot/activeLookupContract fall back to null on the default (LC) tab before any lookup has run', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.lookUp.activeLookupSnapshot).toBeNull();
      expect(c.lookUp.activeLookupContract).toBeNull();
    });

    it('lookupIsUsanceLc is false with no lookupResult, false for a non-LC/non-Confirmation contract, false for Sight, true for Usance', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.lookUp.lookupIsUsanceLc).toBe(false);

      withLookupResult(c, { instrumentType: 'SHGT' });
      expect(c.lookUp.lookupIsUsanceLc).toBe(false);

      withLookupResult(c, { instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      expect(c.lookUp.lookupIsUsanceLc).toBe(false);

      withLookupResult(c, { instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' });
      expect(c.lookUp.lookupIsUsanceLc).toBe(true);

      withLookupResult(c, { instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' });
      expect(c.lookUp.lookupIsUsanceLc).toBe(true);
    });

    it('lookupHasSg is true only for an IPLC_LC lookup result', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.lookUp.lookupHasSg).toBe(false);
      withLookupResult(c, { instrumentType: 'IPLC_LC' });
      expect(c.lookUp.lookupHasSg).toBe(true);
      withLookupResult(c, { instrumentType: 'EPLC_LC' });
      expect(c.lookUp.lookupHasSg).toBe(false);
    });

    // The Acceptance picker's catalog rows and tab button need this side-aware label.
    it("acceptanceBalanceLabel is 'Acceptance Balance' with no lookupResult or for an Import LC, 'Confirmed LC Acceptance Balance' for an Export Confirmation", () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.lookUp.acceptanceBalanceLabel).toBe('Acceptance Balance');
      withLookupResult(c, { instrumentType: 'IPLC_LC' });
      expect(c.lookUp.acceptanceBalanceLabel).toBe('Acceptance Balance');
      withLookupResult(c, { instrumentType: 'EPLC_CONFIRMATION' });
      expect(c.lookUp.acceptanceBalanceLabel).toBe('Confirmed LC Acceptance Balance');
    });
  });

  describe('isCheckerCompoundOwnSubmission / checkerActionInFlight / isArrivalAcknowledgmentStep / checkerActionButtonLabel', () => {
    it('covers every branch of these 4 Checker-side getters', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.isCheckerCompoundOwnSubmission).toBe(false);
      expect(c.checkerActionInFlight).toBe(false);
      expect(c.isArrivalAcknowledgmentStep).toBe(false);
      expect(c.checkerActionButtonLabel).toBe('Release');

      c.checkerBusy = true;
      expect(c.checkerActionInFlight).toBe(true);
      expect(c.checkerActionButtonLabel).toBe('Working…');
      c.checkerBusy = false;

      (c as any).actionBusy = true;
      expect(c.checkerActionInFlight).toBe(true);
      (c as any).actionBusy = false;

      // A3S/documentArrivalWithSg: routes on the picked item's own shape (UTILIZE + businessEventId), no
      // submitResult match required.
      c.selectFunction(fn('A3S')); // documentArrivalWithSg
      c.selectedCheckerMovement = movement({ movementId: 'm-1', movementType: 'UTILIZE', businessEventId: 'be-1' });
      expect(c.isCheckerCompoundOwnSubmission).toBe(true);
      expect(c.isArrivalAcknowledgmentStep).toBe(true);
      expect(c.checkerActionButtonLabel).toBe('Release (Shipping Guarantee redemption)');

      // makerContext.submitResult mismatch/absence doesn't matter for A3S.
      setMakerContext(c, { submitResult: movement({ movementId: 'other' }) });
      expect(c.isCheckerCompoundOwnSubmission).toBe(true);
      setMakerContext(c, { submitResult: null });
      expect(c.isCheckerCompoundOwnSubmission).toBe(true);

      // no businessEventId (e.g. a plain A3 UTILIZE, never compound) -> false — the disambiguator that
      // keeps a stray non-A3S pending item from wrongly attempting a compound release.
      c.selectedCheckerMovement = movement({ movementId: 'm-1', movementType: 'UTILIZE', businessEventId: null });
      expect(c.isCheckerCompoundOwnSubmission).toBe(false);

      // no selectedCheckerMovement -> false
      c.selectedCheckerMovement = null;
      expect(c.isCheckerCompoundOwnSubmission).toBe(false);

      // B5/settlesAcceptanceOnMature: same shape as A3S above.
      const cB5 = new TransactionBuilderComponent(mockApi());
      cB5.selectFunction(fn('B5'));
      cB5.selectedCheckerMovement = movement({ movementId: 'm-b5', movementType: 'FULL_SETTLE', businessEventId: 'be-2' });
      expect(cB5.isCheckerCompoundOwnSubmission).toBe(true);
      cB5.selectedCheckerMovement = movement({ movementId: 'm-b5', movementType: 'PARTIAL_SETTLE', businessEventId: 'be-2' });
      expect(cB5.isCheckerCompoundOwnSubmission).toBe(true);
      cB5.selectedCheckerMovement = movement({ movementId: 'm-b5', movementType: 'PARTIAL_SETTLE', businessEventId: null });
      expect(cB5.isCheckerCompoundOwnSubmission).toBe(false);
      cB5.selectedCheckerMovement = movement({ movementId: 'm-b5', movementType: 'CREATE', businessEventId: 'be-2' });
      expect(cB5.isCheckerCompoundOwnSubmission).toBe(false);

      // createsIssuingBankReceivableOnHonour's own branch is unreachable via any real function object
      // (B4 also always carries settlesDocumentArrival, which wins first) — stub deriveFunctionStrategy()
      // with that flag stripped to exercise it directly.
      const realDeriveFunctionStrategy = functionStrategyModule.deriveFunctionStrategy;
      const strategySpy = jest.spyOn(functionStrategyModule, 'deriveFunctionStrategy').mockImplementation((f) => {
        const real = realDeriveFunctionStrategy(f);
        return f.code === 'B4' ? { ...real, checkerRelease: { ...real.checkerRelease, settlesDocumentArrival: false } } : real;
      });
      try {
        const c2 = new TransactionBuilderComponent(mockApi());
        c2.selectFunction(fn('B4'));
        c2.selectedCheckerMovement = movement({ movementId: 'm-2', movementType: 'ACCEPT' });
        setMakerContext(c2, { submitResult: movement({ movementId: 'm-2' }) });
        expect(c2.isCheckerCompoundOwnSubmission).toBe(false);
        c2.selectedCheckerMovement = movement({ movementId: 'm-2', movementType: 'HONOUR' });
        expect(c2.isCheckerCompoundOwnSubmission).toBe(true);
      } finally {
        strategySpy.mockRestore();
      }

      // plain, non-compound function -> false
      const c3 = new TransactionBuilderComponent(mockApi());
      c3.selectFunction(fn('A1'));
      c3.selectedCheckerMovement = movement({ movementId: 'm-3', movementType: 'ISSUE' });
      setMakerContext(c3, { submitResult: movement({ movementId: 'm-3' }) });
      expect(c3.isCheckerCompoundOwnSubmission).toBe(false);
      expect(c3.checkerActionButtonLabel).toBe('Release');

      // isArrivalAcknowledgmentStep also fires for plain A3 (deferSettlement), independent of compound status
      const c4 = new TransactionBuilderComponent(mockApi());
      c4.selectFunction(fn('A3'));
      c4.selectedCheckerMovement = movement({ movementId: 'm-4', movementType: 'UTILIZE' });
      expect(c4.isArrivalAcknowledgmentStep).toBe(true);
      expect(c4.checkerActionButtonLabel).toBe('Approve');

      // Neither deferSettlement nor documentArrivalWithSg set (A1) -> false, even with UTILIZE.
      const c5 = new TransactionBuilderComponent(mockApi());
      c5.selectFunction(fn('A1'));
      c5.selectedCheckerMovement = movement({ movementId: 'm-5', movementType: 'UTILIZE' });
      expect(c5.isArrivalAcknowledgmentStep).toBe(false);
    });
  });

  // A4 releases via the generic Checker panel's checkerAct('release'), same as every other function.
  // makerSubmittedAt must be set or checkerAct() blocks before reaching api.release().
  describe('checkerAct() — describeApiError fallback branch', () => {
    it("checkerAct('release'): a release() error lacking err.error.message falls back to String(err)", () => {
      const api = mockApi({ release: jest.fn(() => throwError(() => 'plain string failure')) as any });
      const c = new TransactionBuilderComponent(api);
      c.selectFunction(fn('A4'));
      c.selectedCheckerMovement = movement({ movementId: 'm-1', makerSubmittedAt: '2026-08-16T00:00:00.000Z' });
      c.checkerAct('release');
      expect(c.checkerError).toBe('plain string failure');
    });
  });

  describe('Account Entries dialog (analysis/contingent-liability-ledger.html — button + pop-up dialog, business instruction 2026-08-16)', () => {
    it('openAccountEntryDialog sets accountEntryDialogMovement to the exact movement passed in', () => {
      const c = new TransactionBuilderComponent(mockApi());
      const m = movement({
        movementId: 'mv-9',
        contingentAccountEntry: {
          drAccount: "Customers' Liability under DC",
          crAccount: 'Documentary Credits Outstanding — Sight',
          currency: 'USD',
          amount: '1000',
        },
      });
      expect(c.accountEntryDialogMovement).toBeNull();
      c.openAccountEntryDialog(m, 'IPLC_LC');
      expect(c.accountEntryDialogMovement).toBe(m);
    });

    // accountEntryDialogInstrumentType is the companion field displayStatus() needs, since
    // BalanceMovement itself carries no instrumentType.
    it('openAccountEntryDialog also sets accountEntryDialogInstrumentType to the value passed in', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.accountEntryDialogInstrumentType).toBeNull();
      c.openAccountEntryDialog(movement(), 'EPLC_EXAMINATION');
      expect(c.accountEntryDialogInstrumentType).toBe('EPLC_EXAMINATION');
    });

    // Business-confirmed 2026-08-27 ("Transaction Status 與 Account Entries Status 必須保持一致") —
    // onMakerOpenAccountEntries() used to drop the emitted event's own `phase`, so the View Voucher
    // dialog opened from A4's own MAKER RESULT panel button couldn't apply the same finalize-phase
    // override MakerPanelComponent.resultPhase already derives for the Status line right above it.
    it('onMakerOpenAccountEntries forwards the emitted event\'s phase through to accountEntryDialogPhase', () => {
      const c = new TransactionBuilderComponent(mockApi());
      const m = movement({ movementId: 'mv-a4' });
      c.onMakerOpenAccountEntries({ movement: m, instrumentType: 'IPLC_LC', phase: 'finalize' });
      expect(c.accountEntryDialogMovement).toBe(m);
      expect(c.accountEntryDialogPhase).toBe('finalize');
    });

    it('onMakerOpenAccountEntries defaults accountEntryDialogPhase to null when phase is omitted/null (every non-A4 case)', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.onMakerOpenAccountEntries({ movement: movement(), instrumentType: 'IPLC_LC', phase: null });
      expect(c.accountEntryDialogPhase).toBeNull();

      c.onMakerOpenAccountEntries({ movement: movement(), instrumentType: 'IPLC_LC' });
      expect(c.accountEntryDialogPhase).toBeNull();
    });

    it('closeAccountEntryDialog resets both accountEntryDialogMovement and accountEntryDialogInstrumentType to null', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.openAccountEntryDialog(movement(), 'IPLC_LC');
      c.closeAccountEntryDialog();
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(c.accountEntryDialogInstrumentType).toBeNull();
    });

    it('onEscapeKey closes the dialog when one is open', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.openAccountEntryDialog(movement(), 'IPLC_LC');
      c.onEscapeKey();
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(c.accountEntryDialogInstrumentType).toBeNull();
    });

    it('onEscapeKey is a no-op when no dialog is open', () => {
      const c = new TransactionBuilderComponent(mockApi());
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(() => c.onEscapeKey()).not.toThrow();
      expect(c.accountEntryDialogMovement).toBeNull();
    });

    it('selectFunction() resets an open dialog (both fields) when the Maker switches business function', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.selectFunction(fn('A1'));
      c.openAccountEntryDialog(movement(), 'IPLC_LC');
      c.selectFunction(fn('A2'));
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(c.accountEntryDialogInstrumentType).toBeNull();
    });

    it('the Look Up button (onLookUpClick) resets an open dialog (both fields) before reloading the Event Timeline', () => {
      // The dialog-closing callback is a call-time parameter on runLookup(); onLookUpClick() is the real
      // UI entry point that supplies it.
      const c = new TransactionBuilderComponent(mockApi());
      c.openAccountEntryDialog(movement(), 'IPLC_LC');
      c.onLookUpClick();
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(c.accountEntryDialogInstrumentType).toBeNull();
    });

    it('lookUp.runLookup() called directly with no callback (e.g. re-running a search) does NOT close an open dialog by itself', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.openAccountEntryDialog(movement(), 'IPLC_LC');
      c.lookUp.runLookup();
      expect(c.accountEntryDialogMovement).not.toBeNull();
    });

    it('selectMode() resets an open dialog (both fields) when switching Transaction Processing <-> Inquire Events', () => {
      const c = new TransactionBuilderComponent(mockApi());
      c.openAccountEntryDialog(movement(), 'IPLC_LC');
      c.selectMode('INQUIRE');
      expect(c.accountEntryDialogMovement).toBeNull();
      expect(c.accountEntryDialogInstrumentType).toBeNull();
    });
  });
});
