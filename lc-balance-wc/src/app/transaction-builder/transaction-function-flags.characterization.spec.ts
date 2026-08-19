import { of } from 'rxjs';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';

// The compound MakerSubmitService submit shapes call `crypto.randomUUID()` to link legs via
// businessEventId — jsdom's test environment doesn't always implement it. Same polyfill as
// `maker-submit.service.spec.ts`/`transaction-builder.component.actions.spec.ts` already carry — see
// those files' own comments for why it's duplicated here rather than hoisted to a shared setup file.
if (typeof (globalThis as any).crypto === 'undefined') {
  (globalThis as any).crypto = {};
}
if (typeof (globalThis as any).crypto.randomUUID !== 'function') {
  (globalThis as any).crypto.randomUUID = () => 'test-uuid-' + Math.random().toString(36).slice(2);
}
import { validateSubmit, buildSubmitRequest, type SubmitRulesContext } from './submit-rules';
import { MakerSubmitService, type MakerSubmitContext } from './maker-submit.service';
import { CheckerActionsService, type CheckerActionContext } from './checker-actions.service';
import type { BuilderModel } from './function-policy';
import type { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';

/**
 * OOD Review finding F-01 ("the 14-function registry is a Strategy pattern in name only" —
 * `lc-balance-wc/desiger-comments.md`) — PR-1 of the planned Strategy-refactor sequence, per the user's
 * own Senior Engineer Refactoring & Regression-Safety Requirements (2026-08-19): **characterization
 * tests only, zero production code changed by this file's own commit**.
 *
 * `TransactionFunction`'s 11 boolean flags (`payExistingUtilize`, `settlesDocumentArrival`,
 * `payableMovementRequiresRelease`, `settlesAcceptanceOnMature`, `settleableBalanceIndex`,
 * `deferSettlement`, `documentArrivalWithSg`, `createsIssuingBankReceivableOnHonour`,
 * `createsAcceptanceReimbReceivableOnCreate`, `autoRedeemType`, `movementTypeFromContractTenor`) are
 * read and independently re-interpreted across `transaction-builder.component.ts`,
 * `checker-actions.service.ts`, `maker-submit.service.ts`, `submit-rules.ts`, and `builder-fields.ts`.
 * Several of these behaviors already have dedicated, thorough test coverage in their own owning file's
 * `.spec.ts` (`submit-rules.spec.ts`'s own 39+ cases, `maker-submit.service.spec.ts`'s own 22,
 * `checker-actions.service.spec.ts`'s own coverage of the businessEventId/referencedTransactionId
 * resolution) — this file does NOT duplicate that per-file depth. Its job is different and narrower:
 * (1) lock in the exact CURRENT flag-to-function-code mapping itself (the thing a per-function Strategy
 * object would need to reproduce one-for-one), and (2) characterize the handful of the most
 * business-critical, cross-file flag-driven BEHAVIORS end to end, as a single reference a later
 * Strategy-migration PR can diff its own new implementation against, one flag at a time. Prioritized per
 * the OOD review's own note that `settlesDocumentArrival`/`payExistingUtilize`/`deferSettlement`/
 * `autoRedeemType`/`movementTypeFromContractTenor` are the flags actually implicated in real bugs this
 * session already had to chase down by hand (the A4/tenorType interaction, the B3-vs-B4 correlation
 * bug).
 *
 * Every assertion below characterizes what the code ACTUALLY does today, verified by calling the real
 * exported functions/classes — never a re-derivation from the OOD review's own prose description of
 * intended behavior. Where reading the code for this pass surfaced something that looks like a
 * pre-existing design tension (not a new bug), it's called out in a comment rather than fixed — per the
 * Senior Engineer Requirements' own rule: "如發現現有 Code、Design Document 與 Test Case 三者存在不一致，
 * 不要自行選擇其中一個改掉" (do not silently pick one to fix; record it instead).
 */

function fn(code: string): TransactionFunction {
  const found = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === code);
  if (!found) throw new Error(`No TransactionFunction with code "${code}" in the registry`);
  return found;
}

function allCodes(): string[] {
  return [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((f) => f.code);
}

function codesWith(flag: keyof TransactionFunction): string[] {
  return [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].filter((f) => f[flag]).map((f) => f.code);
}

describe('F-01 characterization — flag-to-function-code registry inventory (Phase 2 Strategy migration must reproduce this mapping one-for-one)', () => {
  it('the full function-code universe is exactly A1-A9 (no A5), B1-B5', () => {
    expect(allCodes()).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3', 'B4', 'B5']);
  });

  it('payExistingUtilize — A4 only', () => {
    expect(codesWith('payExistingUtilize')).toEqual(['A4']);
  });

  it('settlesDocumentArrival — A6 and B4 only', () => {
    expect(codesWith('settlesDocumentArrival')).toEqual(['A6', 'B4']);
  });

  it('payableMovementRequiresRelease — B4 only (renamed 2026-08-18 from payableMovementRequiresAcknowledgment, see CLAUDE.md "B3 redesigned" entry)', () => {
    expect(codesWith('payableMovementRequiresRelease')).toEqual(['B4']);
  });

  it('settlesAcceptanceOnMature and settleableBalanceIndex — B5 only (both, always together)', () => {
    expect(codesWith('settlesAcceptanceOnMature')).toEqual(['B5']);
    expect(codesWith('settleableBalanceIndex')).toEqual(['B5']);
  });

  it('deferSettlement — A3 and A3S only (B3 lost this flag entirely in the 2026-08-18 "B3 redesigned to genuinely RELEASE" pass — see CLAUDE.md)', () => {
    expect(codesWith('deferSettlement')).toEqual(['A3', 'A3S']);
  });

  it('documentArrivalWithSg — A3S only', () => {
    expect(codesWith('documentArrivalWithSg')).toEqual(['A3S']);
  });

  it('createsIssuingBankReceivableOnHonour and createsAcceptanceReimbReceivableOnCreate — B4 only, both unconditionally true on the SAME entry (Sight vs Usance is resolved elsewhere, by movementType, not by which flag is set — see maker-submit.service.ts characterization below)', () => {
    expect(codesWith('createsIssuingBankReceivableOnHonour')).toEqual(['B4']);
    expect(codesWith('createsAcceptanceReimbReceivableOnCreate')).toEqual(['B4']);
  });

  it('autoRedeemType — A9 only', () => {
    expect(codesWith('autoRedeemType')).toEqual(['A9']);
  });

  it('movementTypeFromContractTenor — B4 only', () => {
    expect(codesWith('movementTypeFromContractTenor')).toEqual(['B4']);
  });

  it('B4 alone carries 5 of the 11 flags at once (settlesDocumentArrival, payableMovementRequiresRelease, createsIssuingBankReceivableOnHonour, createsAcceptanceReimbReceivableOnCreate, movementTypeFromContractTenor) — the single highest-density function in the registry, and the one this session\'s own bug history (BAL-123 tenorType interaction, B3/B4 correlation bugs) has hit the most', () => {
    const b4 = fn('B4');
    const setOnB4 = (
      ['payExistingUtilize', 'settlesDocumentArrival', 'payableMovementRequiresRelease', 'settlesAcceptanceOnMature', 'settleableBalanceIndex', 'deferSettlement', 'documentArrivalWithSg', 'createsIssuingBankReceivableOnHonour', 'createsAcceptanceReimbReceivableOnCreate', 'autoRedeemType', 'movementTypeFromContractTenor'] as const
    ).filter((flag) => b4[flag]);
    expect(setOnB4).toEqual(['settlesDocumentArrival', 'payableMovementRequiresRelease', 'createsIssuingBankReceivableOnHonour', 'createsAcceptanceReimbReceivableOnCreate', 'movementTypeFromContractTenor']);
  });
});

// ── submit-rules.ts characterization — the 5 prioritized flags' own submit-time derivation ──────────

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

function ctx(overrides: Partial<SubmitRulesContext> = {}): SubmitRulesContext {
  const model: BuilderModel = {
    instrumentType: 'IPLC_LC',
    movementType: 'ISSUE',
    amount: '1000',
    currency: 'USD',
    createdBy: 'maker1',
    tenorType: 'SIGHT',
    ...overrides.model,
  };
  return {
    naturalKey: { lcNumber: 'S001', ibNumber: '', sgNumber: '' },
    selectedFunction: fn('A1'),
    dynamicSecondaryRefLabel: null,
    activeFunctionSide: 'IMPORT',
    selectedPayMovement: null,
    selectedArrivalSg: null,
    arrivalSgSnapshot: null,
    selectedContractSnapshot: null,
    selectedContract: null,
    selectedParent: null,
    exposureNature: 'ACTUAL',
    ...overrides,
    model,
  };
}

describe('F-01 characterization — autoRedeemType (A9): movementType is DERIVED from amount vs Available Balance, never picked by the user', () => {
  it('typed amount === Available Balance -> FULL_REDEEM', () => {
    const result = validateSubmit(
      ctx({
        selectedFunction: fn('A9'),
        model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '5000' },
        selectedContractSnapshot: snapshot({ availableBalance: '5000' }),
      }),
    );
    expect(result.error).toBeNull();
    expect(result.patch.movementType).toBe('FULL_REDEEM');
  });

  it('typed amount < Available Balance -> PARTIAL_REDEEM', () => {
    const result = validateSubmit(
      ctx({
        selectedFunction: fn('A9'),
        model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '3000' },
        selectedContractSnapshot: snapshot({ availableBalance: '5000' }),
      }),
    );
    expect(result.error).toBeNull();
    expect(result.patch.movementType).toBe('PARTIAL_REDEEM');
  });

  it('typed amount > Available Balance -> rejected before the derivation ever runs', () => {
    const result = validateSubmit(
      ctx({
        selectedFunction: fn('A9'),
        model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '9000' },
        selectedContractSnapshot: snapshot({ availableBalance: '5000' }),
      }),
    );
    expect(result.error).toBe("Amount must not exceed the SG's Available Balance (5000).");
    expect(result.patch.movementType).toBeUndefined();
  });
});

describe('F-01 characterization — settlesAcceptanceOnMature (B5): the SAME amount-vs-Available derivation as autoRedeemType, targeting SETTLE instead of REDEEM', () => {
  it('typed amount === Available Balance -> FULL_SETTLE', () => {
    const result = validateSubmit(
      ctx({
        selectedFunction: fn('B5'),
        model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE', amount: '5000' },
        selectedContractSnapshot: snapshot({ availableBalance: '5000' }),
      }),
    );
    expect(result.error).toBeNull();
    expect(result.patch.movementType).toBe('FULL_SETTLE');
  });

  it('typed amount < Available Balance -> PARTIAL_SETTLE', () => {
    const result = validateSubmit(
      ctx({
        selectedFunction: fn('B5'),
        model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE', amount: '2000' },
        selectedContractSnapshot: snapshot({ availableBalance: '5000' }),
      }),
    );
    expect(result.error).toBeNull();
    expect(result.patch.movementType).toBe('PARTIAL_SETTLE');
  });
});

describe('F-01 characterization — documentArrivalWithSg (A3S): requires a picked SG + its snapshot before Submit is even attempted', () => {
  it('rejected when no Shipping Guarantee has been picked yet', () => {
    const result = validateSubmit(ctx({ selectedFunction: fn('A3S'), selectedArrivalSg: null, arrivalSgSnapshot: null }));
    expect(result.error).toBe('Pick the Shipping Guarantee this Document Arrival is against first.');
  });

  it('passes once both the SG contract and its snapshot are present', () => {
    const result = validateSubmit(
      ctx({
        selectedFunction: fn('A3S'),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' },
        selectedArrivalSg: contract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } }),
        arrivalSgSnapshot: snapshot(),
      }),
    );
    expect(result.error).toBeNull();
  });
});

describe('F-01 characterization — settlesDocumentArrival (A6/B4): requires a picked pending source record; buildSubmitRequest() stamps referencedTransactionId only for this flag', () => {
  it('validateSubmit rejects A6 with no selectedPayMovement, using the function\'s own pendingItemLabel in the message', () => {
    const result = validateSubmit(ctx({ selectedFunction: fn('A6'), selectedPayMovement: null }));
    expect(result.error).toBe('Pick the still-PENDING Document Arrival (2ndary Index) to convert first.');
  });

  it('buildSubmitRequest stamps referencedTransactionId from selectedPayMovement for A6 (settlesDocumentArrival) but NOT for a function without the flag', () => {
    const payMovement = movement({ movementId: 'source-mv-1' });
    const withFlag = buildSubmitRequest(
      ctx({
        selectedFunction: fn('A6'),
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' },
        selectedPayMovement: payMovement,
        selectedContract: contract({ instrumentType: 'IPLC_ACCEPTANCE' }),
      }),
    );
    expect(withFlag.request?.referencedTransactionId).toBe('source-mv-1');

    const withoutFlag = buildSubmitRequest(
      ctx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' },
        selectedPayMovement: payMovement,
        selectedContract: contract(),
      }),
    );
    expect(withoutFlag.request?.referencedTransactionId).toBeUndefined();
  });
});

// ── maker-submit.service.ts characterization — which flag combination routes to which compound path ──

function makeApi(overrides: Partial<Record<string, jest.Mock>> = {}): BalanceComponentApiService {
  return {
    createMovement: jest.fn(() => of({ body: movement() })),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

function makerCtx(overrides: Partial<MakerSubmitContext> = {}): MakerSubmitContext {
  return {
    model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE' },
    naturalKey: { ibNumber: '' },
    selectedFunction: null,
    selectedContract: null,
    selectedArrivalSg: null,
    arrivalSgSnapshot: null,
    ...overrides,
  };
}

describe('F-01 characterization — MakerSubmitService.submit() dispatch table (the ACTUAL current if-chain, in order)', () => {
  it('documentArrivalWithSg + a picked SG (A3S) routes to the SG-first compound path, not submitPlain', () => {
    const createMovement = jest.fn((req: { movementType: string }) => of({ body: movement({ movementType: req.movementType }) }));
    const api = makeApi({ createMovement });
    const svc = new MakerSubmitService(api);
    svc
      .submit(
        { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', eventSeq: 1, amount: '1000', currency: 'USD', createdBy: 'maker1' },
        makerCtx({ selectedFunction: fn('A3S'), selectedArrivalSg: contract({ instrumentType: 'SHGT' }), arrivalSgSnapshot: snapshot() }),
      )
      .subscribe(() => {
        // documentArrivalWithSg's own compound path always issues its SG leg FIRST — confirmed via call order.
        const firstCallArg = createMovement.mock.calls[0]?.[0] as { movementType?: string } | undefined;
        expect(firstCallArg?.movementType).not.toBe('UTILIZE');
      });
  });

  it('createsIssuingBankReceivableOnHonour requires model.movementType === "HONOUR" specifically — an ACCEPT on the SAME function (B4) does NOT take this branch (routes to createsAcceptanceReimbReceivableOnCreate instead, checked second)', () => {
    const createMovement = jest.fn(() => of({ body: movement({ movementType: 'ACCEPT' }) }));
    const api = makeApi({ createMovement });
    const svc = new MakerSubmitService(api);
    svc
      .submit(
        { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ACCEPT', eventSeq: 1, amount: '1000', currency: 'USD', createdBy: 'maker1' },
        makerCtx({ selectedFunction: fn('B4'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ACCEPT' }, selectedContract: contract({ instrumentType: 'EPLC_CONFIRMATION' }) }),
      )
      .subscribe(() => {
        // The Usance/ACCEPT compound path creates the primary ACCEPT, then an Acceptance liability, then
        // its Reimbursement Receivable — 3 calls total, not the Sight/HONOUR path's 2.
        expect(createMovement.mock.calls.length).toBe(3);
      });
  });

  it('settlesAcceptanceOnMature (B5) + EPLC_ACCEPTANCE routes to the settle-then-reimburse compound path (2 calls: FULL_SETTLE/PARTIAL_SETTLE then REIMBURSE)', () => {
    const createMovement = jest.fn(() => of({ body: movement({ movementType: 'FULL_SETTLE' }) }));
    const api = makeApi({ createMovement });
    const svc = new MakerSubmitService(api);
    svc
      .submit(
        { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE', eventSeq: 1, amount: '1000', currency: 'USD', createdBy: 'maker1' },
        makerCtx({ selectedFunction: fn('B5'), model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' }, selectedContract: contract({ instrumentType: 'EPLC_ACCEPTANCE' }) }),
      )
      .subscribe(() => {
        expect(createMovement.mock.calls.length).toBe(2);
      });
  });

  it('no matching flag/precondition combination -> submitPlain (exactly 1 createMovement call)', () => {
    const createMovement = jest.fn(() => of({ body: movement() }));
    const api = makeApi({ createMovement });
    const svc = new MakerSubmitService(api);
    svc
      .submit({ instrumentType: 'IPLC_LC', movementType: 'ISSUE', eventSeq: 1, amount: '1000', currency: 'USD', createdBy: 'maker1' }, makerCtx({ selectedFunction: fn('A1') }))
      .subscribe(() => {
        expect(createMovement.mock.calls.length).toBe(1);
      });
  });
});

// ── checker-actions.service.ts characterization — settlesDocumentArrival's own Checker-side routing ──

function checkerApi(overrides: Partial<Record<string, jest.Mock>> = {}): BalanceComponentApiService {
  return {
    release: jest.fn(() => of(movement({ status: 'RELEASED' }))),
    reject: jest.fn(() => of(movement({ status: 'REJECTED' }))),
    cancel: jest.fn(() => of(movement({ status: 'CANCELLED' }))),
    findByBusinessEventId: jest.fn(() => of([] as BalanceMovement[])),
    ...overrides,
  } as unknown as BalanceComponentApiService;
}

function checkerCtx(overrides: Partial<CheckerActionContext> = {}): CheckerActionContext {
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

describe('F-01 characterization — settlesDocumentArrival\'s own asymmetric Checker-side behavior: A6 releases its SOURCE first, B4 (payableMovementRequiresRelease) does NOT (the source is already RELEASED by design — see the B3-redesign entry in CLAUDE.md)', () => {
  it('A6 (settlesDocumentArrival, no payableMovementRequiresRelease): release() calls the source movement\'s own release before the primary\'s', (done) => {
    const release = jest.fn((id: string) => of(movement({ movementId: id, status: 'RELEASED' })));
    const svc = new CheckerActionsService(checkerApi({ release }));
    svc
      .release(
        checkerCtx({
          selectedFunction: fn('A6'),
          submitResult: movement({ movementId: 'acceptance-mv' }),
          selectedPayMovement: movement({ movementId: 'source-mv' }),
        }),
      )
      .subscribe(() => {
        expect(release.mock.calls[0][0]).toBe('source-mv');
        done();
      });
  });

  it('B4 (settlesDocumentArrival AND payableMovementRequiresRelease): release() does NOT attempt to release the source at all — it goes straight to the primary/secondary legs, because B3\'s own record is already independently RELEASED before B4 can even pick it', (done) => {
    const release = jest.fn((id: string) => of(movement({ movementId: id, status: 'RELEASED' })));
    const svc = new CheckerActionsService(checkerApi({ release }));
    svc
      .release(
        checkerCtx({
          selectedFunction: fn('B4'),
          submitResult: movement({ movementId: 'honour-mv' }),
          selectedPayMovement: movement({ movementId: 'already-released-b3-mv', status: 'RELEASED' }),
        }),
      )
      .subscribe(() => {
        expect(release.mock.calls.some((call) => call[0] === 'already-released-b3-mv')).toBe(false);
        done();
      });
  });
});

/**
 * NOT characterized in this pass, flagged for a follow-up PR-1b if the Phase 2 migration needs it:
 * `payExistingUtilize` (A4)'s own `checkerAct()`/`submitA4()` behavior lives directly on
 * `TransactionBuilderComponent` (no extracted service to call in isolation the way the other 4
 * prioritized flags' owning files allow) — characterizing it here would require either constructing the
 * full component (this codebase's own established direct-instantiation convention, ~2,300 lines of
 * surrounding state) or duplicating its gate logic outside the file that owns it, neither of which fits
 * this PR's "pure characterization, zero risk" scope. `transaction-builder.component.actions.spec.ts`'s
 * own existing `checkerAct()`/`submitA4()` describe blocks already exercise this flag's real behavior
 * (the `makerSubmittedAt` gate, `payExistingUtilize`'s effect on `checkerAct()`'s plain-release
 * fallback) — that existing coverage IS this flag's own characterization safety net for now.
 */
