import { of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import type { MakerCheckerContext } from './maker-panel.component';

/**
 * Covers: approveArrival(), arrivalAlreadyApproved, lookUp.syncFrom(), release(), reject(),
 * deleteMakerPending(), checkerAct(), onCheckerMovementPicked(), onCheckerQueueReloaded()/
 * onCheckerQueueLoadSucceeded(), runLookup(), selectLookupTab(), pagedLookupMovements/
 * lookupMovementsPaging, selectLookupSg(), selectLookupAcceptance() — the Checker-side release/reject
 * flow plus the Look Up Current Balance panel, still parent-owned after the MakerPanelComponent
 * extraction. submit() and its compound shapes moved to MakerPanelComponent — see
 * maker-panel.component.spec.ts.
 *
 * Maker context setup goes through `setMakerContext(comp, {...})`, which replaces the parent's private
 * `makerContext` mirror — the field release()/reject()/deleteMakerPending()/checkerAct() read via
 * buildCheckerActionContext().
 *
 * Direct instantiation (no TestBed).
 */

const A2 = IMPORT_FUNCTIONS.find((f) => f.code === 'A2')!;
const A3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3')!;
const A3S = IMPORT_FUNCTIONS.find((f) => f.code === 'A3S')!;
const A4 = IMPORT_FUNCTIONS.find((f) => f.code === 'A4')!;
const A6 = IMPORT_FUNCTIONS.find((f) => f.code === 'A6')!;
const B3 = EXPORT_FUNCTIONS.find((f) => f.code === 'B3')!;
const B4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4')!;
const B5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5')!;

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
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

function makeSnapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
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

function makeMovement(overrides: any = {}): any {
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

/** lookUp.lookupMovements/acceptanceMovements/sgMovements are InquiredEvent[], not raw BalanceMovement[]. */
function makeEventRow(overrides: any = {}): any {
  return { movement: makeMovement(), contract: makeContract(), eventTime: '2026-01-01T00:00:00Z', eventStatus: 'PENDING', phase: 'primary', ...overrides };
}

function apiErr(message: string) {
  return throwError(() => ({ error: { message } }));
}

function makeApi() {
  return {
    createMovement: jest.fn(() => of({ body: { movementId: 'mv-new', status: 'PENDING' } })),
    release: jest.fn(() => of({ movementId: 'mv-released', status: 'RELEASED' })),
    reject: jest.fn(() => of({ movementId: 'mv-rejected', status: 'REJECTED' })),
    cancel: jest.fn(() => of({ movementId: 'mv-cancelled', status: 'CANCELLED' })),
    resolveContract: jest.fn(() => of(makeContract())),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getSnapshot: jest.fn(() => of(makeSnapshot())),
    listMovements: jest.fn(() => of([] as any[])),
    findByBusinessEventId: jest.fn(() => of([] as any[])),
  };
}

function setup() {
  const api = makeApi();
  const comp = new TransactionBuilderComponent(api as unknown as BalanceComponentApiService);
  return { comp, api };
}

/** Replaces the parent's private `makerContext` mirror directly. Defaults mirror selectFunction()'s fresh-makerContext shape. */
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

describe('TransactionBuilderComponent — Maker/Checker action flow', () => {
  // ---------------------------------------------------------------------
  // approveArrival()
  // ---------------------------------------------------------------------
  // approveArrival() always sets arrivalApproved locally and never calls the backend (B3 no longer sets
  // deferSettlement — see balance-component.model.ts). A3 is its only remaining caller.
  describe('approveArrival()', () => {
    it('always sets arrivalApproved locally, never calls the backend', () => {
      const { comp } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement();

      comp.approveArrival();

      expect(comp.arrivalApproved).toBe(true);
    });

    it('with no selectedCheckerMovement, still just sets arrivalApproved locally', () => {
      const { comp } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = null;

      comp.approveArrival();

      expect(comp.arrivalApproved).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // arrivalAlreadyApproved
  // ---------------------------------------------------------------------
  // Combines the per-session `arrivalApproved` flag with the persisted `acknowledgedAt` — a
  // re-searched, already-acknowledged item must not look re-enabled and 409 on a second click.
  describe('arrivalAlreadyApproved', () => {
    it('true when this session already clicked Approve (arrivalApproved), even with no persisted acknowledgedAt', () => {
      const { comp } = setup();
      comp.arrivalApproved = true;
      comp.selectedCheckerMovement = makeMovement({ acknowledgedAt: null });
      expect(comp.arrivalAlreadyApproved).toBe(true);
    });

    it('true when the selected item was already acknowledged in an EARLIER session — the exact reported gap', () => {
      const { comp } = setup();
      comp.arrivalApproved = false;
      comp.selectedCheckerMovement = makeMovement({ acknowledgedAt: '2026-08-18T07:21:34.406Z', acknowledgedBy: 'checker1' });
      expect(comp.arrivalAlreadyApproved).toBe(true);
    });

    it('false when neither signal is set (a genuinely not-yet-approved item)', () => {
      const { comp } = setup();
      comp.arrivalApproved = false;
      comp.selectedCheckerMovement = makeMovement({ acknowledgedAt: null });
      expect(comp.arrivalAlreadyApproved).toBe(false);
    });

    it('false with no selectedCheckerMovement at all', () => {
      const { comp } = setup();
      comp.arrivalApproved = false;
      comp.selectedCheckerMovement = null;
      expect(comp.arrivalAlreadyApproved).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // lookUp.syncFrom() — child instrumentType -> parent LC/Confirmation mapping
  // ---------------------------------------------------------------------
  // syncFrom() must map every CHILD instrumentType to its PARENT LC/Confirmation before resolving — a
  // child's own natural key needs a second field (ibNumber/sgNumber) that syncFrom() always clears.
  describe('lookUp.syncFrom() — child instrumentType -> parent LC/Confirmation mapping', () => {
    it.each([
      ['IPLC_ACCEPTANCE', 'IPLC_LC'],
      ['SHGT', 'IPLC_LC'],
      ['EPLC_ACCEPTANCE', 'EPLC_CONFIRMATION'],
      ['EPLC_EXAMINATION', 'EPLC_CONFIRMATION'], // the reported gap — was staying 'EPLC_EXAMINATION'
      ['IPLC_LC', 'IPLC_LC'], // already an LC-level type — passes through unchanged
      ['EPLC_CONFIRMATION', 'EPLC_CONFIRMATION'],
    ])('%s resolves Look Up to its LC/Confirmation-level type %s', (childType, expectedLookupType) => {
      const { comp, api } = setup();

      comp.lookUp.syncFrom('E001', childType as any);

      expect(comp.lookUp.lookup.instrumentType).toBe(expectedLookupType);
      expect(api.resolveContract).toHaveBeenCalledWith(expectedLookupType, expect.objectContaining({ lcNumber: 'E001' }));
    });
  });

  // ---------------------------------------------------------------------
  // release()
  // ---------------------------------------------------------------------
  describe('release()', () => {
    it('no-ops when there is no submitResult.movementId', () => {
      const { comp, api } = setup();
      // makerContext.submitResult is already null by default (selectFunction() never called).

      comp.release();

      expect(api.release).not.toHaveBeenCalled();
    });

    it('plain path: single release call, success resets actionBusy and — per the 2026-08-17 auto-reset UX — returns to the SAME function with a fresh screen instead of leaving submitResult set', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-amend', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(of({ movementId: 'mv-amend', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenCalledWith('mv-amend', 'checker1');
      expect(comp.selectedFunction).toBe(A2);
      // A genuine 'released' outcome re-invokes selectFunction(A2), whose own reset rebuilds a fresh
      // makerContext — submitResult is null again, not left at the compound's own final leg response.
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toBe('Release completed (movement mv-amend) — screen reset for a new A2 (LC Amendment) transaction.');
    });

    it('plain path: derives checker2 when createdBy is not maker1', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      setMakerContext(comp, { createdBy: 'maker2', submitResult: makeMovement({ movementId: 'mv-amend', status: 'PENDING' }) });

      comp.release();

      expect(api.release).toHaveBeenCalledWith('mv-amend', 'checker2');
    });

    it('plain path: a failed release sets submitError and resets actionBusy', () => {
      const { comp, api } = setup();
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);
      comp.selectFunction(A2);
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-amend', status: 'PENDING' }) });

      comp.release();

      expect(comp.makerOutcomeSignal).toEqual({ kind: 'failed', message: 'ILLEGAL_STATE_TRANSITION' });
      expect(comp.actionBusy).toBe(false);
    });

    it('A6 settlesDocumentArrival: releases the source Document Arrival FIRST, then the Acceptance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      setMakerContext(comp, {
        createdBy: 'maker1',
        selectedPayMovement: makeMovement({ movementId: 'mv-doc-arrival', sourceTransactionRef: 'IB01' }),
        submitResult: makeMovement({ movementId: 'mv-acceptance', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-doc-arrival', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'checker1');
      // A genuine 'released' outcome returns to the same function with a fresh screen.
      expect(comp.selectedFunction).toBe(A6);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-acceptance');
    });

    it('A6: a failed source release NEVER attempts to release the Acceptance', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-doc-arrival', sourceTransactionRef: 'IB01' }),
        submitResult: makeMovement({ movementId: 'mv-acceptance', status: 'PENDING' }),
      });
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Could not release the Document Arrival (IB01) — Acceptance NOT approved: ILLEGAL_STATE_TRANSITION',
      });
      expect(comp.actionBusy).toBe(false);
    });

    it('A6: source release succeeds but the Acceptance release fails', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-doc-arrival', sourceTransactionRef: 'IB01' }),
        submitResult: makeMovement({ movementId: 'mv-acceptance', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Document Arrival released, but the Confirmation Honour/Accept itself failed to release: ILLEGAL_STATE_TRANSITION',
      });
      expect(comp.actionBusy).toBe(false);
    });

    it('A3S documentArrivalWithSg: releases the SG redemption for real, then acknowledges the Document Arrival WITHOUT a second real release call', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      setMakerContext(comp, { arrivalSgRedeemMovementId: 'mv-sg-redeem', submitResult: makeMovement({ movementId: 'mv-doc-arrival', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(of({ movementId: 'mv-sg-redeem', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(api.release).toHaveBeenCalledWith('mv-sg-redeem', 'checker1');
      expect(comp.arrivalApproved).toBe(true);
      expect(comp.actionBusy).toBe(false);
    });

    it('A3S: a failed SG release leaves the Document Arrival un-acknowledged', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      setMakerContext(comp, { arrivalSgRedeemMovementId: 'mv-sg-redeem', submitResult: makeMovement({ movementId: 'mv-doc-arrival', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Could not release the Shipping Guarantee redemption — Document Arrival NOT acknowledged: ILLEGAL_STATE_TRANSITION',
      });
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.actionBusy).toBe(false);
    });

    it('B5 settlesAcceptanceOnMature: releases the Acceptance then the matching Receivable, then auto-resets to a fresh B5 screen', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      setMakerContext(comp, { matchedReceivableMovementId: 'mv-receivable', submitResult: makeMovement({ movementId: 'mv-settle', status: 'PENDING' }) });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-settle', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-receivable', 'checker1');
      // See the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B5);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-settle');
    });

    it('B5: a failed Acceptance release never releases the Receivable', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      setMakerContext(comp, { matchedReceivableMovementId: 'mv-receivable', submitResult: makeMovement({ movementId: 'mv-settle', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(comp.makerOutcomeSignal).toEqual({ kind: 'failed', message: 'ILLEGAL_STATE_TRANSITION' });
    });

    it('B5: Acceptance release succeeds but the Receivable release fails', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      setMakerContext(comp, { matchedReceivableMovementId: 'mv-receivable', submitResult: makeMovement({ movementId: 'mv-settle', status: 'PENDING' }) });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Acceptance settled, but the matching Reimbursement Receivable failed to release: ILLEGAL_STATE_TRANSITION',
      });
    });

    // B4's source (B3's Present Docs earmark) is independently Checker-Released before B4 picks it, so
    // B4's compound release never re-releases it.
    it('B4 Sight full compound release: Confirmation HONOUR -> Due from Issuing Bank asset (does NOT re-release the already-RELEASED B3 source)', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-b3', movementType: 'CREATE', sourceTransactionRef: 'EB01' }),
        dueFromIssuingBankMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-honour', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-honour', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-honour', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-receivable', 'checker1');
      expect(api.release).toHaveBeenCalledTimes(2);
      // See the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B4);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-honour');
    });

    it('B4 Sight: the final Due from Issuing Bank release failing surfaces its own compound error', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-b3' }),
        dueFromIssuingBankMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-honour', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-honour', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Confirmation Honour released, but the Due from Issuing Bank asset failed to release: ILLEGAL_STATE_TRANSITION',
      });
    });

    it('B4 Usance full compound release: ACCEPT -> Acceptance liability -> Receivable asset (does NOT re-release the already-RELEASED B3 source)', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-b3', movementType: 'ACCEPT' }),
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-accept', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-accept', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(3, 'mv-receivable', 'checker1');
      expect(api.release).toHaveBeenCalledTimes(3);
      // See the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B4);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.releaseSuccessHint).toContain('mv-accept');
    });

    it('B4 Usance: the Acceptance liability release failing stops before the Receivable leg', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-b3' }),
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-accept', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(2);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Confirmation accepted, but the Acceptance liability failed to release: ILLEGAL_STATE_TRANSITION',
      });
    });

    it('B4 Usance: the Receivable release failing is its own final compound error', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        selectedPayMovement: makeMovement({ movementId: 'mv-b3' }),
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-accept', status: 'PENDING' }),
      });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.release();

      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Acceptance released, but the Reimbursement Receivable asset failed to release: ILLEGAL_STATE_TRANSITION',
      });
    });
  });

  // ---------------------------------------------------------------------
  // reject()
  // ---------------------------------------------------------------------
  describe('reject()', () => {
    it('no-ops when there is no submitResult.movementId', () => {
      const { comp, api } = setup();

      comp.reject();

      expect(api.reject).not.toHaveBeenCalled();
    });

    it('success: calls api.reject with checker1/MANUAL_TEST_REJECT and updates submitResult', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.reject.mockReturnValueOnce(of({ movementId: 'mv-1', status: 'REJECTED' }) as any);

      comp.reject();

      expect(api.reject).toHaveBeenCalledWith('mv-1', 'checker1', 'MANUAL_TEST_REJECT');
      // reject() forwards its outcome via makerOutcomeSignal, not by mutating makerContext directly.
      expect(comp.makerOutcomeSignal).toEqual({ kind: 'released', result: { movementId: 'mv-1', status: 'REJECTED' } });
      expect(comp.actionBusy).toBe(false);
    });

    it('error: sets submitError and resets actionBusy', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.reject.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.reject();

      expect(comp.makerOutcomeSignal).toEqual({ kind: 'failed', message: 'NOT_FOUND' });
      expect(comp.actionBusy).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // deleteMakerPending() — Maker EC / Cancel, distinct from reject()
  // ---------------------------------------------------------------------
  describe('deleteMakerPending()', () => {
    it('no-ops when there is no submitResult, or status is not PENDING', () => {
      const { comp, api } = setup();
      comp.deleteMakerPending();
      expect(api.cancel).not.toHaveBeenCalled();

      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'RELEASED' }) });
      comp.deleteMakerPending();
      expect(api.cancel).not.toHaveBeenCalled();
    });

    it('plain path: calls api.cancel with createdBy/MAKER_EC, distinct from reject()', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.cancel.mockReturnValueOnce(of({ movementId: 'mv-1', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledWith('mv-1', 'maker1', 'MAKER_EC');
      expect(api.reject).not.toHaveBeenCalled();
      expect(comp.makerOutcomeSignal).toEqual({ kind: 'released', result: { movementId: 'mv-1', status: 'CANCELLED' }, syncLookup: true });
      expect(comp.actionBusy).toBe(false);
    });

    it('plain path: a failed cancel sets submitError', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(comp.makerOutcomeSignal).toEqual({ kind: 'failed', message: 'ILLEGAL_STATE_TRANSITION' });
    });

    it('A3S: cancels the linked SG redemption FIRST, then the primary Document Arrival', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      setMakerContext(comp, {
        createdBy: 'maker1',
        arrivalSgRedeemMovementId: 'mv-sg-redeem',
        submitResult: makeMovement({ movementId: 'mv-doc-arrival', status: 'PENDING' }),
      });
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-sg-redeem', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-sg-redeem', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-doc-arrival', 'maker1', 'MAKER_EC');
      expect(comp.makerOutcomeSignal).toEqual({ kind: 'released', result: { movementId: 'mv-doc-arrival', status: 'CANCELLED' }, syncLookup: true });
    });

    it('A3S: a failed SG cancel leaves the primary un-cancelled', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      setMakerContext(comp, { arrivalSgRedeemMovementId: 'mv-sg-redeem', submitResult: makeMovement({ movementId: 'mv-doc-arrival', status: 'PENDING' }) });
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Could not delete the Shipping Guarantee redemption — Document Arrival NOT deleted: ILLEGAL_STATE_TRANSITION',
      });
    });

    it('B4 Sight (createsIssuingBankReceivableOnHonour): cancels the asset FIRST, then the primary HONOUR', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        createdBy: 'maker1',
        dueFromIssuingBankMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-honour', status: 'PENDING' }),
      });
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-honour', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-receivable', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-honour', 'maker1', 'MAKER_EC');
    });

    it('B4 Sight: a failed asset cancel leaves the Confirmation Honour un-cancelled', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, { dueFromIssuingBankMovementId: 'mv-receivable', submitResult: makeMovement({ movementId: 'mv-honour', status: 'PENDING' }) });
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Could not delete the Due from Issuing Bank asset — Confirmation Honour NOT deleted: ILLEGAL_STATE_TRANSITION',
      });
    });

    it('B4 Usance: cancels the Receivable, THEN the Acceptance, THEN the primary ACCEPT, in reverse-creation order', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        createdBy: 'maker1',
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-accept', status: 'PENDING' }),
      });
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-receivable', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(3, 'mv-accept', 'maker1', 'MAKER_EC');
    });

    it('B4 Usance: a failed Receivable cancel never attempts the Acceptance/primary cancel', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-accept', status: 'PENDING' }),
      });
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Could not delete the Reimbursement Receivable asset — Acceptance NOT deleted: ILLEGAL_STATE_TRANSITION',
      });
    });

    it('B4 Usance: Receivable cancel succeeds but Acceptance cancel fails', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, {
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-accept', status: 'PENDING' }),
      });
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(2);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Reimbursement Receivable deleted, but the Acceptance liability could not be — Confirmation Accept NOT deleted: ILLEGAL_STATE_TRANSITION',
      });
    });

    it('B5 settlesAcceptanceOnMature: cancels the matching Receivable FIRST, then the primary Settle', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      setMakerContext(comp, {
        createdBy: 'maker1',
        matchedReceivableMovementId: 'mv-receivable',
        submitResult: makeMovement({ movementId: 'mv-settle', status: 'PENDING' }),
      });
      api.cancel
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'CANCELLED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'CANCELLED' }) as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenNthCalledWith(1, 'mv-receivable', 'maker1', 'MAKER_EC');
      expect(api.cancel).toHaveBeenNthCalledWith(2, 'mv-settle', 'maker1', 'MAKER_EC');
    });

    it('B5: a failed Receivable cancel leaves the primary Settle un-cancelled', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      setMakerContext(comp, { matchedReceivableMovementId: 'mv-receivable', submitResult: makeMovement({ movementId: 'mv-settle', status: 'PENDING' }) });
      api.cancel.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);

      comp.deleteMakerPending();

      expect(api.cancel).toHaveBeenCalledTimes(1);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Could not delete the matching Reimbursement Receivable — Acceptance Settle NOT deleted: ILLEGAL_STATE_TRANSITION',
      });
    });
  });

  // ---------------------------------------------------------------------
  // checkerAct()
  // ---------------------------------------------------------------------
  describe('checkerAct()', () => {
    it('no-ops when nothing is selected in the Checker queue', () => {
      const { comp, api } = setup();
      comp.selectedCheckerMovement = null;

      comp.checkerAct('release');

      expect(api.release).not.toHaveBeenCalled();
      expect(api.reject).not.toHaveBeenCalled();
    });

    it('dispatches to release() when isCheckerCompoundOwnSubmission and action=release', () => {
      const { comp } = setup();
      comp.selectFunction(A6);
      // referencedTransactionId is required — a real A6 CREATE always carries one; submitResult need
      // not match.
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-1', referencedTransactionId: 'mv-source' });
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1' }) });
      const releaseSpy = jest.spyOn(comp, 'release').mockImplementation(() => undefined);
      const rejectSpy = jest.spyOn(comp, 'reject').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(releaseSpy).toHaveBeenCalledTimes(1);
      expect(rejectSpy).not.toHaveBeenCalled();
    });

    it('dispatches to reject() when isCheckerCompoundOwnSubmission and action=reject', () => {
      const { comp } = setup();
      comp.selectFunction(A3S);
      // businessEventId is required — a real A3S UTILIZE always carries one; submitResult need not match.
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-1', businessEventId: 'be-1' });
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1' }) });
      const releaseSpy = jest.spyOn(comp, 'release').mockImplementation(() => undefined);
      const rejectSpy = jest.spyOn(comp, 'reject').mockImplementation(() => undefined);

      comp.checkerAct('reject');

      expect(rejectSpy).toHaveBeenCalledTimes(1);
      expect(releaseSpy).not.toHaveBeenCalled();
    });

    it('deferSettlement + release + matching movementType (A3): routes through approveArrival(), never api.release', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-2', movementType: 'UTILIZE' });
      // not the same submission -> isCheckerCompoundOwnSubmission false
      const approveSpy = jest.spyOn(comp, 'approveArrival').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(approveSpy).toHaveBeenCalledTimes(1);
      expect(api.release).not.toHaveBeenCalled();
    });

    it('deferSettlement + reject (A3): does NOT call approveArrival, calls api.reject directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-2', movementType: 'UTILIZE' });
      const approveSpy = jest.spyOn(comp, 'approveArrival').mockImplementation(() => undefined);

      comp.checkerAct('reject');

      expect(approveSpy).not.toHaveBeenCalled();
      expect(api.reject).toHaveBeenCalledWith('mv-2', comp.checkerId, 'MANUAL_QUEUE_REJECT');
    });

    // B3 no longer sets deferSettlement, so checkerAct('release') falls through to the plain api.release path.
    it('B3 (no longer deferSettlement): checkerAct release calls api.release directly, never approveArrival()', () => {
      const { comp, api } = setup();
      comp.selectFunction(B3);
      comp.checkerId = 'checker8';
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-3', movementType: 'CREATE' });
      const approveSpy = jest.spyOn(comp, 'approveArrival').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(approveSpy).not.toHaveBeenCalled();
      expect(api.release).toHaveBeenCalledWith('mv-3', 'checker8');
    });

    it('plain path (A2, no defer/compound flags): release calls api.release directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.checkerId = 'checker7';
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });

      comp.checkerAct('release');

      expect(api.release).toHaveBeenCalledWith('mv-4', 'checker7');
      expect(comp.checkerBusy).toBe(false);
    });

    // A4's UTILIZE uses the same plain fallback path as A2; gated on makerSubmittedAt (a real A4 Submit
    // always sets it).
    it('plain path (A4, no defer/compound flags): a Checker-picked, Maker-submitted UTILIZE releases via api.release directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A4);
      comp.checkerId = 'checker9';
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-a4', movementType: 'UTILIZE', makerSubmittedAt: '2026-08-16T00:00:00.000Z' });

      comp.checkerAct('release');

      expect(api.release).toHaveBeenCalledWith('mv-a4', 'checker9');
      expect(comp.checkerBusy).toBe(false);
    });

    // Without this gate a Checker could release A4's own item before any Maker used Submit A4.
    it("A4: release is BLOCKED with a clear checkerError when the picked item's makerSubmittedAt is not set (Maker never clicked Submit A4)", () => {
      const { comp, api } = setup();
      comp.selectFunction(A4);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-a4-unsubmitted', movementType: 'UTILIZE', makerSubmittedAt: null });

      comp.checkerAct('release');

      expect(api.release).not.toHaveBeenCalled();
      expect(comp.checkerError).toMatch(/has not been Submitted by a Maker yet/);
    });

    it('A4: reject is NOT gated by makerSubmittedAt — a Checker may decline an unsubmitted item directly', () => {
      const { comp, api } = setup();
      comp.selectFunction(A4);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-a4-unsubmitted', movementType: 'UTILIZE', makerSubmittedAt: null });

      comp.checkerAct('reject');

      expect(api.reject).toHaveBeenCalledWith('mv-a4-unsubmitted', comp.checkerId, 'MANUAL_QUEUE_REJECT');
    });

    it('plain path: reject calls api.reject with MANUAL_QUEUE_REJECT', () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });

      comp.checkerAct('reject');

      expect(api.reject).toHaveBeenCalledWith('mv-4', comp.checkerId, 'MANUAL_QUEUE_REJECT');
    });

    it('plain path: a failed release sets checkerError and resets checkerBusy', () => {
      const { comp, api } = setup();
      api.release.mockReturnValueOnce(apiErr('ILLEGAL_STATE_TRANSITION') as any);
      comp.selectFunction(A2);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });

      comp.checkerAct('release');

      expect(comp.checkerError).toBe('ILLEGAL_STATE_TRANSITION');
      expect(comp.checkerBusy).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // loadCheckerQueue()/onSelectCheckerMovement() moved to CheckerPanelComponent — see
  // checker-panel.component.spec.ts. onCheckerMovementPicked()'s arrivalApproved-reset is covered below.
  // ---------------------------------------------------------------------

  describe('onCheckerMovementPicked()', () => {
    it('mirrors the picked movement and clears any stale arrivalApproved flag', () => {
      const { comp } = setup();
      comp.arrivalApproved = true;

      comp.onCheckerMovementPicked(makeMovement({ movementId: 'm2' }));

      expect(comp.selectedCheckerMovement?.movementId).toBe('m2');
      expect(comp.arrivalApproved).toBe(false);
    });

    it('mirrors a null pick (implicit reset from the child) the same way', () => {
      const { comp } = setup();
      comp.selectedCheckerMovement = makeMovement({ movementId: 'stale' });
      comp.arrivalApproved = true;

      comp.onCheckerMovementPicked(null);

      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
    });
  });

  describe('onCheckerQueueReloaded() / onCheckerQueueLoadSucceeded()', () => {
    it('onCheckerQueueReloaded() clears a stale checkerError', () => {
      const { comp } = setup();
      comp.checkerError = 'stale';

      comp.onCheckerQueueReloaded();

      expect(comp.checkerError).toBeNull();
    });

    it("onCheckerQueueLoadSucceeded() delegates to syncLookupToContext() (via lookUp.syncFrom), reading the Maker's own last-known instrumentType/lcNumber carried by onMakerSyncRequested()", () => {
      const { comp } = setup();
      comp.selectFunction(A2);
      // Mirrors what a real MakerPanelComponent.emitSync() -> onMakerSyncRequested() call carries.
      comp.onMakerSyncRequested({ lcNumber: 'LC-SYNC', secondaryRef: null, alsoSyncLookup: false, instrumentType: 'IPLC_LC' });
      const syncFromSpy = jest.spyOn(comp.lookUp, 'syncFrom');

      comp.onCheckerQueueLoadSucceeded();

      expect(syncFromSpy).toHaveBeenCalledWith('LC-SYNC', 'IPLC_LC', expect.any(Function));
    });
  });

  // ---------------------------------------------------------------------
  // runLookup()
  // ---------------------------------------------------------------------
  describe('runLookup()', () => {
    it('success: resolves the contract, snapshot, and event timeline (sorted by true Event Date/Time, not eventSeq)', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(
        of(makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', sgNumber: 'SG01', ibNumber: null } })) as any,
      );
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot({ availableBalance: '750' })) as any);
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm2', eventSeq: 2, createdAt: '2026-08-18T02:00:00.000Z' }),
          makeMovement({ movementId: 'm1', eventSeq: 1, createdAt: '2026-08-18T01:00:00.000Z' }),
        ]) as any,
      );
      comp.lookUp.lookup = { instrumentType: 'SHGT', lcNumber: 'LC001', ibNumber: '', sgNumber: 'SG01' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupResult?.snapshot.availableBalance).toBe('750');
      expect(comp.lookUp.lookupMovements.map((row: any) => row.movement.movementId)).toEqual(['m1', 'm2']);
      expect(comp.lookUp.lookupError).toBeNull();
      // SHGT has no Acceptance-tab type and isn't IPLC_LC, so neither extra catalog fetch fires.
    });

    // A finalized Sight IPLC_LC/UTILIZE splits into 'create'/'finalize' rows, the same toEventRows()
    // split Inquire Events applies — not a single row reading the current status straight off it.
    it('a finalized Sight IPLC_LC/UTILIZE splits into its own create+finalize rows, matching Inquire Events exactly — not a single row with the raw current status', () => {
      const { comp, api } = setup();
      const sightLc = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const finalizedUtilize = makeMovement({
        movementId: 'mv-utilize',
        movementType: 'UTILIZE',
        status: 'RELEASED',
        eventSeq: 2,
        createdAt: '2026-08-18T01:00:00.000Z',
        releasedAt: '2026-08-18T05:00:00.000Z',
      });
      api.resolveContract.mockReturnValueOnce(of(sightLc) as any);
      api.listMovements.mockReturnValueOnce(of([finalizedUtilize]) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements).toHaveLength(2);
      const [createRow, finalizeRow] = comp.lookUp.lookupMovements;
      expect(createRow.phase).toBe('create');
      // The 'create' row's eventStatus is the movement's real current status, not a stale forced PENDING.
      expect(createRow.eventStatus).toBe('RELEASED');
      expect(createRow.eventTime).toBe('2026-08-18T01:00:00.000Z');
      expect(finalizeRow.phase).toBe('finalize');
      expect(finalizeRow.eventStatus).toBe('RELEASED');
      expect(finalizeRow.eventTime).toBe('2026-08-18T05:00:00.000Z');
      // Both rows share the SAME underlying movement — the split is presentational, not two real records.
      expect(createRow.movement).toBe(finalizeRow.movement);
      // The 'finalize' row is A4's own Release, not A3/A3S's earmark, so it displays APPROVED; the
      // 'create' row is still the earmark, so it displays EARMARKED.
      expect(comp.displayStatus(createRow.eventStatus, createRow.contract.instrumentType, createRow.movement.movementType, createRow.phase)).toBe('EARMARKED');
      expect(comp.displayStatus(finalizeRow.eventStatus, finalizeRow.contract.instrumentType, finalizeRow.movement.movementType, finalizeRow.phase)).toBe(
        'APPROVED',
      );
      // lookUp.functionFor() delegates to the same functionForEvent() free function as
      // InquireEventsService.functionFor() — no separate Function mapping.
      expect(comp.lookUp.functionFor(createRow)?.code).toBe('A3');
      expect(comp.lookUp.functionFor(finalizeRow)?.code).toBe('A4');
    });

    // toEventRows() never splits a still-PENDING movement — isFinalizedSightUtilize requires status !== 'PENDING'.
    it('a NOT-yet-finalized Sight IPLC_LC/UTILIZE (still genuinely PENDING) stays a single row showing EARMARKING, never splits', () => {
      const { comp, api } = setup();
      const sightLc = makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' });
      const stillPendingUtilize = makeMovement({
        movementId: 'mv-utilize-pending',
        movementType: 'UTILIZE',
        status: 'PENDING',
        eventSeq: 2,
        createdAt: '2026-08-18T01:00:00.000Z',
      });
      api.resolveContract.mockReturnValueOnce(of(sightLc) as any);
      api.listMovements.mockReturnValueOnce(of([stillPendingUtilize]) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements).toHaveLength(1);
      const [row] = comp.lookUp.lookupMovements;
      expect(row.phase).toBe('primary');
      expect(row.eventStatus).toBe('PENDING');
      expect(comp.displayStatus(row.eventStatus, row.contract.instrumentType, row.movement.movementType, row.phase)).toBe('EARMARKING');
    });

    it('resolveContract error sets lookupError and leaves lookupResult null', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC999', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupError).toBe('NOT_FOUND');
      expect(comp.lookUp.lookupResult).toBeNull();
    });

    it('getSnapshot error (after a successful resolveContract) sets lookupError', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract()) as any);
      api.getSnapshot.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupError).toBe('NOT_FOUND');
    });

    it('IPLC_LC contract: fetches both Acceptance and SG candidates, auto-selecting a sole candidate on each', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' })) as any);
      api.catalog
        .mockReturnValueOnce(
          of({ items: [makeContract({ balanceContractId: 'bc-acc-1', instrumentType: 'IPLC_ACCEPTANCE' })], total: 1, page: 1, pageSize: 50 }) as any,
        )
        .mockReturnValueOnce(of({ items: [makeContract({ balanceContractId: 'bc-sg-1', instrumentType: 'SHGT' })], total: 1, page: 1, pageSize: 50 }) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(api.catalog).toHaveBeenCalledWith('IPLC_ACCEPTANCE', undefined, undefined, 1, 50, 'LC001');
      expect(api.catalog).toHaveBeenCalledWith('SHGT', undefined, undefined, 1, 50, 'LC001');
      expect(comp.lookUp.acceptancesUnderLookup.map((c) => c.balanceContractId)).toEqual(['bc-acc-1']);
      expect(comp.lookUp.sgsUnderLookup.map((c) => c.balanceContractId)).toEqual(['bc-sg-1']);
      // Sole candidate on each tab auto-selects.
      expect(comp.lookUp.selectedLookupAcceptance?.balanceContractId).toBe('bc-acc-1');
      expect(comp.lookUp.selectedLookupSg?.balanceContractId).toBe('bc-sg-1');
    });

    it('EPLC_CONFIRMATION contract: fetches Acceptance candidates (EPLC_ACCEPTANCE) only, never SG', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' })) as any);
      comp.lookUp.lookup = { instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(api.catalog).toHaveBeenCalledWith('EPLC_ACCEPTANCE', undefined, undefined, 1, 50, 'LC001');
      expect(api.catalog).not.toHaveBeenCalledWith('SHGT', undefined, undefined, 1, 50, 'LC001');
    });

    // Tab 1's Event Timeline used to fetch only the LC's own contract, so each B3/EPLC_EXAMINATION
    // Earmark event (its own separate per-E01/E02/E03 contract) was invisible here.
    it('EPLC_CONFIRMATION contract: merges every B3/EPLC_EXAMINATION Earmark event into the LC tab timeline, sorted by true Event Date/Time across contracts', () => {
      const { comp, api } = setup();
      const confirmationLc = makeContract({
        balanceContractId: 'bc-conf-1',
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'U01', ibNumber: null, sgNumber: null },
      });
      const examE01 = makeContract({
        balanceContractId: 'bc-exam-e01',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'U01', ibNumber: 'E01', sgNumber: null },
      });
      const examE02 = makeContract({
        balanceContractId: 'bc-exam-e02',
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'U01', ibNumber: 'E02', sgNumber: null },
      });
      api.resolveContract.mockReturnValueOnce(of(confirmationLc) as any);
      (api.catalog as any).mockImplementation((instrumentType: string) =>
        instrumentType === 'EPLC_EXAMINATION'
          ? of({ items: [examE01, examE02], total: 2, page: 1, pageSize: 50 })
          : of({ items: [], total: 0, page: 1, pageSize: 50 }),
      );
      (api.listMovements as any).mockImplementation((contractId: string) => {
        if (contractId === 'bc-conf-1')
          return of([makeMovement({ movementId: 'mv-issue', movementType: 'ISSUE', status: 'RELEASED', createdAt: '2026-08-18T01:00:00.000Z' })]);
        if (contractId === 'bc-exam-e01')
          return of([makeMovement({ movementId: 'mv-exam-e01', movementType: 'CREATE', status: 'RELEASED', createdAt: '2026-08-18T02:00:00.000Z' })]);
        if (contractId === 'bc-exam-e02')
          return of([makeMovement({ movementId: 'mv-exam-e02', movementType: 'CREATE', status: 'PENDING', createdAt: '2026-08-18T03:00:00.000Z' })]);
        return of([]);
      });
      comp.lookUp.lookup = { instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'U01', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements.map((row: any) => row.movement.movementId)).toEqual(['mv-issue', 'mv-exam-e01', 'mv-exam-e02']);
      const [issueRow, e01Row, e02Row] = comp.lookUp.lookupMovements;
      expect(issueRow.contract.instrumentType).toBe('EPLC_CONFIRMATION');
      expect(e01Row.contract.instrumentType).toBe('EPLC_EXAMINATION');
      expect(e01Row.contract.naturalKey.ibNumber).toBe('E01');
      expect(e02Row.contract.naturalKey.ibNumber).toBe('E02');
      // Same shared isEarmarkFunction logic both screens use.
      expect(comp.displayStatus(e01Row.eventStatus, e01Row.contract.instrumentType, e01Row.movement.movementType, e01Row.phase)).toBe('EARMARKED');
      expect(comp.displayStatus(e02Row.eventStatus, e02Row.contract.instrumentType, e02Row.movement.movementType, e02Row.phase)).toBe('EARMARKING');
    });

    it('listMovements error resets lookupMovements to empty (independent of a successful resolveContract/getSnapshot)', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract()) as any);
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookupMovements = [makeEventRow()];
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupMovements).toEqual([]);
    });

    it('a failed Acceptance-candidates catalog fetch resets acceptancesUnderLookup to empty', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' })) as any);
      api.catalog.mockReturnValueOnce(apiErr('NOT_FOUND') as any).mockReturnValueOnce(of({ items: [], total: 0, page: 1, pageSize: 50 }) as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.acceptancesUnderLookup).toEqual([]);
    });

    it('a failed SG-candidates catalog fetch resets sgsUnderLookup to empty', () => {
      const { comp, api } = setup();
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' })) as any);
      api.catalog.mockReturnValueOnce(of({ items: [], total: 0, page: 1, pageSize: 50 }) as any).mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.lookUp.lookup = { instrumentType: 'IPLC_LC', lcNumber: 'LC001', ibNumber: '', sgNumber: '' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.sgsUnderLookup).toEqual([]);
    });

    it('resets any prior tab/selection state on a fresh call', () => {
      const { comp, api } = setup();
      comp.lookUp.lookupTab = 'ACCEPTANCE';
      comp.lookUp.selectedLookupAcceptance = makeContract({ balanceContractId: 'stale-acc' });
      comp.lookUp.acceptanceSnapshot = makeSnapshot();
      comp.lookUp.selectedLookupSg = makeContract({ balanceContractId: 'stale-sg' });
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'SHGT' })) as any);
      comp.lookUp.lookup = { instrumentType: 'SHGT', lcNumber: 'LC001', ibNumber: '', sgNumber: 'SG01' };

      comp.lookUp.runLookup();

      expect(comp.lookUp.lookupTab).toBe('LC');
      expect(comp.lookUp.selectedLookupAcceptance).toBeNull();
      expect(comp.lookUp.acceptanceSnapshot).toBeNull();
      expect(comp.lookUp.selectedLookupSg).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // selectLookupTab()
  // ---------------------------------------------------------------------
  describe('selectLookupTab()', () => {
    it('ACCEPTANCE tab auto-selects the sole candidate when none is yet selected', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot()) as any);

      comp.lookUp.selectLookupTab('ACCEPTANCE');

      expect(comp.lookUp.lookupTab).toBe('ACCEPTANCE');
      expect(comp.lookUp.selectedLookupAcceptance?.balanceContractId).toBe('bc-acc-1');
    });

    it('SG tab auto-selects the sole candidate when none is yet selected', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot()) as any);

      comp.lookUp.selectLookupTab('SG');

      expect(comp.lookUp.lookupTab).toBe('SG');
      expect(comp.lookUp.selectedLookupSg?.balanceContractId).toBe('bc-sg-1');
    });

    it('LC tab just switches — no auto-select side effects', () => {
      const { comp, api } = setup();

      comp.lookUp.selectLookupTab('LC');

      expect(comp.lookUp.lookupTab).toBe('LC');
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('ACCEPTANCE tab does not re-trigger auto-select when a selection already exists', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.selectedLookupAcceptance = makeContract({ balanceContractId: 'bc-acc-1' });

      comp.lookUp.selectLookupTab('ACCEPTANCE');

      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('ACCEPTANCE tab does not auto-select when there is more than one candidate', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' }), makeContract({ balanceContractId: 'bc-acc-2' })];

      comp.lookUp.selectLookupTab('ACCEPTANCE');

      expect(comp.lookUp.selectedLookupAcceptance).toBeNull();
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // pagedLookupMovements / lookupMovementsPaging
  // ---------------------------------------------------------------------
  describe('pagedLookupMovements / lookupMovementsPaging', () => {
    it('windows a >10-item movements array to 10 per page and computes totalPages', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 23 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `m${i}` }) }));

      const page1 = comp.lookUp.pagedLookupMovements;

      expect(page1).toHaveLength(10);
      expect(page1.map((r: any) => r.movement.movementId)).toEqual(Array.from({ length: 10 }, (_, i) => `m${i}`));
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(23);
      expect(comp.lookUp.lookupMovementsPaging.totalPages).toBe(3);
    });

    it('nextLookupMovementsPage()/prevLookupMovementsPage() move within bounds and refuse past either edge', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 15 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `m${i}` }) }));
      void comp.lookUp.pagedLookupMovements; // establish paging.total/totalPages for this array

      comp.lookUp.prevLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1); // already at page 1, refuses to go below

      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2);
      expect(comp.lookUp.pagedLookupMovements.map((r: any) => r.movement.movementId)).toEqual(['m10', 'm11', 'm12', 'm13', 'm14']);

      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2); // already at the last page, refuses to advance further

      comp.lookUp.prevLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
    });

    it('resets to page 1 when a fresh runLookup() replaces the LC tab movements array', () => {
      const { comp, api } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 12 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `old${i}` }) }));
      void comp.lookUp.pagedLookupMovements;
      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2);

      comp.lookUp.lookup.lcNumber = 'S01';
      api.listMovements.mockReturnValueOnce(of([{ movementId: 'mv-issue', movementType: 'ISSUE', status: 'RELEASED', createdAt: '2026-01-01T00:00:00Z' }]));
      comp.lookUp.runLookup();

      expect(comp.lookUp.pagedLookupMovements).toHaveLength(1);
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(1);
    });

    it("switching to an ALREADY-LOADED tab (no re-fetch) resets to page 1 against that tab's own array — must not carry over a stale page from a different tab", () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 25 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `lc${i}` }) }));
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.selectedLookupAcceptance = makeContract({ balanceContractId: 'bc-acc-1' });
      comp.lookUp.acceptanceMovements = Array.from({ length: 3 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `acc${i}` }) }));

      // Drive the LC tab's own timeline to page 3 first.
      void comp.lookUp.pagedLookupMovements;
      comp.lookUp.nextLookupMovementsPage();
      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(3);

      // Switch to the Acceptance tab — already has selectedLookupAcceptance set, so this does NOT re-fetch
      // (see the "does not re-trigger auto-select when a selection already exists" test above), yet the
      // paging must still land back on page 1 against the Acceptance tab's own (much shorter) array.
      comp.lookUp.selectLookupTab('ACCEPTANCE');

      const acceptancePage = comp.lookUp.pagedLookupMovements;
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(3);
      expect(acceptancePage.map((r: any) => r.movement.movementId)).toEqual(['acc0', 'acc1', 'acc2']);

      // And switching back to LC must independently restore ITS OWN paging context (page 1 of 25, not a
      // leftover page 3 or the Acceptance tab's own total of 3).
      comp.lookUp.selectLookupTab('LC');
      const lcPage = comp.lookUp.pagedLookupMovements;
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(25);
      expect(lcPage.map((r: any) => r.movement.movementId)).toEqual(Array.from({ length: 10 }, (_, i) => `lc${i}`));
    });

    it('regression — switching to a tab whose own array is currently EMPTY must not leave a stale total/page from the previous tab visible via activeLookupMovements/totalPages (bug caught live: the SG tab with 2+ un-auto-selected candidates showed "Page 2/2 (12 total)" over an empty table)', () => {
      const { comp } = setup();
      comp.lookUp.lookupMovements = Array.from({ length: 12 }, (_, i) => makeEventRow({ movement: makeMovement({ movementId: `lc${i}` }) }));
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' }), makeContract({ balanceContractId: 'bc-sg-2' })];
      comp.lookUp.sgMovements = []; // no auto-select with 2+ candidates

      // Drive the LC tab to page 2 of 2 first.
      void comp.lookUp.pagedLookupMovements;
      comp.lookUp.nextLookupMovementsPage();
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(2);
      expect(comp.lookUp.lookupMovementsPaging.total).toBe(12);

      // Switch to the SG tab — no fetch fires (2 candidates, no auto-select), so pagedLookupMovements is
      // never called by the template (activeLookupMovements.length is 0, the *ngIf table wrapper never
      // renders) — only activeLookupMovements itself gets read, by the template's own *ngIf/hint bindings.
      comp.lookUp.selectLookupTab('SG');
      void comp.lookUp.activeLookupMovements; // the ONLY binding the template guarantees gets read here

      expect(comp.lookUp.lookupMovementsPaging.total).toBe(0);
      expect(comp.lookUp.lookupMovementsPaging.page).toBe(1);
      expect(comp.lookUp.lookupMovementsPaging.totalPages).toBe(1); // Math.max(1, ceil(0/10)) — the .tb-pagination block's own totalPages > 1 guard correctly stays hidden
    });
  });

  // ---------------------------------------------------------------------
  // selectLookupSg()
  // ---------------------------------------------------------------------
  describe('selectLookupSg()', () => {
    it('found: loads snapshot + event timeline sorted by true Event Date/Time, not eventSeq', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot({ availableBalance: '250' })) as any);
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm2', eventSeq: 2, createdAt: '2026-08-18T02:00:00.000Z' }),
          makeMovement({ movementId: 'm1', eventSeq: 1, createdAt: '2026-08-18T01:00:00.000Z' }),
        ]) as any,
      );

      comp.lookUp.selectLookupSg('bc-sg-1');

      expect(comp.lookUp.selectedLookupSg?.balanceContractId).toBe('bc-sg-1');
      expect(comp.lookUp.sgSnapshot?.availableBalance).toBe('250');
      expect(comp.lookUp.sgMovements.map((row: any) => row.movement.movementId)).toEqual(['m1', 'm2']);
    });

    it('not found: resets selection, snapshot, and movements', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      comp.lookUp.sgSnapshot = makeSnapshot();
      comp.lookUp.sgMovements = [makeEventRow()];

      comp.lookUp.selectLookupSg('does-not-exist');

      expect(comp.lookUp.selectedLookupSg).toBeNull();
      expect(comp.lookUp.sgSnapshot).toBeNull();
      expect(comp.lookUp.sgMovements).toEqual([]);
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('getSnapshot/listMovements errors reset sgSnapshot/sgMovements respectively', () => {
      const { comp, api } = setup();
      comp.lookUp.sgsUnderLookup = [makeContract({ balanceContractId: 'bc-sg-1' })];
      api.getSnapshot.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.lookUp.selectLookupSg('bc-sg-1');

      expect(comp.lookUp.sgSnapshot).toBeNull();
      expect(comp.lookUp.sgMovements).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------
  // selectLookupAcceptance()
  // ---------------------------------------------------------------------
  describe('selectLookupAcceptance()', () => {
    it('found: loads snapshot + event timeline sorted by true Event Date/Time, not eventSeq, independent of the LC tab', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.lookupResult = { contract: makeContract({ balanceContractId: 'bc-lc-1' }), snapshot: makeSnapshot({ availableBalance: '999' }) };
      api.getSnapshot.mockReturnValueOnce(of(makeSnapshot({ availableBalance: '400' })) as any);
      api.listMovements.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'm2', eventSeq: 2, createdAt: '2026-08-18T02:00:00.000Z' }),
          makeMovement({ movementId: 'm1', eventSeq: 1, createdAt: '2026-08-18T01:00:00.000Z' }),
        ]) as any,
      );

      comp.lookUp.selectLookupAcceptance('bc-acc-1');

      expect(comp.lookUp.selectedLookupAcceptance?.balanceContractId).toBe('bc-acc-1');
      expect(comp.lookUp.acceptanceSnapshot?.availableBalance).toBe('400');
      expect(comp.lookUp.acceptanceMovements.map((row: any) => row.movement.movementId)).toEqual(['m1', 'm2']);
      // The LC tab's own lookupResult is untouched.
      expect(comp.lookUp.lookupResult?.snapshot.availableBalance).toBe('999');
    });

    it('not found: resets selection, snapshot, and movements', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      comp.lookUp.acceptanceSnapshot = makeSnapshot();
      comp.lookUp.acceptanceMovements = [makeEventRow()];

      comp.lookUp.selectLookupAcceptance('does-not-exist');

      expect(comp.lookUp.selectedLookupAcceptance).toBeNull();
      expect(comp.lookUp.acceptanceSnapshot).toBeNull();
      expect(comp.lookUp.acceptanceMovements).toEqual([]);
      expect(api.getSnapshot).not.toHaveBeenCalled();
    });

    it('getSnapshot/listMovements errors reset acceptanceSnapshot/acceptanceMovements respectively', () => {
      const { comp, api } = setup();
      comp.lookUp.acceptancesUnderLookup = [makeContract({ balanceContractId: 'bc-acc-1' })];
      api.getSnapshot.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      api.listMovements.mockReturnValueOnce(apiErr('NOT_FOUND') as any);

      comp.lookUp.selectLookupAcceptance('bc-acc-1');

      expect(comp.lookUp.acceptanceSnapshot).toBeNull();
      expect(comp.lookUp.acceptanceMovements).toEqual([]);
    });
  });
});
