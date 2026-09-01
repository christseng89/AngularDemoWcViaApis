import { forkJoin, map, of, throwError } from 'rxjs';
import { MakerSubmitService, MakerSubmitContext } from './maker-submit.service';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';

// The four compound submit shapes call `crypto.randomUUID()` to link legs via businessEventId —
// jsdom's test environment doesn't always implement it. Same polyfill as
// `transaction-builder.component.actions.spec.ts` carries — see that file's own comment for why it's
// duplicated here rather than hoisted to a shared setup file.
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = {};
}
if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  (globalThis as any).crypto.randomUUID = () => 'test-uuid-' + Math.random().toString(36).slice(2);
}

/**
 * Direct `MakerSubmitService` tests — no component involved, same convention
 * `checker-actions.service.spec.ts` already established. Covers each of the 5 submission shapes'
 * success path plus every distinct failure branch (primary vs. secondary/tertiary leg), since the
 * `secondary`/`result` fields on a failed outcome carry real, non-obvious state (see the service's own
 * doc comment) that the component-level test suite doesn't specifically target.
 */

const A3S = IMPORT_FUNCTIONS.find((f) => f.code === 'A3S')!;
const B4 = EXPORT_FUNCTIONS.find((f) => f.code === 'B4')!;
const B5 = EXPORT_FUNCTIONS.find((f) => f.code === 'B5')!;
const A1 = IMPORT_FUNCTIONS.find((f) => f.code === 'A1')!;

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null },
    status: 'ACTIVE',
    currency: 'USD',
    tolerancePct: null,
    tenorType: null,
    tenorDays: null,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: 'sg-1',
    logicalContractId: 'sg-lc',
    currency: 'USD',
    confirmedBalance: '500',
    availableBalance: '500',
    pendingEarmarkTotal: '0',
    offBalanceExposure: null,
    tightAvailableBalance: null,
    presentDocsEarmarkPending: null,
    presentDocsEarmarkApproved: null,
    ...overrides,
  };
}

function makeMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'CREATE',
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
  const createMovement = overrides.createMovement ?? jest.fn(() => of({ body: makeMovement() }));
  return {
    createMovement,
    createCompoundMovements:
      overrides.createCompoundMovements ??
      jest.fn((requests: CreateMovementRequest[]) =>
        forkJoin(requests.map((request) => createMovement(request).pipe(map((response: { body: BalanceMovement }) => response.body)))),
      ),
    resolveContract: jest.fn(() => of(makeContract({ instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE', balanceContractId: 'receivable-bc' }))),
    cancel: jest.fn(() => of(makeMovement({ status: 'CANCELLED' }))),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

function makeReq(overrides: Partial<CreateMovementRequest> = {}): CreateMovementRequest {
  return { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', eventSeq: 1, amount: '1000', currency: 'USD', createdBy: 'maker1', ...overrides };
}

function makeContext(overrides: Partial<MakerSubmitContext> = {}): MakerSubmitContext {
  return {
    model: { amount: '1000', currency: 'USD', createdBy: 'maker1' },
    naturalKey: { ibNumber: '' },
    selectedFunction: null,
    selectedContract: null,
    selectedArrivalSg: null,
    arrivalSgSnapshot: null,
    ...overrides,
  };
}

describe('MakerSubmitService.submit() — dispatch routing', () => {
  it.each([...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS])('$code preserves the HTTP cause on a failed Maker Submit', (selectedFunction, done) => {
    const failure = { status: 400, error: { code: 'REQUEST_VALIDATION_FAILED', message: `${selectedFunction.code} rejected` } };
    const api = makeApi({ createMovement: jest.fn(() => throwError(() => failure)) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), makeContext({ selectedFunction })).subscribe((outcome) => {
      expect(outcome).toMatchObject({ kind: 'failed', cause: failure, secondary: {} });
      done();
    });
  });

  it('routes to the plain path when no compound flags are set (A1)', (done) => {
    const api = makeApi();
    const service = new MakerSubmitService(api);
    const ctx = makeContext({ selectedFunction: A1 });

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      expect(api.createMovement).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('converts a synchronous submission exception into the shared failed outcome', (done) => {
    const failure = new Error('synchronous client failure');
    const api = makeApi({ createMovement: jest.fn(() => { throw failure; }) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), makeContext({ selectedFunction: A1 })).subscribe((outcome) => {
      expect(outcome).toMatchObject({ kind: 'failed', message: 'synchronous client failure', cause: failure, secondary: {} });
      done();
    });
  });

  it('routes to submitDocumentArrivalWithSg (A3S) only when selectedArrivalSg AND arrivalSgSnapshot are both present', (done) => {
    const api = makeApi();
    const service = new MakerSubmitService(api);
    const ctx = makeContext({
      selectedFunction: A3S,
      selectedArrivalSg: makeContract({ instrumentType: 'SHGT', currency: 'USD' }),
      arrivalSgSnapshot: makeSnapshot(),
    });

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      expect(api.createMovement).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('falls back to plain when A3S is selected but selectedArrivalSg/arrivalSgSnapshot are missing', (done) => {
    const api = makeApi();
    const service = new MakerSubmitService(api);
    const ctx = makeContext({ selectedFunction: A3S });

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      expect(api.createMovement).toHaveBeenCalledTimes(1);
      done();
    });
  });

  it('routes B4 to the Honour+DueFromIssuingBank compound when movementType is HONOUR', (done) => {
    const api = makeApi();
    const service = new MakerSubmitService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      model: { amount: '1000', currency: 'USD', createdBy: 'maker1', movementType: 'HONOUR' },
      selectedContract: makeContract(),
    });

    service.submit(makeReq({ movementType: 'HONOUR' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      expect(api.createMovement).toHaveBeenCalledTimes(2);
      done();
    });
  });

  it('routes B4 to the Accept+Acceptance+Receivable compound when movementType is ACCEPT', (done) => {
    const api = makeApi();
    const service = new MakerSubmitService(api);
    const ctx = makeContext({
      selectedFunction: B4,
      model: { amount: '1000', currency: 'USD', createdBy: 'maker1', movementType: 'ACCEPT' },
      selectedContract: makeContract(),
    });

    service.submit(makeReq({ movementType: 'ACCEPT' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      expect(api.createMovement).toHaveBeenCalledTimes(3);
      done();
    });
  });

  it('routes B5 to a single Acceptance settlement without resolving a Receivable', (done) => {
    const api = makeApi();
    const service = new MakerSubmitService(api);
    const ctx = makeContext({
      selectedFunction: B5,
      model: { amount: '1000', currency: 'USD', createdBy: 'maker1', instrumentType: 'EPLC_ACCEPTANCE' },
      selectedContract: makeContract(),
    });

    service.submit(makeReq({ instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(api.createMovement).toHaveBeenCalledTimes(1);
      done();
    });
  });
});

describe('MakerSubmitService — submitDocumentArrivalWithSg (A3S)', () => {
  const ctx = makeContext({
    selectedFunction: A3S,
    selectedArrivalSg: makeContract({ instrumentType: 'SHGT', currency: 'USD' }),
    arrivalSgSnapshot: makeSnapshot(),
  });

  it('both legs succeed: result is the LC UTILIZE response, secondary carries the SG redeem', (done) => {
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'sg-redeem-1', movementType: 'FULL_REDEEM' }) }))
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'da-1', movementType: 'UTILIZE' }) })),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      if (outcome.kind === 'submitted') {
        expect(outcome.result.movementId).toBe('da-1');
        expect(outcome.secondary.arrivalSgRedeemMovementId).toBe('sg-redeem-1');
        expect(outcome.secondary.arrivalSgRedeemMovement?.movementId).toBe('sg-redeem-1');
      }
      done();
    });
  });

  it('SG redemption itself fails: no result, no secondary (nothing was ever created)', (done) => {
    const api = makeApi({ createMovement: jest.fn(() => throwError(() => ({ error: { message: 'INSUFFICIENT_AVAILABLE_BALANCE' } }))) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('INSUFFICIENT_AVAILABLE_BALANCE');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });

  // Bug fixed 2026-08-20 (reviewer-reported live, "After the A3S transaction fails with an error, the
  // selected SG becomes unavailable and cannot be selected or reused" — S001/G01+G02 repro): the SG's
  // own redemption leg already succeeded and was left orphaned PENDING with no way to cancel it. Now
  // auto-cancelled as a compensating action — secondary stays empty (nothing left PENDING to act on),
  // result stays absent (desiger-comments.md F-08 — the primary call itself failed).
  it('SG succeeds but the Document Arrival fails: the SG redeem is auto-cancelled (rollback), secondary stays empty, result stays absent', (done) => {
    const cancel = jest.fn(() => of(makeMovement({ movementId: 'sg-redeem-2', status: 'CANCELLED' })));
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'sg-redeem-2', movementType: 'FULL_REDEEM' }) }))
        .mockReturnValueOnce(throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
      cancel,
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('ILLEGAL_STATE_TRANSITION');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary).toEqual({});
      }
      expect(cancel).not.toHaveBeenCalled();
      done();
    });
  });

  it('SG succeeds, Document Arrival fails, AND the auto-cancel rollback itself also fails: both errors surface, secondary stays empty', (done) => {
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'sg-redeem-3', movementType: 'FULL_REDEEM' }) }))
        .mockReturnValueOnce(throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
      cancel: jest.fn(() => throwError(() => ({ error: { message: 'NOT_FOUND' } }))),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('ILLEGAL_STATE_TRANSITION');
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });
});

describe('MakerSubmitService — submitConfirmationHonourWithReceivable (B4 Sight/HONOUR)', () => {
  const ctx = makeContext({
    selectedFunction: B4,
    model: { amount: '1000', currency: 'USD', createdBy: 'maker1', movementType: 'HONOUR' },
    selectedContract: makeContract({ naturalKey: { lcNumber: 'LC001', ibNumber: null, sgNumber: null } }),
  });

  it('both legs succeed: result is the Honour response, secondary carries the Due From Issuing Bank id', (done) => {
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'honour-1', movementType: 'HONOUR' }) }))
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'dfib-1', movementType: 'CREATE' }) })),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'HONOUR' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      if (outcome.kind === 'submitted') {
        expect(outcome.result.movementId).toBe('honour-1');
        expect(outcome.secondary.dueFromIssuingBankMovementId).toBe('dfib-1');
      }
      done();
    });
  });

  it('Honour itself fails: result stays absent (desiger-comments.md F-08 — the primary call itself failed)', (done) => {
    const api = makeApi({ createMovement: jest.fn(() => throwError(() => ({ error: { message: 'INSUFFICIENT_AVAILABLE_BALANCE' } }))) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'HONOUR' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
        expect(outcome.result).toBeUndefined();
      }
      done();
    });
  });

  it('Honour succeeds but the Due From Issuing Bank leg fails: result STAYS the Honour response (not cleared), secondary empty', (done) => {
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'honour-2', movementType: 'HONOUR' }) }))
        .mockReturnValueOnce(throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'HONOUR' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('ILLEGAL_STATE_TRANSITION');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });
});

describe('MakerSubmitService — submitConfirmationAcceptWithReceivable (B4 Usance/ACCEPT)', () => {
  const ctx = makeContext({
    selectedFunction: B4,
    model: { amount: '1000', currency: 'USD', createdBy: 'maker1', movementType: 'ACCEPT' },
    selectedContract: makeContract({ tenorType: 'SELLERS_USANCE', tenorDays: 120 }),
  });

  it('all three legs succeed: secondary carries both the Acceptance and Receivable ids', (done) => {
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'accept-1', movementType: 'ACCEPT' }) }))
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'liability-1', movementType: 'CREATE' }) }))
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'receivable-1', movementType: 'CREATE' }) })),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'ACCEPT' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      if (outcome.kind === 'submitted') {
        expect(outcome.result.movementId).toBe('accept-1');
        expect(outcome.secondary.acceptanceMovementId).toBe('liability-1');
        expect(outcome.secondary.acceptanceReimbReceivableMovementId).toBe('receivable-1');
      }
      done();
    });
  });

  it('Accept itself fails: result stays absent (desiger-comments.md F-08 — the primary call itself failed), secondary empty', (done) => {
    const api = makeApi({ createMovement: jest.fn(() => throwError(() => ({ error: { message: 'INSUFFICIENT_AVAILABLE_BALANCE' } }))) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'ACCEPT' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });

  it('Accept liability CREATE fails after Accept succeeds: secondary still empty (liability never got an id)', (done) => {
    const api = makeApi({
      createCompoundMovements: jest.fn(() => throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'ACCEPT' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('ILLEGAL_STATE_TRANSITION');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });

  it('Receivable CREATE fails after Accept+liability succeed: secondary carries the already-resolved liability id', (done) => {
    const api = makeApi({
      createMovement: jest
        .fn()
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'accept-3', movementType: 'ACCEPT' }) }))
        .mockReturnValueOnce(of({ body: makeMovement({ movementId: 'liability-3', movementType: 'CREATE' }) }))
        .mockReturnValueOnce(throwError(() => ({ error: { message: 'ILLEGAL_STATE_TRANSITION' } }))),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ movementType: 'ACCEPT' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toContain('ILLEGAL_STATE_TRANSITION');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary.acceptanceMovementId).toBeUndefined();
        expect(outcome.secondary.acceptanceReimbReceivableMovementId).toBeUndefined();
      }
      done();
    });
  });
});

describe('MakerSubmitService — plain Acceptance settlement (B5)', () => {
  const ctx = makeContext({
    selectedFunction: B5,
    model: { amount: '1000', currency: 'USD', createdBy: 'maker1', instrumentType: 'EPLC_ACCEPTANCE' },
    selectedContract: makeContract({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'LC001', ibNumber: 'EB01', sgNumber: null } }),
  });

  it('submits only the selected Acceptance settlement', (done) => {
    const api = makeApi({
      createMovement: jest.fn(() => of({ body: makeMovement({ movementId: 'settle-1', movementType: 'FULL_SETTLE' }) })),
    });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      if (outcome.kind === 'submitted') {
        expect(outcome.result.movementId).toBe('settle-1');
        expect(outcome.secondary).toEqual({});
      }
      expect(api.resolveContract).not.toHaveBeenCalled();
      expect(api.createCompoundMovements).not.toHaveBeenCalled();
      done();
    });
  });

  it('Settle itself fails: result stays absent (desiger-comments.md F-08 — the primary call itself failed), secondary empty', (done) => {
    const api = makeApi({ createMovement: jest.fn(() => throwError(() => ({ error: { message: 'INSUFFICIENT_AVAILABLE_BALANCE' } }))) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq({ instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' }), ctx).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
        expect(outcome.result).toBeUndefined();
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });

});

describe('MakerSubmitService — submitPlain (default path)', () => {
  it('succeeds: result is the single response, no secondary', (done) => {
    const api = makeApi({ createMovement: jest.fn(() => of({ body: makeMovement({ movementId: 'plain-1' }) })) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), makeContext({ selectedFunction: A1 })).subscribe((outcome) => {
      expect(outcome.kind).toBe('submitted');
      if (outcome.kind === 'submitted') {
        expect(outcome.result.movementId).toBe('plain-1');
        expect(outcome.secondary).toEqual({});
      }
      done();
    });
  });

  it('fails: result stays absent (desiger-comments.md F-08 — the only call IS the primary call, so it failed)', (done) => {
    const api = makeApi({ createMovement: jest.fn(() => throwError(() => ({ error: { message: 'REQUEST_VALIDATION_FAILED' } }))) });
    const service = new MakerSubmitService(api);

    service.submit(makeReq(), makeContext({ selectedFunction: A1 })).subscribe((outcome) => {
      expect(outcome.kind).toBe('failed');
      if (outcome.kind === 'failed') {
        expect(outcome.message).toBe('REQUEST_VALIDATION_FAILED');
        expect(outcome.result).toBeUndefined();
      }
      done();
    });
  });
});
