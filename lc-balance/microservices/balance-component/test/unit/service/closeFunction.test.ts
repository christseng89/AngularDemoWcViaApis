/**
 * A10 (Import LC Close) / B6 (Export Confirmed LC Close) — end-to-end BalanceService coverage. See
 * domain/closeEligibility.test.ts for the pure eligibility-rule unit tests; this file exercises the
 * three-layer wiring (createMovement()'s own closeShaped sufficiency check, release()'s own re-check +
 * markClosed() side effect, listCloseEligibleContracts()'s own Step-1 picker hint) against a real
 * in-memory DB, same convention as balanceService.test.ts.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { IllegalStateTransitionError, InsufficientBalanceError, NotFoundError, RequestValidationError } from '../../../src/errors';

function issueImportLc(service: BalanceService, lcNumber: string, amount = '10000') {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE', expiryDate: '2030-12-31T00:00:00Z',
    eventSeq: 1,
    amount,
    currency: 'USD',
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

function issueConfirmation(service: BalanceService, lcNumber: string, amount = '10000') {
  const issue = service.createMovement({
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber },
    movementType: 'ISSUE', expiryDate: '2030-12-31T00:00:00Z',
    eventSeq: 1,
    amount,
    currency: 'USD',
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber });
  if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');
  return confirmation;
}

describe('A10 — Import LC Close', () => {
  test('happy path: SG=0, Acceptance=0, no open Events -> Submit + Release writes off Confirmed Balance to 0 and sets status CLOSED', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-001');

    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');
    expect(close.movement.status).toBe('PENDING');

    const released = service.release(close.movement.movementId, 'checker1');
    expect(released.status).toBe('RELEASED');

    const snapshot = service.getBalanceSnapshot(lc.balanceContractId);
    expect(snapshot.confirmedBalance).toBe('0');

    // Locked out (free side effect of status no longer being ACTIVE) — the natural-key resolution path
    // every other A2-A10 function uses can no longer find this LC.
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'CLOSE-A10-001' })).toBeUndefined();
  });

  test('blocked: non-zero SG Balance', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-002');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'CLOSE-A10-002', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '2000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InsufficientBalanceError);
  });

  test('blocked: a still-PENDING event anywhere in the tree (an unreleased SG Issue), even though its own Confirmed contribution is still 0', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-003');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'CLOSE-A10-003', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '2000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    // Deliberately NOT released — still PENDING.

    let error: unknown;
    try {
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InsufficientBalanceError);
    expect((error as Error).message).toContain('not yet fully resolved');
  });

  test('blocked: a PENDING event on the root LC itself (an unreleased AMEND_INCREASE)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-004');
    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 2,
      amount: '500',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    // Deliberately NOT released.

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 3,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InsufficientBalanceError);
  });

  test('blocked: submitted amount does not exactly equal the current Confirmed Balance', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-005');

    let error: unknown;
    try {
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '9999',
        currency: 'USD',
        createdBy: 'maker1',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InsufficientBalanceError);
    expect((error as Error).message).toContain('must exactly equal the current Confirmed Balance');
  });

  test('release() re-checks eligibility/amount against the THEN-current state — a Confirmed Balance change between Submit and Approve blocks Release, not just Submit', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-006');

    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');

    // A genuinely separate transaction races ahead of the still-PENDING CLOSE and completes its own full
    // Submit -> Approve cycle, moving Confirmed Balance out from under the CLOSE movement's own frozen
    // ceilingAmount (10000 was correct at Submit time; it no longer is at Approve time). Must be an
    // INCREASE, not another decrease — the still-PENDING CLOSE's own -10000 already drives
    // computePendingDecreaseTotal()/Tight Available Balance to 0, so a second decrease-shaped movement
    // (AMEND_DECREASE/UTILIZE/etc.) could never itself pass sufficiency while CLOSE is in flight; only an
    // AMEND_INCREASE is ungated (see buildMovementTypeRegistry()'s own `noCheck` entry for it).
    const increase = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 3,
      amount: '3000',
      currency: 'USD',
      createdBy: 'maker2',
    });
    if (!increase.created) throw new Error('expected a new movement');
    service.release(increase.movement.movementId, 'checker2');

    expect(() => service.release(close.movement.movementId, 'checker1')).toThrow(IllegalStateTransitionError);
  });

  test('blocked: already CLOSED (release() re-check path, via balanceContractId which bypasses the ACTIVE-only naturalKey resolution)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-007');
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    let error: unknown;
    try {
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 3,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InsufficientBalanceError);
    expect((error as Error).message).toContain('already been Closed');
  });

  test('locked out: every other function (e.g. AMEND_INCREASE) can no longer resolve this LC by natural key once Closed', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-008');
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'CLOSE-A10-008' },
        movementType: 'AMEND_INCREASE',
        eventSeq: 3,
        amount: '500',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(NotFoundError);
  });

  test('rejected: Close attempted against a non-root instrumentType', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CLOSE-A10-009');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'CLOSE-A10-009', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '2000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    // Reaches the SAME "only a root instrumentType" guard as listCloseEligibleContracts() below, but via
    // the closeShaped sufficiency-check path — createMovement() always wraps a `{ok:false}` sufficiency
    // result in InsufficientBalanceError, same as every other movementType's own rejection, regardless of
    // the underlying reason (see MovementSufficiencyOutcome's own doc comment).
    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        balanceContractId: sgIssue.movement.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '2000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InsufficientBalanceError);
  });
});

describe('B6 — Export Confirmed LC Close', () => {
  test('happy path: Present Docs fully honoured (consumed) -> Confirmed Balance already 0 -> Close succeeds', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'CLOSE-B6-001');

    const exam = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'CLOSE-B6-001', ibNumber: 'EB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!exam.created) throw new Error('expected a new movement');
    service.release(exam.movement.movementId, 'checker1');

    const honour = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: confirmation.balanceContractId,
      movementType: 'HONOUR',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: exam.movement.movementId,
      createdBy: 'maker1',
    });
    if (!honour.created) throw new Error('expected a new movement');
    service.release(honour.movement.movementId, 'checker2');

    const close = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: confirmation.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');
    const released = service.release(close.movement.movementId, 'checker3');
    expect(released.status).toBe('RELEASED');
    expect(service.getBalanceSnapshot(confirmation.balanceContractId).confirmedBalance).toBe('0');
  });

  test('blocked: a RELEASED-but-not-yet-consumed Present Docs presentation (B3 approved, B4 has not Honoured/Accepted it yet) — status alone is not enough', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'CLOSE-B6-002');

    const exam = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'CLOSE-B6-002', ibNumber: 'EB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '5000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!exam.created) throw new Error('expected a new movement');
    service.release(exam.movement.movementId, 'checker1');
    expect(exam.movement.movementId).toBeDefined();

    let error: unknown;
    try {
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InsufficientBalanceError);
    expect((error as Error).message).toContain('not yet fully resolved');
  });

  test('blocked: non-zero Acceptance Balance', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'CLOSE-B6-003');

    const acceptCreate = service.createMovement({
      instrumentType: 'EPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'CLOSE-B6-003', ibNumber: 'EB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '3000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      tenorType: 'SELLERS_USANCE',
      createdBy: 'maker1',
    });
    if (!acceptCreate.created) throw new Error('expected a new movement');
    service.release(acceptCreate.movement.movementId, 'checker1');

    let error: unknown;
    try {
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(InsufficientBalanceError);
    expect((error as Error).message).toContain('Acceptance Balance must be 0');
  });
});

describe('BalanceService.listCloseEligibleContracts — A10/B6 Step-1 picker hint', () => {
  test('returns only ACTIVE root contracts that currently pass eligibility, excluding an ineligible one and an already-Closed one', () => {
    const service = new BalanceService(createDb(':memory:'));

    const eligible = issueImportLc(service, 'CLOSE-HINT-001');

    const ineligible = issueImportLc(service, 'CLOSE-HINT-002');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'CLOSE-HINT-002', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '2000',
      currency: 'USD',
      parentLogicalContractId: ineligible.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    const alreadyClosed = issueImportLc(service, 'CLOSE-HINT-003');
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: alreadyClosed.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const page = service.listCloseEligibleContracts('IPLC_LC');
    expect(page.items.map((c) => c.balanceContractId)).toEqual([eligible.balanceContractId]);
    expect(page.total).toBe(1);
  });

  test('rejected for a non-root instrumentType', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => service.listCloseEligibleContracts('SHGT')).toThrow(RequestValidationError);
  });

  test('empty catalog -> empty eligible list, not an error', () => {
    const service = new BalanceService(createDb(':memory:'));
    const page = service.listCloseEligibleContracts('EPLC_CONFIRMATION');
    expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
  });
});
