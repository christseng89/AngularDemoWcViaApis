import { of, throwError } from 'rxjs';
import { CheckerActionsService, CheckerActionContext } from './checker-actions.service';
import { BalanceComponentApiService, BalanceMovement } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';

/**
 * Direct CheckerActionsService tests for the businessEventId-based cross-session resolution — the
 * Maker/Checker action flow is otherwise only exercised indirectly via comp.release()/reject() in
 * transaction-builder.component.actions.spec.ts, which doesn't reach every resolveLinkedMovementId branch.
 */

const A3S = IMPORT_FUNCTIONS.find((f) => f.code === 'A3S')!;
const A6 = IMPORT_FUNCTIONS.find((f) => f.code === 'A6')!;
const B4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4')!;
const B5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5')!;
const A1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1')!;

function makeMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
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

function makeApi(overrides: Partial<Record<keyof BalanceComponentApiService, jest.Mock>> = {}) {
  return {
    release: jest.fn(() => of({ movementId: 'released', status: 'RELEASED' })),
    reject: jest.fn(() => of({ movementId: 'rejected', status: 'REJECTED' })),
    cancel: jest.fn(() => of({ movementId: 'cancelled', status: 'CANCELLED' })),
    acknowledge: jest.fn(() => of({ movementId: 'acknowledged', status: 'PENDING' })),
    withdrawMakerSubmit: jest.fn(() => of({ movementId: 'withdrawn', status: 'PENDING', makerSubmittedAt: null })),
    findByBusinessEventId: jest.fn(() => of([] as BalanceMovement[])),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

function makeContext(overrides: Partial<CheckerActionContext> = {}): CheckerActionContext {
  return {
    submitResult: null,
    selectedFunction: null,
    selectedPayMovement: null,
    matchedReceivableMovementId: null,
    dueFromIssuingBankMovementId: null,
    acceptanceMovementId: null,
    acceptanceReimbReceivableMovementId: null,
    arrivalSgRedeemMovementId: null,
    createdBy: 'maker1',
    selectedCheckerMovement: null,
    ...overrides,
  };
}

describe('CheckerActionsService.release() — A3S (documentArrivalWithSg) linked SG redemption resolution', () => {
  it('fast path: releases the SG redemption directly when arrivalSgRedeemMovementId is already known — never calls findByBusinessEventId', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: A3S,
      arrivalSgRedeemMovementId: 'sg-redeem-1',
      selectedCheckerMovement: makeMovement({ businessEventId: 'be-1' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome).toEqual({ kind: 'documentArrivalAcknowledged' });
      expect(api.release).toHaveBeenCalledWith('sg-redeem-1', 'checker1');
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      done();
    });
  });

  it('cross-session fallback: resolves the SG redemption via businessEventId when arrivalSgRedeemMovementId is null, then releases it', (done) => {
    const linked = [
      makeMovement({ movementId: 'sg-redeem-2', movementType: 'FULL_REDEEM', businessEventId: 'be-2' }),
      makeMovement({ movementId: 'lc-utilize-2', movementType: 'UTILIZE', businessEventId: 'be-2' }),
    ];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: A3S,
      arrivalSgRedeemMovementId: null,
      selectedCheckerMovement: makeMovement({ movementId: 'lc-utilize-2', businessEventId: 'be-2' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome).toEqual({ kind: 'documentArrivalAcknowledged' });
      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-2');
      expect(api.release).toHaveBeenCalledWith('sg-redeem-2', 'checker1');
      done();
    });
  });

  it('matches PARTIAL_REDEEM too (not just FULL_REDEEM)', (done) => {
    const linked = [makeMovement({ movementId: 'sg-redeem-3', movementType: 'PARTIAL_REDEEM', businessEventId: 'be-3' })];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A3S, selectedCheckerMovement: makeMovement({ businessEventId: 'be-3' }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome).toEqual({ kind: 'documentArrivalAcknowledged' });
      expect(api.release).toHaveBeenCalledWith('sg-redeem-3', 'checker1');
      done();
    });
  });

  it('a RELEASED (already-finalized) SHGT movement sharing the businessEventId is not mistaken for the still-PENDING redemption', (done) => {
    const linked = [makeMovement({ movementId: 'sg-old', movementType: 'ISSUE', status: 'RELEASED', businessEventId: 'be-4' })];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A3S, selectedCheckerMovement: makeMovement({ businessEventId: 'be-4' }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('Could not find the matched Shipping Guarantee redemption');
      expect(api.release).not.toHaveBeenCalled();
      done();
    });
  });

  it('no businessEventId at all on the picked item (e.g. a stray non-compound record) — fails cleanly, never calls the API', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A3S, selectedCheckerMovement: makeMovement({ businessEventId: null }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      expect(api.release).not.toHaveBeenCalled();
      done();
    });
  });

  it('a findByBusinessEventId API error resolves to a clean failed outcome, not an unhandled error', (done) => {
    const api = makeApi({ findByBusinessEventId: jest.fn(() => throwError(() => new Error('network error'))) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A3S, selectedCheckerMovement: makeMovement({ businessEventId: 'be-5' }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      done();
    });
  });

  it('a release() API failure on the resolved SG redemption surfaces its own distinct message', (done) => {
    const linked = [makeMovement({ movementId: 'sg-redeem-6', movementType: 'FULL_REDEEM', businessEventId: 'be-6' })];
    const api = makeApi({
      findByBusinessEventId: jest.fn(() => of(linked)),
      release: jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
    });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A3S, selectedCheckerMovement: makeMovement({ businessEventId: 'be-6' }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('Document Arrival NOT acknowledged');
      done();
    });
  });
});

describe('CheckerActionsService.release() — B5 (settlesAcceptanceOnMature) linked Reimbursement Receivable resolution', () => {
  it('fast path: releases the primary Acceptance settle, then the already-known Reimbursement Receivable', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B5,
      matchedReceivableMovementId: 'receivable-1',
      selectedCheckerMovement: makeMovement({ movementId: 'settle-1', movementType: 'FULL_SETTLE', businessEventId: 'be-7' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.release).toHaveBeenNthCalledWith(1, 'settle-1', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'receivable-1', 'checker1');
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      done();
    });
  });

  it('cross-session fallback: resolves the Reimbursement Receivable via businessEventId, using selectedCheckerMovement as the primary (not a stale/absent submitResult)', (done) => {
    const linked = [makeMovement({ movementId: 'receivable-2', movementType: 'REIMBURSE', businessEventId: 'be-8' })];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B5,
      matchedReceivableMovementId: null,
      submitResult: null,
      selectedCheckerMovement: makeMovement({ movementId: 'settle-2', movementType: 'PARTIAL_SETTLE', businessEventId: 'be-8' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.release).toHaveBeenNthCalledWith(1, 'settle-2', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'receivable-2', 'checker1');
      done();
    });
  });

  it('no matching Reimbursement Receivable found — fails cleanly, never releases the primary', (done) => {
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of([])) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: B5, selectedCheckerMovement: makeMovement({ movementType: 'FULL_SETTLE', businessEventId: 'be-9' }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('Could not find the matching Reimbursement Receivable');
      expect(api.release).not.toHaveBeenCalled();
      done();
    });
  });
});

describe('CheckerActionsService.release() — A6/B4 (settlesDocumentArrival) source + downstream leg resolution (bug fixed 2026-08-16, "A6/B4 也修一下")', () => {
  it('A6, cross-session: resolves the source via referencedTransactionId (no selectedPayMovement, no findByBusinessEventId call needed) and releases source then primary via selectedCheckerMovement', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: A6,
      selectedPayMovement: null,
      submitResult: null,
      selectedCheckerMovement: makeMovement({ movementId: 'acceptance-1', movementType: 'CREATE', referencedTransactionId: 'source-1' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.release).toHaveBeenNthCalledWith(1, 'source-1', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'acceptance-1', 'checker1');
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      done();
    });
  });

  it('A6: no source resolvable at all (no selectedPayMovement, no referencedTransactionId) — fails cleanly, never calls release', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A6, selectedCheckerMovement: makeMovement({ movementType: 'CREATE', referencedTransactionId: null }) });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('no referencedTransactionId correlation found');
      expect(api.release).not.toHaveBeenCalled();
      done();
    });
  });

  // B3's Present Docs earmark is independently Checker-Released before B4 ever picks it, so B4's
  // compound release must not re-release it (would 409) — these tests assert that call is gone.
  it('B4 Sight/HONOUR, cross-session: resolves the Due from Issuing Bank leg via a real findByBusinessEventId lookup (dueFromIssuingBankMovementId unknown) — does NOT re-release the already-RELEASED B3 source', (done) => {
    const linked = [
      makeMovement({ movementId: 'honour-1', movementType: 'HONOUR', businessEventId: 'be-b4s' }),
      makeMovement({ movementId: 'dfib-1', movementType: 'CREATE', businessEventId: 'be-b4s' }),
    ];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      selectedPayMovement: makeMovement({ movementId: 'source-b3' }),
      dueFromIssuingBankMovementId: null,
      selectedCheckerMovement: makeMovement({ movementId: 'honour-1', movementType: 'HONOUR', businessEventId: 'be-b4s' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.findByBusinessEventId).toHaveBeenCalledWith('be-b4s');
      expect(api.release).toHaveBeenNthCalledWith(1, 'honour-1', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'dfib-1', 'checker1');
      expect(api.release).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('B4 Sight/HONOUR: downstream lookup needed but the picked item carries no businessEventId at all — falls back to the (still-unresolved) ctx values rather than attempting a lookup', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      selectedPayMovement: makeMovement({ movementId: 'source-nobe' }),
      dueFromIssuingBankMovementId: null,
      selectedCheckerMovement: makeMovement({ movementId: 'honour-nobe', movementType: 'HONOUR', businessEventId: null }),
    });

    service.release(ctx).subscribe((outcome) => {
      // Primary still releases; only the unresolved downstream leg is skipped — one api.release call.
      expect(outcome.kind).toBe('released');
      expect(api.findByBusinessEventId).not.toHaveBeenCalled();
      expect(api.release).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('B4 Usance/ACCEPT, cross-session: resolves BOTH the Acceptance liability and Reimbursement Receivable by creation order among the linked CREATEs — does NOT re-release the already-RELEASED B3 source', (done) => {
    const linked = [
      makeMovement({ movementId: 'accept-1', movementType: 'ACCEPT', businessEventId: 'be-b4u' }),
      makeMovement({ movementId: 'liability-1', movementType: 'CREATE', businessEventId: 'be-b4u' }),
      makeMovement({ movementId: 'receivable-1', movementType: 'CREATE', businessEventId: 'be-b4u' }),
    ];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      selectedPayMovement: makeMovement({ movementId: 'source-b3' }),
      acceptanceMovementId: null,
      acceptanceReimbReceivableMovementId: null,
      selectedCheckerMovement: makeMovement({ movementId: 'accept-1', movementType: 'ACCEPT', businessEventId: 'be-b4u' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.release).toHaveBeenNthCalledWith(1, 'accept-1', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(2, 'liability-1', 'checker1');
      expect(api.release).toHaveBeenNthCalledWith(3, 'receivable-1', 'checker1');
      expect(api.release).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('A6: releasing the resolved source record itself fails — surfaces its own compound error, never attempts the primary', (done) => {
    const api = makeApi({ release: jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: A6,
      selectedPayMovement: makeMovement({ movementId: 'source-fail', sourceTransactionRef: 'IB-FAIL' }),
      selectedCheckerMovement: makeMovement({ movementId: 'acceptance-fail', movementType: 'CREATE' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('Acceptance NOT approved');
        expect(outcome.message).toContain('IB-FAIL');
      }
      expect(api.release).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it("A6: source releases fine, but the primary Acceptance CREATE fails — surfaces releaseAcceptance's own compound error", (done) => {
    const api = makeApi({
      release: jest
        .fn()
        .mockReturnValueOnce(of({ movementId: 'source-2', status: 'RELEASED' }))
        .mockReturnValueOnce(throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
    });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: A6,
      selectedPayMovement: makeMovement({ movementId: 'source-2' }),
      selectedCheckerMovement: makeMovement({ movementId: 'acceptance-2', movementType: 'CREATE' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('failed to release');
      expect(api.release).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('B4 Usance/ACCEPT: the Reimbursement Receivable cannot be resolved (only the liability found) — fails cleanly after releasing the liability, never attempts the receivable, never re-releases the already-RELEASED B3 source', (done) => {
    const linked = [
      makeMovement({ movementId: 'accept-2', movementType: 'ACCEPT', businessEventId: 'be-b4u2' }),
      makeMovement({ movementId: 'liability-2', movementType: 'CREATE', businessEventId: 'be-b4u2' }),
    ];
    const api = makeApi({ findByBusinessEventId: jest.fn(() => of(linked)) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      selectedPayMovement: makeMovement({ movementId: 'source-b3' }),
      acceptanceMovementId: null,
      acceptanceReimbReceivableMovementId: null,
      selectedCheckerMovement: makeMovement({ movementId: 'accept-2', movementType: 'ACCEPT', businessEventId: 'be-b4u2' }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('Reimbursement Receivable could not be found');
      expect(api.release).toHaveBeenCalledTimes(2);
      done();
    });
  });

  // B4 skips sourceMovementId resolution entirely, unlike A6's "fail cleanly if unresolvable" path above.
  it('B4: never attempts to resolve or release a source movement at all — the payableMovementRequiresRelease branch skips straight to the primary', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      selectedPayMovement: null,
      selectedCheckerMovement: makeMovement({ movementId: 'honour-3', movementType: 'HONOUR', referencedTransactionId: null, businessEventId: null }),
    });

    service.release(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.release).toHaveBeenCalledTimes(1);
      expect(api.release).toHaveBeenCalledWith('honour-3', 'checker1');
      done();
    });
  });
});

describe('CheckerActionsService.reject() — prefers selectedCheckerMovement over submitResult', () => {
  it('rejects selectedCheckerMovement.movementId when present, ignoring a stale/mismatched submitResult', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({
      selectedFunction: A1,
      submitResult: makeMovement({ movementId: 'stale-mv' }),
      selectedCheckerMovement: makeMovement({ movementId: 'fresh-mv' }),
    });

    service.reject(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.reject).toHaveBeenCalledWith('fresh-mv', 'checker1', 'MANUAL_TEST_REJECT');
      done();
    });
  });

  it('falls back to submitResult.movementId when selectedCheckerMovement is null', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ selectedFunction: A1, submitResult: makeMovement({ movementId: 'only-submit-result' }), selectedCheckerMovement: null });

    service.reject(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.reject).toHaveBeenCalledWith('only-submit-result', 'checker1', 'MANUAL_TEST_REJECT');
      done();
    });
  });
});

describe('CheckerActionsService.deleteMakerPending() — BAL-132 createdBy runtime guard', () => {
  it('fails cleanly, without calling the API, when createdBy is null', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ createdBy: null, submitResult: makeMovement({ movementId: 'mv-1' }) });

    service.deleteMakerPending(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('no Maker (createdBy) is known');
      expect(api.cancel).not.toHaveBeenCalled();
      done();
    });
  });

  it('still cancels normally when createdBy is present (unaffected by the new guard)', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-2' }) });

    service.deleteMakerPending(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.cancel).toHaveBeenCalledWith('mv-2', 'maker1', 'MAKER_EC');
      done();
    });
  });
});

describe('CheckerActionsService.withdrawMakerPending() — A4\'s own Delete Pending (business-confirmed 2026-08-27)', () => {
  it('fails cleanly, without calling the API, when createdBy is null', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ createdBy: null, submitResult: makeMovement({ movementId: 'mv-1' }) });

    service.withdrawMakerPending(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('no Maker (createdBy) is known');
      expect(api.withdrawMakerSubmit).not.toHaveBeenCalled();
      done();
    });
  });

  it('fails cleanly, without calling the API, when submitResult is null', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ createdBy: 'maker1', submitResult: null });

    service.withdrawMakerPending(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toContain('no A4 submission is known');
      expect(api.withdrawMakerSubmit).not.toHaveBeenCalled();
      done();
    });
  });

  it('routes to api.withdrawMakerSubmit (not cancel) with submitResult\'s own movementId and ctx.createdBy', (done) => {
    const api = makeApi();
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-2' }) });

    service.withdrawMakerPending(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('released');
      expect(api.withdrawMakerSubmit).toHaveBeenCalledWith('mv-2', 'maker1');
      expect(api.cancel).not.toHaveBeenCalled();
      done();
    });
  });

  it('maps an API error to a failed outcome', (done) => {
    const api = makeApi({ withdrawMakerSubmit: jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))) });
    const service = new CheckerActionsService(api);
    const ctx = makeContext({ createdBy: 'maker1', submitResult: makeMovement({ movementId: 'mv-2' }) });

    service.withdrawMakerPending(ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') expect(outcome.message).toBe('ILLEGAL_STATE_TRANSITION');
      done();
    });
  });
});
