import { Observable, forkJoin, of, throwError } from 'rxjs';
import { TransactionBuilderComponent } from './transaction-builder.component';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import type { TransactionFunction } from './balance-component.model';
import type { MakerCheckerContext } from './maker-panel.component';

/**
 * Covers: approveArrival(), arrivalAlreadyApproved, lookUp.syncFrom(), release(), reject(),
 * checkerAct(), onCheckerMovementPicked(), onCheckerQueueReloaded()/
 * onCheckerQueueLoadSucceeded(), runLookup(), selectLookupTab(), pagedLookupMovements/
 * lookupMovementsPaging, selectLookupSg(), selectLookupAcceptance() — the Checker-side release/reject
 * flow plus the Look Up Current Balance panel, still parent-owned after the MakerPanelComponent
 * extraction. submit() and its compound shapes moved to MakerPanelComponent — see
 * maker-panel.component.spec.ts. (deleteMakerPending()/withdrawMakerPending() removed 2026-08-28 —
 * Delete Pending is Maker Queue-only now, see maker-panel.component.html's own doc comment.)
 *
 * Maker context setup goes through `setMakerContext(comp, {...})`, which replaces the parent's private
 * `makerContext` mirror — the field release()/reject()/checkerAct() read via
 * buildCheckerActionContext().
 *
 * Direct instantiation (no TestBed).
 */

const A1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1')!;
const A2 = IMPORT_FUNCTIONS.find((f) => f.code === 'A2')!;
const A3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3')!;
const A3S = IMPORT_FUNCTIONS.find((f) => f.code === 'A3S')!;
const A4 = IMPORT_FUNCTIONS.find((f) => f.code === 'A4')!;
const A6 = IMPORT_FUNCTIONS.find((f) => f.code === 'A6')!;
const A7 = IMPORT_FUNCTIONS.find((f) => f.code === 'A7')!;
const B1 = EXPORT_FUNCTIONS.find((f) => f.code === 'B1')!;
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
  const api: any = {
    createMovement: jest.fn(() => of({ body: { movementId: 'mv-new', status: 'PENDING' } })),
    release: jest.fn(() => of({ movementId: 'mv-released', status: 'RELEASED' })),
    reject: jest.fn(() => of({ movementId: 'mv-rejected', status: 'REJECTED' })),
    cancel: jest.fn(() => of({ movementId: 'mv-cancelled', status: 'CANCELLED' })),
    acknowledge: jest.fn(() => of({ movementId: 'mv-acknowledged', status: 'PENDING' })),
    withdrawMakerSubmit: jest.fn(() => of({ movementId: 'mv-withdrawn', status: 'PENDING', makerSubmittedAt: null })),
    editPending: jest.fn(() => of({ movementId: 'mv-edited', status: 'PENDING', amount: '999' })),
    resolveContract: jest.fn(() => of(makeContract())),
    catalog: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    catalogWithDeletePendingHistory: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
    getSnapshot: jest.fn(() => of(makeSnapshot())),
    getContract: jest.fn(() => of(makeContract())),
    listMovements: jest.fn(() => of([] as any[])),
    findByBusinessEventId: jest.fn(() => of([] as any[])),
    releaseCompoundMovements: jest.fn((movementIds: string[], actor: string) => forkJoin(movementIds.map((id) => api.release(id, actor)))),
    executeCompoundActions: jest.fn((actions: { kind: 'release' | 'acknowledge'; movementId: string }[], actor: string) =>
      forkJoin(actions.map((action) => (action.kind === 'release' ? api.release(action.movementId, actor) : api.acknowledge(action.movementId, actor)))),
    ),
    // MakerQueueService (constructed with this same mock via TransactionBuilderComponent's own default
    // param) calls this internally after a successful deletePending()/withdrawMakerSubmit() — needed for
    // onDeletePendingReviewConfirmed()'s own tests below, harmless default for every other test here.
    listMyMovements: jest.fn(() => of({ items: [], total: 0, page: 1, pageSize: 10 })),
  };
  return api;
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
    dueFromIssuingBankMovementId: null,
    acceptanceMovementId: null,
    acceptanceReimbReceivableMovementId: null,
    arrivalSgRedeemMovementId: null,
    createdBy: 'maker1',
    ...overrides,
  };
}

function makerContextOf(comp: TransactionBuilderComponent): MakerCheckerContext {
  return (comp as unknown as { makerContext: MakerCheckerContext }).makerContext;
}

function resetAfterRelease(comp: TransactionBuilderComponent, fn: TransactionFunction, movementId: string): void {
  (comp as unknown as { resetAfterSuccessfulCheckerRelease: (selected: TransactionFunction, id: string) => void }).resetAfterSuccessfulCheckerRelease(fn, movementId);
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
      // 3rd arg true — Look Up is an inquiry context, must still resolve a CLOSED (A10/B6) contract; see
      // BalanceComponentApiService.resolveContract()'s own includeAnyStatus doc comment.
      expect(api.resolveContract).toHaveBeenCalledWith(expectedLookupType, expect.objectContaining({ lcNumber: 'E001' }), true);
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

    it("Common Requirement: a genuine 'released' outcome refreshes Look Up Current Balance too, using the Maker's last-known LC (selectFunction()'s own reset wipes the Maker screen first)", () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      comp.onMakerSyncRequested({ lcNumber: 'LC-RELEASED', secondaryRef: null, alsoSyncLookup: false, instrumentType: 'IPLC_LC' });
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-amend', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(of({ movementId: 'mv-amend', status: 'RELEASED' }) as any);
      const syncFromSpy = jest.spyOn(comp.lookUp, 'syncFrom');

      comp.release();

      expect(syncFromSpy).toHaveBeenCalledWith('LC-RELEASED', 'IPLC_LC', expect.any(Function));
    });

    it("Common Requirement: no lookup refresh is attempted when the Maker never synced (nothing to refresh)", () => {
      const { comp, api } = setup();
      comp.selectFunction(A2);
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-amend', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(of({ movementId: 'mv-amend', status: 'RELEASED' }) as any);
      const syncFromSpy = jest.spyOn(comp.lookUp, 'syncFrom');

      comp.release();

      expect(syncFromSpy).not.toHaveBeenCalled();
    });

    // 2026-08-28 (live-reported, "A3交易 SUBMIT後 CHECKER沒顯示" → "不只a3 所有交易submit 或 sAVE fIX
    // PENDING都不出現 checker畫面") — the Checker panel was always correctly populated, just positioned
    // below the fold on a normal viewport; onMakerSyncRequested() now scrolls it into view on the SAME
    // alsoSyncLookup signal that already means "a genuine Submit/Fix Pending Save/Release/Reject just
    // succeeded".
    describe('onMakerSyncRequested() — scrolls the Checker panel into view', () => {
      it('scrolls #checkerPanelEl into view when alsoSyncLookup is true', () => {
        const { comp } = setup();
        const scrollIntoView = jest.fn();
        (comp as any).checkerPanelEl = { nativeElement: { scrollIntoView } };

        comp.onMakerSyncRequested({ lcNumber: 'LC-1', secondaryRef: null, alsoSyncLookup: true, instrumentType: 'IPLC_LC' });

        expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      });

      it('does NOT scroll on a mere selection pick (alsoSyncLookup: false)', () => {
        const { comp } = setup();
        const scrollIntoView = jest.fn();
        (comp as any).checkerPanelEl = { nativeElement: { scrollIntoView } };

        comp.onMakerSyncRequested({ lcNumber: 'LC-1', secondaryRef: null, alsoSyncLookup: false, instrumentType: 'IPLC_LC' });

        expect(scrollIntoView).not.toHaveBeenCalled();
      });

      it('is a harmless no-op when the Checker panel is not currently rendered (checkerPanelEl undefined — e.g. Maker Queue Delete Pending review)', () => {
        const { comp } = setup();
        (comp as any).checkerPanelEl = undefined;

        expect(() => comp.onMakerSyncRequested({ lcNumber: 'LC-1', secondaryRef: null, alsoSyncLookup: true, instrumentType: 'IPLC_LC' })).not.toThrow();
      });
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

      expect(api.release).toHaveBeenCalledTimes(2);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Compound event failed to release atomically: ILLEGAL_STATE_TRANSITION',
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
        message: 'Compound event failed to release atomically: ILLEGAL_STATE_TRANSITION',
      });
      expect(comp.actionBusy).toBe(false);
    });

    // Bug fixed (business-reported 2026-08-21, same guard fix as the B4 test below) — 把所有交易都測一遍:
    // A6 is the other Import-side settlesDocumentArrival function. A genuinely independent Checker
    // session never has selectedPayMovement (only ever populated by the SAME Maker session's own picker)
    // — resolveSettlesDocumentArrivalIds() falls back to selectedCheckerMovement.referencedTransactionId
    // for the source id instead.
    it('A6 settlesDocumentArrival, genuinely independent Checker session (submitResult and selectedPayMovement both null): still releases source then Acceptance via referencedTransactionId, not a silent no-op', () => {
      const { comp, api } = setup();
      comp.selectFunction(A6);
      setMakerContext(comp, { createdBy: 'maker1' });
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-acceptance', movementType: 'CREATE', status: 'PENDING', referencedTransactionId: 'mv-doc-arrival' });
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-doc-arrival', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-doc-arrival', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'checker1');
      expect(comp.makerOutcomeSignal?.kind).not.toBe('failed');
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

    // Bug fixed (business-reported 2026-08-21, same guard fix as the B4 test below) — 把所有交易都測一遍:
    // A3S's own linked SG redemption id (arrivalSgRedeemMovementId) is only ever populated in the SAME
    // Maker session that Submitted it — an independent Checker session resolves it via businessEventId
    // instead (resolveLinkedMovementId()).
    it('A3S documentArrivalWithSg, genuinely independent Checker session (submitResult and arrivalSgRedeemMovementId both null): still resolves the SG redemption via businessEventId and acknowledges, not a silent no-op', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3S);
      setMakerContext(comp, { createdBy: 'maker1' });
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-doc-arrival', movementType: 'UTILIZE', status: 'PENDING', businessEventId: 'be-2' });
      api.findByBusinessEventId.mockReturnValueOnce(of([makeMovement({ movementId: 'mv-sg-redeem', movementType: 'FULL_REDEEM', status: 'PENDING' })]) as any);
      api.release.mockReturnValueOnce(of({ movementId: 'mv-sg-redeem', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-2');
      expect(api.release).toHaveBeenCalledWith('mv-sg-redeem', 'checker1');
      expect(api.acknowledge).toHaveBeenCalledWith('mv-doc-arrival', 'checker1');
      expect(comp.arrivalApproved).toBe(true);
    });

    it('B5 releases only the selected Acceptance settlement, then resets to a fresh B5 screen', () => {
      const { comp, api } = setup();
      comp.selectFunction(B5);
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-settle', status: 'PENDING' }) });
      api.release.mockReturnValueOnce(of({ movementId: 'mv-settle', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.release).toHaveBeenCalledTimes(1);
      expect(api.release).toHaveBeenCalledWith('mv-settle', 'checker1');
      // See the A6 test above for why submitResult is null, not the leg response.
      expect(comp.selectedFunction).toBe(B5);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.actionBusy).toBe(false);
      expect(comp.releaseSuccessHint).toContain('mv-settle');
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
        message: 'Compound event failed to release atomically: ILLEGAL_STATE_TRANSITION',
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

      expect(api.release).toHaveBeenCalledTimes(3);
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'failed',
        message: 'Compound event failed to release atomically: ILLEGAL_STATE_TRANSITION',
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
        message: 'Compound event failed to release atomically: ILLEGAL_STATE_TRANSITION',
      });
    });

    // Bug fixed (business-reported 2026-08-21, "B4 Submit 後跳出交易 再進入B4 SEARCH U04或U06 找出交易後
    // 點選RELEASE => 無法處理" — B4 Submit, leave the screen, re-enter B4, search independently, click
    // Release => nothing happens): a genuinely SEPARATE Checker session never has submitResult or any of
    // the makerContext.*MovementId fields (those only ever exist in the SAME session that Submitted) —
    // only selectedCheckerMovement (real server data from the Checker's own independent search) and the
    // businessEventId/referencedTransactionId correlation it carries. Before the fix, release()'s own
    // top-of-method guard required submitResult and silently no-opped here, before ever calling the API.
    it('B4 Usance, genuinely independent Checker session (submitResult and every makerContext leg id null): still resolves and releases all 3 legs via businessEventId, not a silent no-op', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, { createdBy: 'maker1' }); // submitResult/selectedPayMovement/acceptance*MovementId all null — fresh session
      comp.selectedCheckerMovement = makeMovement({
        movementId: 'mv-accept',
        movementType: 'ACCEPT',
        status: 'PENDING',
        businessEventId: 'be-1',
        referencedTransactionId: 'mv-b3',
      });
      api.findByBusinessEventId.mockReturnValueOnce(
        of([
          makeMovement({ movementId: 'mv-accept', movementType: 'ACCEPT', status: 'PENDING' }),
          makeMovement({ movementId: 'mv-acceptance', movementType: 'CREATE', status: 'PENDING' }),
          makeMovement({ movementId: 'mv-receivable', movementType: 'CREATE', status: 'PENDING' }),
        ]) as any,
      );
      api.release
        .mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-acceptance', status: 'RELEASED' }) as any)
        .mockReturnValueOnce(of({ movementId: 'mv-receivable', status: 'RELEASED' }) as any);

      comp.release();

      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-1');
      expect(api.release).toHaveBeenNthCalledWith(1, 'mv-accept', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'mv-acceptance', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(3, 'mv-receivable', 'checker1');
      expect(comp.makerOutcomeSignal).not.toEqual({ kind: 'failed', message: expect.stringContaining('no') });
    });

    it('true no-op case survives: neither selectedCheckerMovement nor submitResult set', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp); // submitResult null by default
      comp.selectedCheckerMovement = null;

      comp.release();

      expect(api.release).not.toHaveBeenCalled();
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------
  // reject()
  // ---------------------------------------------------------------------
  describe('reject()', () => {
    it('no-ops when there is no submitResult.movementId (and no selectedCheckerMovement either)', () => {
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

    // Same bug/fix as release()'s own "genuinely independent Checker session" test above.
    it('genuinely independent Checker session (submitResult null): still calls api.reject via selectedCheckerMovement, not a silent no-op', () => {
      const { comp, api } = setup();
      comp.selectFunction(B4);
      setMakerContext(comp, { createdBy: 'maker1' });
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-accept', movementType: 'ACCEPT', status: 'PENDING', businessEventId: 'be-1', referencedTransactionId: 'mv-b3' });
      api.reject.mockReturnValueOnce(of({ movementId: 'mv-accept', status: 'REJECTED' }) as any);

      comp.reject();

      expect(api.reject).toHaveBeenCalledWith('mv-accept', 'checker1', 'MANUAL_TEST_REJECT');
    });

    // Business instruction 2026-08-20 — forwardOutcomeToMaker() now reloads the Checker Queue for any
    // non-'failed' outcome, not just 'documentArrivalAcknowledged'; reject() previously left the
    // just-rejected item stale in the queue since it never resets the whole screen the way a successful
    // release() does via selectFunction().
    it('success bumps checkerQueueRefreshNonce; a failed reject does not', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.reject.mockReturnValueOnce(of({ movementId: 'mv-1', status: 'REJECTED' }) as any);
      const before = comp.checkerQueueRefreshNonce;

      comp.reject();
      expect(comp.checkerQueueRefreshNonce).toBe(before + 1);

      api.reject.mockReturnValueOnce(apiErr('NOT_FOUND') as any);
      comp.reject();
      expect(comp.checkerQueueRefreshNonce).toBe(before + 1); // unchanged — the second call failed
    });
  });

  // ---------------------------------------------------------------------
  // fixPending() — Fix Pending trial (analysis/Balance-Component-FixPending-DeletePending-
  // Proposal-zh.md §2.2/§15/§19), A1/A3
  // ---------------------------------------------------------------------
  describe('fixPending()', () => {
    it('no-ops when there is no submitResult, when the movementId does not match, or when status is not PENDING/REJECTED', () => {
      const { comp, api } = setup();

      comp.fixPending({ movementId: 'mv-1', amount: '999' });
      expect(api.editPending).not.toHaveBeenCalled();

      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      comp.fixPending({ movementId: 'mv-OTHER', amount: '999' });
      expect(api.editPending).not.toHaveBeenCalled();

      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'RELEASED' }) });
      comp.fixPending({ movementId: 'mv-1', amount: '999' });
      expect(api.editPending).not.toHaveBeenCalled();
    });

    it('PENDING path: calls api.editPending with the movementId + patched amount, forwards a "released" outcome to Maker', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.editPending.mockReturnValueOnce(of({ movementId: 'mv-edited', status: 'PENDING', amount: '95000' }) as any);

      comp.fixPending({ movementId: 'mv-1', amount: '95000' });

      expect(api.editPending).toHaveBeenCalledWith('mv-1', { amount: '95000', editedBy: 'maker1' });
      // secondary: {} — no businessEventId on the edited movement here, so
      // CheckerActionsService.resolveArrivalSgLegAfterEdit() short-circuits without a lookup (see the
      // Phase 4 compound-cascade test below for the non-empty case).
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'released',
        result: { movementId: 'mv-edited', status: 'PENDING', amount: '95000' },
        secondary: {},
      });
      expect(comp.actionBusy).toBe(false);
    });

    it('Maker Queue Remarks-only path uses the active external target when makerContext was reset or has not synchronized yet', () => {
      const { comp, api } = setup();
      const target = makeMovement({ movementId: 'mv-a6-remarks', status: 'PENDING', amount: '10000' });
      comp.externalFixPendingRequest = target;
      setMakerContext(comp, { submitResult: null, createdBy: 'maker1' });
      api.editPending.mockReturnValueOnce(of({ ...target, remarks: 'corrected' }) as any);

      comp.fixPending({ movementId: target.movementId, amount: '10000', editMode: 'REMARKS_ONLY', remarks: 'corrected' });

      expect(api.editPending).toHaveBeenCalledWith(target.movementId, {
        amount: '10000',
        editMode: 'REMARKS_ONLY',
        remarks: 'corrected',
        editedBy: 'maker1',
      });
      expect(comp.actionBusy).toBe(false);
    });

    // Phase 4 (2026-08-28, "使用同樣方式處理A3 A35 A4 & B2") — an A3S compound Fix Pending edit's own
    // resolved SG leg reaches the Maker panel via `secondary`.
    it('compound (A3S) PENDING path: resolves the SG leg via findByBusinessEventId and includes it in the forwarded outcome\'s own secondary', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-utilize', status: 'PENDING' }) });
      const editedUtilize = makeMovement({ movementId: 'mv-utilize-edited', status: 'PENDING', amount: '8000', businessEventId: 'be-a3s' });
      api.editPending.mockReturnValueOnce(of(editedUtilize) as any);
      const rejectedOther = makeMovement({ movementId: 'mv-sg-rejected', movementType: 'PARTIAL_REDEEM', status: 'REJECTED', businessEventId: 'be-a3s' });
      const newSg = makeMovement({ movementId: 'mv-sg-new', movementType: 'PARTIAL_REDEEM', status: 'PENDING', businessEventId: 'be-a3s' });
      api.findByBusinessEventId.mockReturnValueOnce(of([rejectedOther, editedUtilize, newSg]) as any);

      comp.fixPending({ movementId: 'mv-utilize', amount: '8000' });

      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-a3s');
      expect(comp.makerOutcomeSignal).toEqual({
        kind: 'released',
        result: editedUtilize,
        secondary: { arrivalSgRedeemMovementId: 'mv-sg-new', arrivalSgRedeemMovement: newSg },
      });
    });

    it('REJECTED path: same call shape as PENDING', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-1', status: 'REJECTED' }) });

      comp.fixPending({ movementId: 'mv-1', amount: '30000' });

      expect(api.editPending).toHaveBeenCalledWith('mv-1', { amount: '30000', editedBy: 'maker1' });
    });

    it('a failed Fix Pending sets submitError via makerOutcomeSignal', () => {
      const { comp, api } = setup();
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-1', status: 'PENDING' }) });
      api.editPending.mockReturnValueOnce(apiErr('INSUFFICIENT_AVAILABLE_BALANCE') as any);

      comp.fixPending({ movementId: 'mv-1', amount: '999999999' });

      expect(comp.makerOutcomeSignal).toEqual({ kind: 'failed', message: 'INSUFFICIENT_AVAILABLE_BALANCE' });
    });
  });

  describe('onMakerQueueFixPending() (2026-08-28, "Maker Queue Need to provide Fix Pending button as well")', () => {
    it('no-ops when the row\'s own Function cannot be resolved at all', () => {
      const { comp } = setup();
      const row = { movement: makeMovement({ movementType: 'SOME_UNKNOWN_TYPE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueFixPending(row as any);

      expect(comp.selectedFunction).toBeNull();
      expect(comp.externalFixPendingRequest).toBeNull();
    });

    it('switches to Transaction Processing, selects the row\'s own resolved Function (A1), and feeds a fresh copy of the movement into externalFixPendingRequest', () => {
      const { comp } = setup();
      comp.activeMode = 'MAKER_QUEUE';
      const movement = makeMovement({ movementId: 'mv-9', movementType: 'ISSUE', businessEventId: null });
      const row = { movement, contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueFixPending(row as any);

      expect(comp.activeMode).toBe('PROCESSING');
      expect(comp.selectedFunction?.code).toBe('A1');
      expect(comp.externalFixPendingRequest).toEqual(movement);
      expect(comp.externalFixPendingRequest).not.toBe(movement); // fresh object — see this method's own doc comment on why ngOnChanges() needs a reference change every click
    });

    it('resolves A3 for a plain (non-compound) UTILIZE row', () => {
      const { comp } = setup();
      const movement = makeMovement({ movementId: 'mv-10', movementType: 'UTILIZE', businessEventId: null, makerSubmittedAt: null });
      const row = { movement, contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueFixPending(row as any);

      expect(comp.selectedFunction?.code).toBe('A3');
    });

    it('a second click on the same still-loaded row (same movement object reference) still assigns a genuinely fresh externalFixPendingRequest object each time', () => {
      const { comp } = setup();
      const movement = makeMovement({ movementType: 'ISSUE', businessEventId: null });
      const row = { movement, contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueFixPending(row as any);
      const first = comp.externalFixPendingRequest;
      comp.onMakerQueueFixPending(row as any);
      const second = comp.externalFixPendingRequest;

      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });
  });

  describe('same-session Maker Result Delete Pending', () => {
    it('uses the direct cancel API, stays in Transaction Processing, resets to fresh A1 input data, and never calls Maker Queue deletion', () => {
      const { comp, api } = setup();
      comp.activeMode = 'PROCESSING';
      comp.selectedFunction = A1;
      setMakerContext(comp, { createdBy: 'maker9', submitResult: makeMovement({ movementId: 'submitted-a1' }) });
      comp.selectedCheckerMovement = makeMovement({ movementId: 'checker-a1' });
      comp.checkerError = 'stale error';
      const resetNonceBeforeDelete = comp.checkerResetNonce;
      const queueDelete = jest.spyOn(comp.makerQueue, 'deletePending');
      const movement = makeMovement({ movementId: 'mv-a1-delete', movementType: 'ISSUE' });

      comp.onMakerResultDeletePendingConfirmed(movement);

      expect(api.cancel).toHaveBeenCalledWith('mv-a1-delete', 'maker9', 'MAKER_EC');
      expect(queueDelete).not.toHaveBeenCalled();
      expect(comp.pendingMakerQueueDeleteRow).toBeNull();
      expect(comp.activeMode).toBe('PROCESSING');
      expect(comp.selectedFunction).toBe(A1);
      expect(makerContextOf(comp).submitResult).toBeNull();
      expect((comp as any).makerContext.createdBy).toBe('maker1');
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerError).toBeNull();
      expect(comp.checkerResetNonce).toBe(resetNonceBeforeDelete + 1);
      expect(comp.makerOutcomeSignal).toBeNull();
      expect(comp.actionBusy).toBe(false);
    });

    it('resets a successfully deleted A3 to its fresh LC Index selection screen', () => {
      const { comp, api } = setup();
      comp.activeMode = 'PROCESSING';
      comp.selectedFunction = A3;
      setMakerContext(comp, { createdBy: 'maker3', submitResult: makeMovement({ movementId: 'submitted-a3' }) });
      const resetNonceBeforeDelete = comp.checkerResetNonce;

      comp.onMakerResultDeletePendingConfirmed(makeMovement({ movementId: 'mv-a3-delete', movementType: 'UTILIZE' }));

      expect(api.cancel).toHaveBeenCalledWith('mv-a3-delete', 'maker3', 'MAKER_EC');
      expect(comp.selectedFunction).toBe(A3);
      expect(makerContextOf(comp).submitResult).toBeNull();
      expect(comp.checkerResetNonce).toBe(resetNonceBeforeDelete + 1);
      expect(comp.activeMode).toBe('PROCESSING');
    });

    it('applies A1 new-input behavior to B1', () => {
      const { comp, api } = setup();
      comp.selectedFunction = B1;
      setMakerContext(comp, { createdBy: 'exportMaker', submitResult: makeMovement({ movementId: 'submitted-b1' }) });
      const resetNonceBeforeDelete = comp.checkerResetNonce;

      comp.onMakerResultDeletePendingConfirmed(makeMovement({ movementId: 'mv-b1-delete', movementType: 'ISSUE' }));

      expect(api.cancel).toHaveBeenCalledWith('mv-b1-delete', 'exportMaker', 'MAKER_EC');
      expect(comp.selectedFunction).toBe(B1);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.checkerResetNonce).toBe(resetNonceBeforeDelete + 1);
    });

    it('uses withdrawMakerSubmit for A4 instead of cancelling its underlying A3 movement', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A4;
      setMakerContext(comp, { createdBy: 'maker4' });
      const movement = makeMovement({ movementId: 'mv-a4-delete', movementType: 'UTILIZE' });

      comp.onMakerResultDeletePendingConfirmed(movement);

      expect(api.withdrawMakerSubmit).toHaveBeenCalledWith('mv-a4-delete', 'maker4');
      expect(api.cancel).not.toHaveBeenCalled();
      expect(comp.selectedFunction).toBe(A4);
    });

    it('cancels configured B4 compound siblings before the primary movement', () => {
      const { comp, api } = setup();
      comp.selectedFunction = B4;
      setMakerContext(comp, {
        createdBy: 'makerB4',
        acceptanceMovementId: 'mv-acceptance',
        acceptanceReimbReceivableMovementId: 'mv-receivable',
      });

      comp.onMakerResultDeletePendingConfirmed(makeMovement({ movementId: 'mv-b4-primary', movementType: 'ACCEPT' }));

      expect(api.cancel.mock.calls).toEqual([
        ['mv-acceptance', 'makerB4', 'MAKER_EC'],
        ['mv-receivable', 'makerB4', 'MAKER_EC'],
        ['mv-b4-primary', 'makerB4', 'MAKER_EC'],
      ]);
      expect(comp.selectedFunction).toBe(B4);
    });

    it('surfaces API failure without navigating to Maker Queue', () => {
      const { comp, api } = setup();
      comp.activeMode = 'PROCESSING';
      comp.selectedFunction = A1;
      api.cancel.mockReturnValue(apiErr('A1 delete failed'));

      comp.onMakerResultDeletePendingConfirmed(makeMovement({ movementType: 'ISSUE' }));

      expect(comp.makerOutcomeSignal).toEqual({ kind: 'failed', message: 'A1 delete failed' });
      expect(comp.activeMode).toBe('PROCESSING');
      expect(comp.actionBusy).toBe(false);
    });

    it('does not run for a non-PENDING movement', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A1;
      comp.onMakerResultDeletePendingConfirmed(makeMovement({ status: 'REJECTED' }));

      expect(api.cancel).not.toHaveBeenCalled();
    });
  });

  describe('onMakerQueueDeletePendingReview() / onDeletePendingReviewConfirmed() / onDeletePendingReviewCancelled() (2026-08-28, "Maker Queue Delete Pending 也要顯示交易畫面 確認刪除與否")', () => {
    it('onMakerQueueDeletePendingReview() no-ops when the row\'s own Function cannot be resolved at all', () => {
      const { comp } = setup();
      const row = { movement: makeMovement({ movementType: 'SOME_UNKNOWN_TYPE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueDeletePendingReview(row as any);

      expect(comp.selectedFunction).toBeNull();
      expect(comp.externalDeletePendingReviewRequest).toBeNull();
      expect(comp.pendingMakerQueueDeleteRow).toBeNull();
    });

    it('onMakerQueueDeletePendingReview() switches to Transaction Processing, selects the resolved Function, keeps the original row, and feeds a fresh copy of the movement into externalDeletePendingReviewRequest', () => {
      const { comp } = setup();
      comp.activeMode = 'MAKER_QUEUE';
      const movement = makeMovement({ movementId: 'mv-del-1', movementType: 'ISSUE', businessEventId: null });
      const row = { movement, contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueDeletePendingReview(row as any);

      expect(comp.activeMode).toBe('PROCESSING');
      expect(comp.selectedFunction?.code).toBe('A1');
      expect(comp.pendingMakerQueueDeleteRow).toBe(row); // the ORIGINAL row (with any siblingMovementIds), not a copy
      expect(comp.externalDeletePendingReviewRequest).toEqual(movement);
      expect(comp.externalDeletePendingReviewRequest).not.toBe(movement); // fresh object, same reasoning as onMakerQueueFixPending()
    });

    it('onDeletePendingReviewConfirmed() no-ops when there is no pending row', () => {
      const { comp, api } = setup();
      comp.pendingMakerQueueDeleteRow = null;

      comp.onDeletePendingReviewConfirmed();

      expect(api.cancel).not.toHaveBeenCalled();
      expect(comp.actionBusy).toBe(false);
    });

    it('onDeletePendingReviewConfirmed() calls MakerQueueService.deletePending() with the ORIGINAL row (cascade-aware), is already busy by the time the call settles, then clears the pending row and returns to Maker Queue', () => {
      const { comp, api } = setup();
      const row = { movement: makeMovement({ movementId: 'mv-del-2', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }), siblingMovementIds: ['mv-del-2', 'mv-sibling'] };
      comp.pendingMakerQueueDeleteRow = row as any;
      comp.activeMode = 'PROCESSING';
      let wasBusyDuringCall = false;
      const deleteSpy = jest.spyOn(comp.makerQueue, 'deletePending').mockImplementation((_r, onSettled) => {
        wasBusyDuringCall = comp.actionBusy; // captured mid-call, before the (synchronous, of()-based) mock's own onSettled fires
        onSettled?.(true);
      });

      comp.onDeletePendingReviewConfirmed();

      expect(wasBusyDuringCall).toBe(true); // actionBusy was set BEFORE deletePending() was even called
      expect(deleteSpy).toHaveBeenCalledWith(row, expect.any(Function));
      expect(comp.actionBusy).toBe(false); // settled synchronously (of()-based mocks) by this point
      expect(comp.pendingMakerQueueDeleteRow).toBeNull();
      expect(comp.activeMode).toBe('MAKER_QUEUE');
    });

    it('onDeletePendingReviewCancelled() discards the pending row and returns to Maker Queue without ever calling the delete API', () => {
      const { comp, api } = setup();
      const row = { movement: makeMovement({ movementId: 'mv-del-3' }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      comp.pendingMakerQueueDeleteRow = row as any;
      comp.activeMode = 'PROCESSING';

      comp.onDeletePendingReviewCancelled();

      expect(comp.pendingMakerQueueDeleteRow).toBeNull();
      expect(comp.activeMode).toBe('MAKER_QUEUE');
      expect(api.cancel).not.toHaveBeenCalled();
    });

    // Real bug found live 2026-08-28 ("✎ FIX PENDING... 🗑 DELETE PENDING — REVIEW..." both banners shown
    // together for the SAME movement) — see selectMode()'s own doc comment for the root cause
    // (`<app-maker-panel>` is destroyed on leaving 'PROCESSING' and recreated fresh on return, so a
    // stale non-null `externalFixPendingRequest`/`externalDeletePendingReviewRequest` left over from an
    // earlier click would silently re-fire alongside a genuinely new one).
    it('a Fix Pending review followed by a Delete Pending review for a DIFFERENT row never leaves externalFixPendingRequest stale — only one of the two external-request signals is ever non-null at a time', () => {
      const { comp } = setup();
      const fixRow = { movement: makeMovement({ movementId: 'mv-fix-1', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      const deleteRow = { movement: makeMovement({ movementId: 'mv-del-9', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueFixPending(fixRow as any);
      expect(comp.externalFixPendingRequest).not.toBeNull();

      // Leaving Transaction Processing (e.g. navigating back to Maker Queue) is exactly the point that
      // destroys <app-maker-panel> — selectMode() itself is the fix under test here.
      comp.selectMode('MAKER_QUEUE');
      expect(comp.externalFixPendingRequest).toBeNull();
      expect(comp.externalDeletePendingReviewRequest).toBeNull();

      comp.onMakerQueueDeletePendingReview(deleteRow as any);

      expect(comp.externalFixPendingRequest).toBeNull(); // the stale Fix Pending signal must NOT survive into this fresh instance's own ngOnChanges()
      expect(comp.externalDeletePendingReviewRequest).toEqual(deleteRow.movement);
    });

    it('the reverse order (Delete Pending review, then Fix Pending for a different row) is equally safe', () => {
      const { comp } = setup();
      const deleteRow = { movement: makeMovement({ movementId: 'mv-del-10', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      const fixRow = { movement: makeMovement({ movementId: 'mv-fix-2', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };

      comp.onMakerQueueDeletePendingReview(deleteRow as any);
      expect(comp.externalDeletePendingReviewRequest).not.toBeNull();

      comp.selectMode('MAKER_QUEUE');
      comp.onMakerQueueFixPending(fixRow as any);

      expect(comp.externalDeletePendingReviewRequest).toBeNull();
      expect(comp.externalFixPendingRequest).toEqual(fixRow.movement);
    });

    it('selectMode() leaves both external-request signals untouched while staying in/entering PROCESSING (only a genuine exit clears them)', () => {
      const { comp } = setup();
      const movement = makeMovement({ movementId: 'mv-stay', movementType: 'ISSUE', businessEventId: null });
      comp.externalFixPendingRequest = movement;

      comp.selectMode('PROCESSING');

      expect(comp.externalFixPendingRequest).toBe(movement);
    });

    it('leaving PROCESSING clears an abandoned Delete Pending row so it cannot hide Checker on the next screen', () => {
      const { comp } = setup();
      comp.pendingMakerQueueDeleteRow = {
        movement: makeMovement({ movementId: 'mv-abandoned-delete' }),
        contract: makeContract({ instrumentType: 'IPLC_LC' }),
      } as any;

      comp.selectMode('MAKER_QUEUE');

      expect(comp.pendingMakerQueueDeleteRow).toBeNull();
    });

    it('A7 -> Maker Queue -> Inquire Events -> Inquire Delete Pending -> Processing does not replay stale Maker or Checker signals', () => {
      const { comp } = setup();
      comp.selectFunction(A7);
      comp.makerOutcomeSignal = { kind: 'failed', message: 'old submit failure' };
      comp.checkerSyncSignal = { lcNumber: 'U01', secondaryRef: 'B01' };
      comp.selectedCheckerMovement = makeMovement({ movementId: 'old-checker-row' });
      comp.checkerError = 'old checker failure';
      comp.releaseSuccessHint = 'old success';
      comp.arrivalApproved = true;

      comp.selectMode('MAKER_QUEUE');
      comp.selectMode('INQUIRE');
      comp.selectMode('DELETE_PENDING_AUDIT');
      comp.selectMode('PROCESSING');

      expect(comp.selectedFunction).toBe(A7);
      expect(comp.makerOutcomeSignal).toBeNull();
      expect(comp.checkerSyncSignal).toBeNull();
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.checkerError).toBeNull();
      expect(comp.releaseSuccessHint).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
    });

    it('a normal Function selection clears stale Delete Pending state so Checker renders before any transaction is selected', () => {
      const { comp } = setup();
      comp.pendingMakerQueueDeleteRow = {
        movement: makeMovement({ movementId: 'mv-stale-delete' }),
        contract: makeContract({ instrumentType: 'IPLC_LC' }),
      } as any;
      comp.externalDeletePendingReviewRequest = makeMovement({ movementId: 'mv-stale-delete' });

      comp.selectFunction(A3);

      expect(comp.selectedFunction).toBe(A3);
      expect(comp.pendingMakerQueueDeleteRow).toBeNull();
      expect(comp.externalDeletePendingReviewRequest).toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // onFixPendingCancelled() (2026-08-28, "FIX PENDING OR DELETE PENDING 按CANCEL 回到原來的MAKER QUEUE畫面")
  // ---------------------------------------------------------------------
  describe('onFixPendingCancelled()', () => {
    it('navigates back to Maker Queue and clears externalFixPendingRequest when Fix Pending was Maker-Queue-originated', () => {
      const { comp } = setup();
      const row = { movement: makeMovement({ movementId: 'mv-fix-cancel-1', movementType: 'ISSUE', businessEventId: null }), contract: makeContract({ instrumentType: 'IPLC_LC' }) };
      comp.onMakerQueueFixPending(row as any);
      expect(comp.externalFixPendingRequest).not.toBeNull();
      comp.activeMode = 'PROCESSING';

      comp.onFixPendingCancelled();

      expect(comp.externalFixPendingRequest).toBeNull();
      expect(comp.activeMode).toBe('MAKER_QUEUE');
    });

    it('is a no-op when Fix Pending was started in-session (not via Maker Queue) — stays on the current screen', () => {
      const { comp } = setup();
      comp.externalFixPendingRequest = null;
      comp.activeMode = 'PROCESSING';

      comp.onFixPendingCancelled();

      expect(comp.activeMode).toBe('PROCESSING');
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

    it('deferSettlement + release + matching movementType (A3): routes through acknowledgeArrival() (persisted, restored 2026-08-20), never api.release', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-2', movementType: 'UTILIZE' });
      // not the same submission -> isCheckerCompoundOwnSubmission false
      const acknowledgeSpy = jest.spyOn(comp, 'acknowledgeArrival').mockImplementation(() => undefined);

      comp.checkerAct('release');

      expect(acknowledgeSpy).toHaveBeenCalledTimes(1);
      expect(api.release).not.toHaveBeenCalled();
    });

    it('acknowledgeArrival() persists and resets the A3 Maker screen after the successful Checker action', () => {
      const { comp, api } = setup();
      comp.selectFunction(A3);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-2', movementType: 'UTILIZE' });
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-2' }) });

      comp.acknowledgeArrival();

      expect(api.acknowledge).toHaveBeenCalledWith('mv-2', comp.checkerId);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.arrivalApproved).toBe(false);
      expect(comp.releaseSuccessHint).toContain('movement mv-2');
      expect(comp.actionBusy).toBe(false);
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
      setMakerContext(comp, { submitResult: makeMovement({ movementId: 'mv-4' }) });

      comp.checkerAct('release');

      expect(api.release).toHaveBeenCalledWith('mv-4', 'checker7');
      expect(comp.checkerBusy).toBe(false);
      expect((comp as any).makerContext.submitResult).toBeNull();
      expect(comp.selectedCheckerMovement).toBeNull();
      expect(comp.releaseSuccessHint).toContain('movement mv-released');
    });

    // Business instruction 2026-08-20 ("純粹 APPROVE PENDING 交易, APPROVED 後該筆交易應該消失, 不能重複
    // APPROVED" — repro'd live via S101/A2's own plain Release leaving the just-Approved item still
    // listed in the Checker Queue): unified so EVERY successful Checker action reloads the queue, not
    // just A3/A3S's own acknowledgment path.
    it('plain path (A2) release bumps the shared reset nonce so Maker and Checker both start fresh', () => {
      const { comp } = setup();
      comp.selectFunction(A2);
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-4' });
      const before = comp.checkerResetNonce;

      comp.checkerAct('release');

      expect(comp.checkerResetNonce).toBe(before + 1);
    });

    it.each([...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS])(
      'post-Release reset clears every stale Maker action signal for $code',
      (fn) => {
        const { comp } = setup();
        comp.selectFunction(fn);
        setMakerContext(comp, { submitResult: makeMovement({ movementId: `mv-${fn.code}` }) });
        comp.selectedCheckerMovement = makeMovement({ movementId: `mv-${fn.code}` });
        comp.externalFixPendingRequest = makeMovement({ movementId: `mv-${fn.code}` });
        comp.externalDeletePendingReviewRequest = makeMovement({ movementId: `mv-${fn.code}` });
        comp.makerOutcomeSignal = { kind: 'failed', message: 'stale' };
        comp.checkerSyncSignal = { lcNumber: 'LC-OLD', secondaryRef: null };

        resetAfterRelease(comp, fn, `mv-${fn.code}`);

        expect(comp.selectedFunction).toBe(fn);
        expect(makerContextOf(comp).submitResult).toBeNull();
        expect(comp.selectedCheckerMovement).toBeNull();
        expect(comp.externalFixPendingRequest).toBeNull();
        expect(comp.externalDeletePendingReviewRequest).toBeNull();
        expect(comp.makerOutcomeSignal).toBeNull();
        expect(comp.checkerSyncSignal).toBeNull();
      },
    );

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
      const pending = makeMovement({ movementId: 'mv-4' });
      comp.selectedCheckerMovement = pending;
      setMakerContext(comp, { submitResult: pending });

      comp.checkerAct('reject');

      expect(api.reject).toHaveBeenCalledWith('mv-4', comp.checkerId, 'MANUAL_QUEUE_REJECT');
      expect(makerContextOf(comp).submitResult).toBe(pending);
      expect(comp.selectedCheckerMovement).toBe(pending);
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
        makerSubmittedBy: 'maker1',
        makerSubmittedAt: '2026-08-18T04:00:00.000Z',
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

    // User instruction 2026-08-21 ("Lookup 除了 REFERENCE 還要有 SECONDARY REF") — lookUp.secondaryReferenceFor()
    // delegates to the same secondaryReferenceForEvent() free function as
    // InquireEventsService.secondaryReferenceFor() — no separate Secondary Ref. mapping.
    it("lookUp.secondaryReferenceFor() delegates to the shared secondaryReferenceForEvent() rule", () => {
      const { comp } = setup();
      const sgRow = makeEventRow({ contract: makeContract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: 'G01' } }) });
      const examRow = makeEventRow({ contract: makeContract({ instrumentType: 'EPLC_EXAMINATION', naturalKey: { lcNumber: 'LC001', ibNumber: 'E01', sgNumber: null } }) });
      // makeEventRow()'s own default movement is IPLC_LC/UTILIZE with sourceTransactionRef 'IB001' — the
      // A6/B4 Accounting Event Ownership Rule (2026-08-28) reclassifies this as Secondary Ref., not
      // Reference (lookUp.primaryReferenceFor() is its own delegating counterpart, same pairing).
      const lcRow = makeEventRow({ contract: makeContract({ instrumentType: 'IPLC_LC' }) });

      expect(comp.lookUp.secondaryReferenceFor(sgRow)).toBe('SG G01');
      expect(comp.lookUp.secondaryReferenceFor(examRow)).toBe('E01');
      expect(comp.lookUp.secondaryReferenceFor(lcRow)).toBe('IB001');
      expect(comp.lookUp.primaryReferenceFor(lcRow)).toBe('—');
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

      expect(api.catalog).toHaveBeenCalledWith('IPLC_ACCEPTANCE', undefined, undefined, 1, 50, 'LC001', undefined, undefined, true);
      expect(api.catalog).toHaveBeenCalledWith('SHGT', undefined, undefined, 1, 50, 'LC001', undefined, undefined, true);
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

      expect(api.catalog).toHaveBeenCalledWith('EPLC_ACCEPTANCE', undefined, undefined, 1, 50, 'LC001', undefined, undefined, true);
      expect(api.catalog).not.toHaveBeenCalledWith('SHGT', undefined, undefined, 1, 50, 'LC001', undefined, undefined, true);
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

  /**
   * Business-reported gap 2026-08-28 (Checker's own pre-Release "Account Entries" button: "只看到一組
   * Account Entries for Acceptance. Where is the Account Entries (Pending) for reverse LC Balance?") — the
   * Checker screen only ever has the raw `selectedCheckerMovement`, no merged `InquiredEvent` the way
   * Inquire Events/Look Up already carry a `linkedMovement` on. See CLAUDE.md's own "A6/B4 Accounting
   * Event Ownership Rule" entry for the shared design this closes the last gap in.
   */
  describe('openCheckerAccountEntryDialog()', () => {
    it('opens the dialog immediately with just the primary movement, then no-ops for a shape with no linkable partner (e.g. a plain A1 ISSUE)', () => {
      const { comp, api } = setup();
      const A1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1')!;
      comp.selectedFunction = A1;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'ISSUE', referencedTransactionId: null, businessEventId: null });

      comp.openCheckerAccountEntryDialog();

      expect(comp.accountEntryDialogMovement).toBe(comp.selectedCheckerMovement);
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
      expect(api.getContract).not.toHaveBeenCalled();
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
    });

    it('does nothing when selectedCheckerMovement is null', () => {
      const { comp, api } = setup();
      comp.selectedCheckerMovement = null;

      comp.openCheckerAccountEntryDialog();

      expect(comp.accountEntryDialogMovement).toBeNull();
      expect(api.getContract).not.toHaveBeenCalled();
    });

    // Bug fixed 2026-08-29 (live-reported, "A4 Checker View Voucher shows EARMARKED 不對 應該是PENDING") —
    // never passed `phase` at all, so a still-PENDING A4-in-progress record (the SAME underlying A3/A3S
    // UTILIZE row) fell back to A3's own EARMARKING label. Same derivation rule as
    // MakerPanelComponent.resultPhase's own doc comment already established for the Maker Result panel.
    it('A4 (releasesExistingMovementInPlace, own Maker Submit already done): derives phase "finalize" so the dialog shows PENDING, not EARMARKING', () => {
      const { comp } = setup();
      comp.selectedFunction = A4;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'UTILIZE', status: 'PENDING', makerSubmittedAt: '2026-08-29T00:00:00.000Z', referencedTransactionId: null, businessEventId: null });

      comp.openCheckerAccountEntryDialog();

      expect(comp.accountEntryDialogPhase).toBe('finalize');
    });

    it('A4 whose own Maker Submit has NOT happened yet stays phase null (still genuinely A3\'s own EARMARKING territory)', () => {
      const { comp } = setup();
      comp.selectedFunction = A4;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'UTILIZE', status: 'PENDING', makerSubmittedAt: null, referencedTransactionId: null, businessEventId: null });

      comp.openCheckerAccountEntryDialog();

      expect(comp.accountEntryDialogPhase).toBeNull();
    });

    it('a non-A4 Function (e.g. A3) never gets phase "finalize" even with makerSubmittedAt set on the record', () => {
      const { comp } = setup();
      const A3 = IMPORT_FUNCTIONS.find((f) => f.code === 'A3')!;
      comp.selectedFunction = A3;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'UTILIZE', status: 'PENDING', makerSubmittedAt: '2026-08-29T00:00:00.000Z', referencedTransactionId: null, businessEventId: null });

      comp.openCheckerAccountEntryDialog();

      expect(comp.accountEntryDialogPhase).toBeNull();
    });

    it('A6 (IPLC_ACCEPTANCE): resolves the referenced UTILIZE via getContract -> resolveContract(IPLC_LC) -> listMovements, and fills in linkedMovement', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A6;
      comp.selectedCheckerMovement = makeMovement({
        movementId: 'mv-a6-create',
        movementType: 'CREATE',
        balanceContractId: 'bc-acceptance',
        referencedTransactionId: 'mv-utilize',
      });
      api.getContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'U01', ibNumber: 'B01', sgNumber: null } })) as any);
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', balanceContractId: 'bc-lc', naturalKey: { lcNumber: 'U01', ibNumber: null, sgNumber: null } })) as any);
      const utilizeMovement = makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', contingentAccountEntry: { drAccount: 'Dr', crAccount: 'Cr', currency: 'USD', amount: '1000' } });
      api.listMovements.mockReturnValueOnce(of([makeMovement({ movementId: 'mv-other' }), utilizeMovement]) as any);

      comp.openCheckerAccountEntryDialog();

      expect(api.getContract).toHaveBeenCalledWith('bc-acceptance');
      expect(api.resolveContract).toHaveBeenCalledWith('IPLC_LC', { lcNumber: 'U01' });
      expect(api.listMovements).toHaveBeenCalledWith('bc-lc');
      expect(comp.accountEntryDialogLinkedMovement).toBe(utilizeMovement);
    });

    it('A6: no referencedTransactionId at all (e.g. legacy data) — no lookup attempted, dialog stays single-set', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A6;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'CREATE', referencedTransactionId: null });

      comp.openCheckerAccountEntryDialog();

      expect(api.getContract).not.toHaveBeenCalled();
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });

    it('B4 (EPLC_CONFIRMATION/ACCEPT): resolves the sibling EPLC_ACCEPTANCE/CREATE via findByBusinessEventId, skipping itself and a CANCELLED/no-contingentAccountEntry candidate', () => {
      const { comp, api } = setup();
      comp.selectedFunction = B4;
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-accept', movementType: 'ACCEPT', businessEventId: 'be-1' });
      const receivable = makeMovement({ movementId: 'mv-receivable', movementType: 'CREATE', contingentAccountEntry: null }); // ON_BALANCE_ASSET leg, no contingent pair
      const acceptanceCreate = makeMovement({ movementId: 'mv-acceptance-create', movementType: 'CREATE', contingentAccountEntry: { drAccount: 'Dr', crAccount: 'Cr', currency: 'USD', amount: '1000' } });
      api.findByBusinessEventId.mockReturnValueOnce(of([comp.selectedCheckerMovement, receivable, acceptanceCreate]) as any);

      comp.openCheckerAccountEntryDialog();

      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-1');
      expect(comp.accountEntryDialogLinkedMovement).toBe(acceptanceCreate);
    });

    it('B4: HONOUR (Sight) is unaffected — its own second leg is an ON_BALANCE_ASSET instrument, no lookup attempted', () => {
      const { comp, api } = setup();
      comp.selectedFunction = B4;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'HONOUR', businessEventId: 'be-2' });

      comp.openCheckerAccountEntryDialog();

      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });

    // Business-reported gap 2026-08-28 ("B3 也檢查一下有沒有一樣的問題" ... "其他 A1–A11、B1–B7 也全部檢查一遍")
    // — A3S's own single Checker Release click genuinely releases the matched SG redemption AND
    // acknowledges the LC's own UTILIZE (CheckerActionsService.release()'s own documentArrivalWithSg
    // branch) — same "Checker要看交易出的帳 再決定" principle as A6/B4, via businessEventId correlation
    // instead of referencedTransactionId. Deliberately NOT the same as mergeAccountingEventRows()'s own
    // row-merge decision (A3S stays 2 separate rows there, on purpose — see that function's own doc
    // comment) — this is a narrower "show both sets before one Release click approves both" fix.
    it('A3S (IPLC_LC/UTILIZE with its own businessEventId): resolves the matched SG redemption via findByBusinessEventId', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A3S;
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', businessEventId: 'be-a3s' });
      const sgRedeem = makeMovement({ movementId: 'mv-sg-redeem', movementType: 'FULL_REDEEM', contingentAccountEntry: { drAccount: 'Dr', crAccount: 'Cr', currency: 'USD', amount: '1000' } });
      api.findByBusinessEventId.mockReturnValueOnce(of([comp.selectedCheckerMovement, sgRedeem]) as any);

      comp.openCheckerAccountEntryDialog();

      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-a3s');
      expect(comp.accountEntryDialogLinkedMovement).toBe(sgRedeem);
    });

    // 2026-08-28 (live-reported, "S01 A35 已經把SG的帳沖掉了 所以A4 不需再冲SG的帳 只要冲LC的帳即可") —
    // once A3S's own Checker has acknowledged the UTILIZE (the SG leg is ALREADY independently, for-real
    // RELEASED at that point — "already 沖帳"), the SAME record's own Account Entries view (now A4's own
    // business, not A3S's) must NOT merge the SG leg back in — it belongs to an already-closed event.
    it('A3S UTILIZE that has ALREADY been acknowledged (A3S Checker already Released — SG leg already booked) does NOT merge the SG leg — this is now A4\'s own business, not A3S\'s', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A3S;
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', businessEventId: 'be-a3s', acknowledgedAt: '2026-08-28T00:00:00.000Z' });

      comp.openCheckerAccountEntryDialog();

      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });

    it('A3 (plain, not A3S): IPLC_LC/UTILIZE with NO businessEventId — no lookup attempted, unaffected by the A3S fix', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A3;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'UTILIZE', businessEventId: null });

      comp.openCheckerAccountEntryDialog();

      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });

    it('A9 viewing the OTHER side of an A3S match (SHGT/FULL_REDEEM with a businessEventId): resolves the matched UTILIZE the same way', () => {
      const { comp, api } = setup();
      const A9 = IMPORT_FUNCTIONS.find((f) => f.code === 'A9')!;
      comp.selectedFunction = A9;
      comp.selectedCheckerMovement = makeMovement({ movementId: 'mv-sg-redeem', movementType: 'FULL_REDEEM', businessEventId: 'be-a3s' });
      const utilize = makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', contingentAccountEntry: { drAccount: 'Dr', crAccount: 'Cr', currency: 'USD', amount: '1000' } });
      api.findByBusinessEventId.mockReturnValueOnce(of([comp.selectedCheckerMovement, utilize]) as any);

      comp.openCheckerAccountEntryDialog();

      expect(comp.accountEntryDialogLinkedMovement).toBe(utilize);
    });

    it('A9 standalone (no businessEventId, not matched to any A3S): no lookup attempted', () => {
      const { comp, api } = setup();
      const A9 = IMPORT_FUNCTIONS.find((f) => f.code === 'A9')!;
      comp.selectedFunction = A9;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'FULL_REDEEM', businessEventId: null });

      comp.openCheckerAccountEntryDialog();

      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });

    it('a lookup failure (either shape) resolves null, not an error — dialog stays open, single-set', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A6;
      comp.selectedCheckerMovement = makeMovement({ movementType: 'CREATE', balanceContractId: 'bc-acceptance', referencedTransactionId: 'mv-utilize' });
      api.getContract.mockReturnValueOnce(apiErr('boom') as any);

      expect(() => comp.openCheckerAccountEntryDialog()).not.toThrow();
      expect(comp.accountEntryDialogMovement).toBe(comp.selectedCheckerMovement);
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });

    it('guards against a stale response landing after the dialog has moved on to a different movement', () => {
      const { comp, api } = setup();
      comp.selectedFunction = A6;
      const firstMovement = makeMovement({ movementId: 'mv-first', movementType: 'CREATE', balanceContractId: 'bc-acceptance', referencedTransactionId: 'mv-utilize' });
      comp.selectedCheckerMovement = firstMovement;
      let resolveListMovements: (v: any) => void;
      api.listMovements.mockReturnValueOnce(new Observable((subscriber) => { resolveListMovements = (v) => { subscriber.next(v); subscriber.complete(); }; }) as any);

      comp.openCheckerAccountEntryDialog();
      // The Checker moves on to a different movement before the async lookup resolves.
      comp.openAccountEntryDialog(makeMovement({ movementId: 'mv-second' }), 'IPLC_LC');
      resolveListMovements!([makeMovement({ movementId: 'mv-utilize', contingentAccountEntry: { drAccount: 'Dr', crAccount: 'Cr', currency: 'USD', amount: '1' } })]);

      expect(comp.accountEntryDialogMovement?.movementId).toBe('mv-second');
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
    });
  });

  /**
   * Business-reported gap 2026-08-28 ("A6 Maker Account Entries 只顯示一套") — reported immediately after
   * the Checker's own equivalent button above was fixed: the Maker Result panel's own "Account Entries"
   * button has the exact same root cause (`e.movement` is the raw `createMovement()` response, never a
   * merged `InquiredEvent`). Both now delegate to the same shared `openAccountEntryDialogWithLinkedResolution()`
   * / `resolveLinkedAccountingMovement()` — this describe block only re-proves the Maker's own call site
   * wires through correctly; the resolution logic itself is already fully covered by the
   * `openCheckerAccountEntryDialog()` tests above.
   */
  describe('onMakerOpenAccountEntries()', () => {
    it('A6, right after Submit: resolves the referenced UTILIZE the same way the Checker\'s own button does', () => {
      const { comp, api } = setup();
      const created = makeMovement({ movementId: 'mv-a6-create', movementType: 'CREATE', balanceContractId: 'bc-acceptance', referencedTransactionId: 'mv-utilize' });
      api.getContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'U01', ibNumber: 'B01', sgNumber: null } })) as any);
      api.resolveContract.mockReturnValueOnce(of(makeContract({ instrumentType: 'IPLC_LC', balanceContractId: 'bc-lc', naturalKey: { lcNumber: 'U01', ibNumber: null, sgNumber: null } })) as any);
      const utilizeMovement = makeMovement({ movementId: 'mv-utilize', movementType: 'UTILIZE', contingentAccountEntry: { drAccount: 'Dr', crAccount: 'Cr', currency: 'USD', amount: '1000' } });
      api.listMovements.mockReturnValueOnce(of([utilizeMovement]) as any);

      comp.onMakerOpenAccountEntries({ movement: created, instrumentType: 'IPLC_ACCEPTANCE' });

      expect(comp.accountEntryDialogMovement).toBe(created);
      expect(comp.accountEntryDialogLinkedMovement).toBe(utilizeMovement);
    });

    it('still forwards phase, and no-ops the linked lookup for a plain shape with nothing to link (e.g. A1 ISSUE)', () => {
      const { comp, api } = setup();
      const m = makeMovement({ movementType: 'ISSUE' });

      comp.onMakerOpenAccountEntries({ movement: m, instrumentType: 'IPLC_LC', phase: 'finalize' });

      expect(comp.accountEntryDialogMovement).toBe(m);
      expect(comp.accountEntryDialogPhase).toBe('finalize');
      expect(comp.accountEntryDialogLinkedMovement).toBeNull();
      expect(api.getContract).not.toHaveBeenCalled();
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
    });
  });
});
