/**
 * Direct BalanceService unit tests — bypasses routes/balanceMovements.ts entirely (no HTTP/supertest),
 * proving the invariant money.ts's own doc comment states ("the only place in the service allowed to
 * construct a Decimal from a wire string") actually holds at the service layer, not just at the HTTP
 * boundary. Quality-report-balance.md BAL-115: three call sites in createMovement() used to construct
 * `new Decimal(req.amount)` directly, bypassing parseMonetaryAmount()'s own MONETARY_AMOUNT_PATTERN
 * check — invisible when only exercised via app.test.ts's HTTP-integration tests, since
 * routes/balanceMovements.ts now validates the amount's shape before ever calling createMovement(). A
 * caller that constructs a BalanceService directly (as these tests do, and as any future non-HTTP
 * caller would) skips that route-level check entirely, so the invariant needs its own, separate proof.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { InvalidMonetaryAmountError } from '../../../src/money';
import {
  CurrencyMismatchError,
  IllegalStateTransitionError,
  InsufficientBalanceError,
  NaturalKeyAlreadyExistsError,
  NotFoundError,
  RequestValidationError,
} from '../../../src/errors';
import { DeletePendingAuditStore } from '../../../src/store/deletePendingAuditStore';
import { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import { BalanceContractStore } from '../../../src/store/balanceContractStore';
import { MovementSnapshotService } from '../../../src/service/movementSnapshotService';

describe('BalanceService.createMovement — parseMonetaryAmount enforcement at the service layer (BAL-115)', () => {
  test('AMEND_DECREASE with a malformed amount throws InvalidMonetaryAmountError, not a silent NaN comparison', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BAL115-AD-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: 'not-a-number',
        currency: 'USD',
        sourceTransactionRef: 'AD-001',
        createdBy: 'maker1',
      }),
    ).toThrow(InvalidMonetaryAmountError);
  });

  test('SHGT ISSUE (SG Issue vs. parent LC Tight Available Balance check) with a malformed amount throws InvalidMonetaryAmountError', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BAL115-SG-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'BAL115-SG-001' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'BAL115-SG-001', sgNumber: 'SG01' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: 'garbage',
        currency: 'USD',
        parentLogicalContractId: lc.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(InvalidMonetaryAmountError);
  });

  test('EPLC_EXAMINATION CREATE (Present Docs earmark check vs. parent Confirmation) with a malformed amount throws InvalidMonetaryAmountError', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'BAL115-PD-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'BAL115-PD-001' });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');

    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'BAL115-PD-001', ibNumber: 'EB01' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: 'nope',
        currency: 'USD',
        parentLogicalContractId: confirmation.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(InvalidMonetaryAmountError);
  });
});

/**
 * CurrencyMismatchError (2026-08-24) — currency stays a required request field (unlike the
 * OAS-GAP-16 "derive/omit" design that was proposed and reverted along with unrelated work), but a
 * caller-supplied value that disagrees with the resolved contract's — or, for a new child contract,
 * its parent's — own stored currency must be rejected rather than silently recorded on the new
 * movement. See resolveOrCreateContract()'s own doc comment for where each check lives.
 */
describe('BalanceService.createMovement — currency consistency (CurrencyMismatchError)', () => {
  test('existing contract: a mismatching currency on a follow-up movement is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CCY-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '5000',
        currency: 'EUR',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      }),
    ).toThrow(CurrencyMismatchError);
  });

  test('existing contract: a matching currency on a follow-up movement still succeeds', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CCY-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 2,
      amount: '5000',
      currency: 'USD',
      sourceTransactionRef: 'AMD-001',
      createdBy: 'maker1',
    });
    expect(amend.created).toBe(true);
  });

  test('new child contract (SHGT ISSUE): a currency that disagrees with the parent LC is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CCY-003' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'CCY-003' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'CCY-003', sgNumber: 'SG01' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'GBP',
        parentLogicalContractId: lc.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(CurrencyMismatchError);
  });

  test('new child contract (SHGT ISSUE): a currency matching the parent LC still succeeds', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CCY-004' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'CCY-004' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'CCY-004', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    expect(sgIssue.created).toBe(true);
  });
});

/**
 * Bug fixed 2026-08-16, reviewer-reported ("A1 -> A8 -> A3S -> A4, the related SG entries was not
 * shown"): a Checker session independent of the Maker's own in-memory submitResult had no way to
 * resolve A3S's own linked SG redemption movement, so it silently never got released — see
 * BalanceMovementStore.findByBusinessEventId's own doc comment for the full root cause.
 */
describe('BalanceService.findByBusinessEventId', () => {
  test('returns every movement sharing a businessEventId, across different contracts, oldest first', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BEID-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'BEID-001' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'BEID-001', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '20000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    const businessEventId = '11111111-1111-1111-1111-111111111111';
    const sgRedeem = service.createMovement({
      instrumentType: 'SHGT',
      balanceContractId: sgIssue.movement.balanceContractId,
      movementType: 'FULL_REDEEM',
      eventSeq: 2,
      amount: '20000',
      currency: 'USD',
      businessEventId,
      createdBy: 'maker1',
    });
    if (!sgRedeem.created) throw new Error('expected a new movement');
    const lcUtilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '20000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      businessEventId,
      createdBy: 'maker1',
    });
    if (!lcUtilize.created) throw new Error('expected a new movement');

    const linked = service.findByBusinessEventId(businessEventId);

    expect(linked.map((m) => m.movementId)).toEqual([sgRedeem.movement.movementId, lcUtilize.movement.movementId]);
    expect(linked.map((m) => m.movementType)).toEqual(['FULL_REDEEM', 'UTILIZE']);
    // The LC's own earlier ISSUE (no businessEventId) and the SG's own ISSUE are NOT included.
    expect(linked.every((m) => m.movementType !== 'ISSUE')).toBe(true);
  });

  test('returns an empty array for a businessEventId no movement carries', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(service.findByBusinessEventId('99999999-9999-9999-9999-999999999999')).toEqual([]);
  });
});

/**
 * Business instruction 2026-08-17 ("PENDING XOR APPROVED... 只存PENDING 或 APPROVED 其中一個") — the
 * persisted Event Snapshot on BalanceMovement.eventSnapshot: captured at createMovement() (PENDING
 * state, includes this new movement's own contribution), overwritten at release() (RELEASED state),
 * left untouched by reject() (out of scope per business instruction). Values proven equal to what
 * getBalanceSnapshotAsOfMovement() (the pre-existing on-demand computation) would independently return
 * for the same movement — the two must never diverge, since Inquire Events reads whichever one it
 * prefers.
 */
describe('BalanceService — persisted Event Snapshot (createMovement PENDING, release RELEASED)', () => {
  test('createMovement() stores a non-null eventSnapshot reflecting the PENDING state, including this movement\'s own earmark contribution', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'EVSNAP-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');

    expect(issue.movement.status).toBe('PENDING');
    expect(issue.movement.eventSnapshot).not.toBeNull();
    expect(issue.movement.eventSnapshot!.confirmedBalance).toBe('0');
    expect(issue.movement.eventSnapshot!.availableBalance).toBe('100000');
    expect(issue.movement.eventSnapshot!.offBalanceExposure).toBe('0');

    expect(issue.movement.eventSnapshot).toEqual(service.getBalanceSnapshotAsOfMovement(issue.movement.movementId));
  });

  test('release() overwrites eventSnapshot with the RELEASED-state figures — confirmedBalance moves from 0 to the released amount', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'EVSNAP-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    expect(issue.movement.eventSnapshot!.confirmedBalance).toBe('0');

    const released = service.release(issue.movement.movementId, 'checker1');

    expect(released.status).toBe('RELEASED');
    expect(released.eventSnapshot).not.toBeNull();
    expect(released.eventSnapshot!.confirmedBalance).toBe('100000');
    expect(released.eventSnapshot!.availableBalance).toBe('100000');
    expect(released.eventSnapshot).toEqual(service.getBalanceSnapshotAsOfMovement(released.movementId));
  });

  test('reject() leaves eventSnapshot exactly as captured at createMovement() — out of scope for this feature', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'EVSNAP-003' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    const pendingSnapshot = issue.movement.eventSnapshot;

    const rejected = service.reject(issue.movement.movementId, 'checker1', 'R01', 'not needed');

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.eventSnapshot).toEqual(pendingSnapshot);
  });

  /**
   * Business instruction 2026-08-17 ("REFER TO DB S01" — SG G01's own Event Snapshot showed only the
   * SG's own ledger, business-rejected as incomplete; then simplified to "不複雜 就是交易處理時 Look
   * Up Current Balance 的SNAPSHOT (PENDING OR APPROVED) SAVED TO DB == EVENT BALANCE SNAPSHOT") —
   * eventSnapshot stays the SG's OWN ledger (unchanged, own contract), and a SEPARATE
   * rootEventSnapshot ADDITIONALLY captures the PARENT LC's own plain balance at the same moment —
   * both present, neither replacing the other. Reproduces the user's own worked example: LC 100000, SG
   * Issue 32000 — SG's own eventSnapshot shows Confirmed Balance 0->32000/Available 32000; the LC's own
   * rootEventSnapshot shows Confirmed Balance unchanged 100000, Off-Balance Exposure 32000, Tight
   * Available Balance 68000 (plain — no before/after decoration, matching what Look Up Current Balance
   * would show for the LC right then).
   */
  test('an SHGT ISSUE captures its own eventSnapshot (own ledger) AND a separate rootEventSnapshot (parent LC), at both Create (PENDING) and Release (RELEASED)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'EVSNAP-004' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'EVSNAP-004' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'EVSNAP-004', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '32000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');

    // eventSnapshot: the SG's own ledger, unchanged behavior.
    expect(sgIssue.movement.eventSnapshot!.balanceContractId).toBe(sgIssue.movement.balanceContractId);
    expect(sgIssue.movement.eventSnapshot!.confirmedBalance).toBe('0');
    expect(sgIssue.movement.eventSnapshot!.availableBalance).toBe('32000');
    expect(sgIssue.movement.eventSnapshot!.offBalanceExposure).toBeNull();

    // rootEventSnapshot: the PARENT LC's own plain balance, additionally captured — already reflects
    // this new, not-yet-inserted SG movement (folded in in-memory).
    expect(sgIssue.movement.rootEventSnapshot!.balanceContractId).toBe(lc.balanceContractId);
    expect(sgIssue.movement.rootEventSnapshot!.confirmedBalance).toBe('100000');
    expect(sgIssue.movement.rootEventSnapshot!.offBalanceExposure).toBe('32000');
    expect(sgIssue.movement.rootEventSnapshot!.tightAvailableBalance).toBe('68000');

    const sgReleased = service.release(sgIssue.movement.movementId, 'checker1');
    expect(sgReleased.eventSnapshot!.confirmedBalance).toBe('32000');
    expect(sgReleased.rootEventSnapshot!.balanceContractId).toBe(lc.balanceContractId);
    expect(sgReleased.rootEventSnapshot!.confirmedBalance).toBe('100000');
    expect(sgReleased.rootEventSnapshot!.offBalanceExposure).toBe('32000');
    expect(sgReleased.rootEventSnapshot!.tightAvailableBalance).toBe('68000');
  });

  test('a root-level event (LC\'s own ISSUE) carries a null rootEventSnapshot — nothing to redirect to', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'EVSNAP-007' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    expect(issue.movement.rootEventSnapshot).toBeNull();
    expect(issue.movement.eventSnapshot).toEqual(service.getBalanceSnapshotAsOfMovement(issue.movement.movementId));
  });

  test('an EPLC_EXAMINATION CREATE captures its own eventSnapshot AND the PARENT EPLC_CONFIRMATION\'s own presentDocsEarmark as rootEventSnapshot, at both Create and Release', () => {
    const service = new BalanceService(createDb(':memory:'));
    const cnfIssue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'EVSNAP-005' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!cnfIssue.created) throw new Error('expected a new movement');
    service.release(cnfIssue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'EVSNAP-005' });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');

    const examCreate = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'EVSNAP-005', ibNumber: 'EB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '40000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!examCreate.created) throw new Error('expected a new movement');

    expect(examCreate.movement.rootEventSnapshot!.balanceContractId).toBe(confirmation.balanceContractId);
    expect(examCreate.movement.rootEventSnapshot!.confirmedBalance).toBe('100000');
    expect(examCreate.movement.rootEventSnapshot!.presentDocsEarmarkPending).toBe('40000');
    expect(examCreate.movement.rootEventSnapshot!.presentDocsEarmarkApproved).toBe('0');

    // 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易") — B3's own release() is now a
    // genuine, standalone finalization (PENDING -> RELEASED on its own record, not a side effect of B4)
    // — the presentation moves from Pending to Approved (still occupying Present Docs Earmark capacity,
    // per computePresentDocsEarmark's own doc comment, until B4 later consumes it — presentDocsConsumedAt
    // stays null here since B4 hasn't acted). rootEventSnapshot is recomputed at release() time like any
    // other child-ledger movement, reflecting this transition — superseding the prior, now-removed
    // isPresentDocsFinalize freeze.
    const examReleased = service.release(examCreate.movement.movementId, 'checker1');
    expect(examReleased.rootEventSnapshot!.presentDocsEarmarkPending).toBe('0');
    expect(examReleased.rootEventSnapshot!.presentDocsEarmarkApproved).toBe('40000');
  });

  // SUPERSEDED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易") — the
  // prior "SAME AS EXPORT CONFIRMED LC" freeze applied to B3 on the reasoning that its own release() was
  // always B4's much-later finalization of an old submission, so the sibling snapshot had to stay frozen
  // at Create-time to avoid retroactively populating it. B3's own release() is now a genuine, standalone
  // Checker action — there is no "much later" gap to protect against — so this test now proves the
  // OPPOSITE: acceptanceEventSnapshot is captured FRESH at B3's own release() time, same as every other
  // child-ledger movement's own release()-time capture.
  test("B3's own acceptanceEventSnapshot is captured fresh at its own real release() (not frozen at Create) — reflects an Acceptance created in between", () => {
    const service = new BalanceService(createDb(':memory:'));
    const cnfIssue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'EVSNAP-B3ACC' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!cnfIssue.created) throw new Error('expected a new movement');
    service.release(cnfIssue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'EVSNAP-B3ACC' });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');

    // B3: submitted BEFORE any Acceptance exists under this Confirmed LC.
    const examCreate = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'EVSNAP-B3ACC', ibNumber: 'EB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '40000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!examCreate.created) throw new Error('expected a new movement');
    expect(examCreate.movement.acceptanceEventSnapshot).toBeNull();

    // An Acceptance now comes into existence under this same Confirmed LC.
    const acceptCreate = service.createMovement({
      instrumentType: 'EPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'EVSNAP-B3ACC', ibNumber: 'EB02' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '30000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      tenorType: 'SELLERS_USANCE',
      createdBy: 'maker1',
    });
    if (!acceptCreate.created) throw new Error('expected a new movement');
    service.release(acceptCreate.movement.movementId, 'checker1');

    // B3's own real, standalone Checker Release now happens — since an Acceptance genuinely exists by
    // this moment, its own acceptanceEventSnapshot correctly captures it (not null), same as any other
    // child-ledger movement's own release()-time sibling capture.
    const examReleased = service.release(examCreate.movement.movementId, 'checker1');
    expect(examReleased.acceptanceEventSnapshot).not.toBeNull();
    expect(examReleased.acceptanceEventSnapshot!.balanceContractId).toBe(acceptCreate.movement.balanceContractId);
  });

  test('Acceptance events ALSO get a rootEventSnapshot now (parent LC\'s own balance) — confirmed via the revised, generalized "Look Up Current Balance saved to DB" design; their own eventSnapshot stays their own ledger', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'EVSNAP-006' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'BUYERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'EVSNAP-006' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    const acceptanceCreate = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'EVSNAP-006', ibNumber: 'IB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '30000',
      currency: 'USD',
      tenorType: 'BUYERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!acceptanceCreate.created) throw new Error('expected a new movement');

    // eventSnapshot: own ledger, not the parent LC's — balanceContractId differs from the LC's own, and
    // Confirmed Balance reflects the Acceptance's own PENDING->RELEASED lifecycle, not the LC's 100000.
    expect(acceptanceCreate.movement.eventSnapshot!.balanceContractId).not.toBe(lc.balanceContractId);
    expect(acceptanceCreate.movement.eventSnapshot!.confirmedBalance).toBe('0');
    expect(acceptanceCreate.movement.eventSnapshot!.availableBalance).toBe('30000');

    // rootEventSnapshot: the parent LC's own plain balance, unaffected by an Acceptance CREATE (which
    // never itself moves the LC's own Confirmed Balance — that already happened via a separate UTILIZE).
    expect(acceptanceCreate.movement.rootEventSnapshot!.balanceContractId).toBe(lc.balanceContractId);
    expect(acceptanceCreate.movement.rootEventSnapshot!.confirmedBalance).toBe('100000');
  });
});

/**
 * Business instruction 2026-08-17 ("就是交易當時LC所有的BALANCE的拍照存檔" — a snapshot of ALL the LC
 * family's balances at transaction time, saved to DB), reproducing the exact live example the user
 * inquired about: LC S02's 3rd event — A1 ISSUE 100000, A8 SG G01 ISSUE 12345, then a plain A3 Document
 * Arrival UTILIZE 22345 (a movement purely on the LC itself, no direct SG movement/businessEventId link).
 * Confirmed via AskUserQuestion: captured (persisted) at createMovement()/release() time — not a live
 * fetch when later viewed.
 */
describe('BalanceService — sibling Acceptance/SG snapshots (captureSiblingSnapshots, "拍照存檔")', () => {
  test('a root-level UTILIZE (plain A3, no direct SG movement) still captures the SG\'s own CURRENT balance when exactly one SG exists — reproduces LC S02\'s 3rd event exactly', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S02' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'S02' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'S02', sgNumber: 'G01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '12345',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    // Event 3: a plain A3 (Document Arrival) — UTILIZE directly on the LC, no businessEventId, no SG
    // movement of its own.
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '22345',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');

    // Own eventSnapshot: the LC's own — already correctly nets the SG's exposure into offBalanceExposure.
    expect(utilize.movement.eventSnapshot!.offBalanceExposure).toBe('12345');
    // rootEventSnapshot stays null — this movement's own contract already IS the root.
    expect(utilize.movement.rootEventSnapshot).toBeNull();
    // NEW: sgEventSnapshot captures SG G01's own CURRENT balance, even though this event has no direct
    // movement on it — exactly the user's own live example ("CURRENT BALANCE — LC S02 / SG G01",
    // Confirmed Balance 12345, Available Balance 12345).
    expect(utilize.movement.sgEventSnapshot!.balanceContractId).toBe(sgIssue.movement.balanceContractId);
    expect(utilize.movement.sgEventSnapshot!.confirmedBalance).toBe('12345');
    expect(utilize.movement.sgEventSnapshot!.availableBalance).toBe('12345');
    // No Acceptance exists under this (Sight) LC — stays null.
    expect(utilize.movement.acceptanceEventSnapshot).toBeNull();

    // Releasing re-captures it too (still exactly one SG, still 12345). The LC's own ISSUE now defaults
    // tenorType: 'SIGHT', so this UTILIZE's own Release requires A4's own Maker Submit gate first
    // (isSightUtilizeFinalize) — same requirement any other Sight-tenor UTILIZE has, unrelated to what
    // THIS test is actually about.
    service.submitByMaker(utilize.movement.movementId, 'maker1');
    const released = service.release(utilize.movement.movementId, 'checker1');
    expect(released.sgEventSnapshot!.confirmedBalance).toBe('12345');
  });

  test('does NOT capture sgEventSnapshot when two or more SGs exist — ambiguous, left null (matches Inquire Events\' own "only if unambiguous" posture)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S05' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'S05' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    for (const sgNumber of ['G01', 'G02']) {
      const sg = service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S05', sgNumber },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '5000',
        currency: 'USD',
        parentLogicalContractId: lc.logicalContractId,
        createdBy: 'maker1',
      });
      if (!sg.created) throw new Error('expected a new movement');
      service.release(sg.movement.movementId, 'checker1');
    }

    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '1000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');

    expect(utilize.movement.sgEventSnapshot).toBeNull();
  });

  test('an SHGT event itself gets no sgEventSnapshot (its own eventSnapshot already covers it) but DOES capture acceptanceEventSnapshot when exactly one Acceptance exists on a Usance LC', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S06' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'BUYERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'S06' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'S06', ibNumber: 'IB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '30000',
      currency: 'USD',
      tenorType: 'BUYERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');

    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'S06', sgNumber: 'G01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '12345',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');

    expect(sgIssue.movement.sgEventSnapshot).toBeNull();
    expect(sgIssue.movement.acceptanceEventSnapshot!.balanceContractId).toBe(acceptance.movement.balanceContractId);
    expect(sgIssue.movement.acceptanceEventSnapshot!.confirmedBalance).toBe('0');
    expect(sgIssue.movement.acceptanceEventSnapshot!.availableBalance).toBe('30000');
  });
});

describe('BalanceService — assertRootIssueReleased (business-reported gap 2026-08-18, "S10 A1 Issue still in pending, then it should not allow for other events A2-A9, right?")', () => {
  test('AMEND_DECREASE against a root LC whose own ISSUE is still PENDING is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S10-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    // ISSUE deliberately left PENDING — not released.

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: '1000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      }),
    ).toThrow(IllegalStateTransitionError);
  });

  test('UTILIZE (A3) against a root LC whose own ISSUE is still PENDING is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S10-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '1000',
        currency: 'USD',
        sourceTransactionRef: 'B01',
        createdBy: 'maker1',
      }),
    ).toThrow(IllegalStateTransitionError);
  });

  test('creating a new CHILD contract (SHGT ISSUE) under a parent LC whose own ISSUE is still PENDING is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S10-003' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S10-003', sgNumber: 'G01' },
        parentLogicalContractId: issue.movement.eventSnapshot!.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(IllegalStateTransitionError);
  });

  test('ISSUE itself is never blocked by this guard (would otherwise be unable to ever create the very first movement)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S10-004' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    expect(issue.created).toBe(true);
  });

  test('once the root ISSUE is Released, a subsequent AMEND_DECREASE and a new child SG ISSUE both succeed', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'S10-005' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    const decrease = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'AMEND_DECREASE',
      eventSeq: 2,
      amount: '1000',
      currency: 'USD',
      sourceTransactionRef: 'AMD-001',
      createdBy: 'maker1',
    });
    expect(decrease.created).toBe(true);

    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'S10-005', sgNumber: 'G01' },
      parentLogicalContractId: issue.movement.eventSnapshot!.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '2000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(sgIssue.created).toBe(true);
  });
});

/**
 * Business instruction 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易" — every transaction
 * must genuinely RELEASE before the next step in the flow can act on it) — B3 (Present Docs,
 * EPLC_EXAMINATION/CREATE) now RELEASEs on its own, real Checker action (the standard `release()`, same
 * as every other function), superseding the prior acknowledge()-only design (see this file's own removed
 * `service.acknowledge` test above and `domain/offBalanceExposure.ts`'s own basis-change doc comment).
 * `presentDocsConsumedAt`/`presentDocsConsumedBy` (set as a side effect of `release()` on the
 * Confirmation's own linked HONOUR/ACCEPT — via that movement's own `referencedTransactionId` pointing
 * back at the EPLC_EXAMINATION CREATE) is what now tracks "consumed by B4", preserving the ORIGINAL
 * Present Docs Earmark commitment-control intent across this now-real PENDING->RELEASED transition.
 */
describe('BalanceService.release — B3 (EPLC_EXAMINATION/CREATE) now genuinely RELEASEs on its own, and B4 marks it consumed via referencedTransactionId', () => {
  function issueConfirmation(service: BalanceService, lcNumber: string) {
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');
    return confirmation;
  }

  test("B3's own release() genuinely transitions PENDING -> RELEASED, independent of B4 (no acknowledge() call involved)", () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'RELB3-001');
    const exam = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'RELB3-001', ibNumber: 'E01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!exam.created) throw new Error('expected a new movement');
    expect(exam.movement.status).toBe('PENDING');

    const released = service.release(exam.movement.movementId, 'checker1');
    expect(released.status).toBe('RELEASED');
    expect(released.releasedBy).toBe('checker1');
    expect(released.presentDocsConsumedAt).toBeNull();
  });

  test("releasing an already-RELEASED EPLC_EXAMINATION/CREATE throws (B4's own compound release must never attempt this any more)", () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'RELB3-002');
    const exam = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'RELB3-002', ibNumber: 'E01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!exam.created) throw new Error('expected a new movement');
    service.release(exam.movement.movementId, 'checker1');
    expect(() => service.release(exam.movement.movementId, 'checker1')).toThrow(IllegalStateTransitionError);
  });

  test("releasing B4's own linked HONOUR (referencedTransactionId -> the B3 CREATE) marks that presentation's own presentDocsConsumedAt/By as a side effect, without touching its status (already RELEASED)", () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'RELB3-003');
    const exam = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'RELB3-003', ibNumber: 'E01' },
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
      sourceTransactionRef: 'HN-001',
      referencedTransactionId: exam.movement.movementId,
      createdBy: 'maker1',
    });
    if (!honour.created) throw new Error('expected a new movement');

    service.release(honour.movement.movementId, 'checker2');

    const consumedExam = service.listMovements(exam.movement.balanceContractId).find((m) => m.movementId === exam.movement.movementId);
    expect(consumedExam?.status).toBe('RELEASED');
    expect(consumedExam?.presentDocsConsumedAt).not.toBeNull();
    expect(consumedExam?.presentDocsConsumedBy).toBe('checker2');
  });

  test('Present Docs Earmark stays fully occupied while a presentation is RELEASED-but-not-yet-consumed — an independent second presentation whose combined total would exceed Available Balance is still correctly rejected, and the earmark only drops once B4 actually consumes it (the exact over-commitment window the 2026-08-18 basis change protects)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'RELB3-004');
    const exam = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'RELB3-004', ibNumber: 'E01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '60000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!exam.created) throw new Error('expected a new movement');
    service.release(exam.movement.movementId, 'checker1');
    expect(service.getBalanceSnapshot(confirmation.balanceContractId).presentDocsEarmarkApproved).toBe('60000');

    // Still occupies capacity (RELEASED, not yet consumed) — an independent 50,000 presentation against
    // the same 100,000 Confirmation must still be rejected (combined 110,000 > 100,000 Available). If
    // RELEASED alone had dropped E01 out of the earmark (the alternative design NOT chosen — see
    // domain/offBalanceExposure.ts's own doc comment), this would have wrongly succeeded.
    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'RELB3-004', ibNumber: 'E02' },
        movementType: 'CREATE',
        eventSeq: 2,
        amount: '50000',
        currency: 'USD',
        parentLogicalContractId: confirmation.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(/Present Docs amount 50000 exceeds/);

    // B4 now consumes E01 (Honour, referencing it) — its own earmark contribution drops to 0 once
    // consumed (the SAME 60,000 capacity is now reflected as a real reduction of the Confirmation's own
    // Available Balance instead — converted, not doubled or leaked).
    const honour = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: confirmation.balanceContractId,
      movementType: 'HONOUR',
      eventSeq: 2,
      amount: '60000',
      currency: 'USD',
      sourceTransactionRef: 'HN-001',
      referencedTransactionId: exam.movement.movementId,
      createdBy: 'maker1',
    });
    if (!honour.created) throw new Error('expected a new movement');
    service.release(honour.movement.movementId, 'checker1');
    expect(service.getBalanceSnapshot(confirmation.balanceContractId).presentDocsEarmarkApproved).toBe('0');
  });

  test("releasing A6's own linked Acceptance CREATE (referencedTransactionId -> an IPLC_LC/UTILIZE, Import side) never touches presentDocsConsumedAt — that side effect stays scoped to EPLC_EXAMINATION only; the UTILIZE itself is genuinely finalized by a DIFFERENT side effect instead (business-confirmed 2026-08-27, see the dedicated describe block below for the full behavior)", () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'RELB3-005' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'RELB3-005' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    const arrival = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!arrival.created) throw new Error('expected a new movement');
    service.acknowledgeArrival(arrival.movement.movementId, 'checker1');

    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'RELB3-005', ibNumber: 'B01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '40000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      referencedTransactionId: arrival.movement.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');

    // Must not throw, and the referenced UTILIZE (now genuinely finalized, not an EPLC_EXAMINATION/CREATE
    // at all) must never have its presentDocsConsumedAt touched — that side effect's own type check must
    // correctly skip it.
    expect(() => service.release(acceptance.movement.movementId, 'checker1')).not.toThrow();
    const finalizedUtilize = service.listMovements(lc.balanceContractId).find((m) => m.movementId === arrival.movement.movementId)!;
    expect(finalizedUtilize.status).toBe('RELEASED');
    expect((finalizedUtilize as any).presentDocsConsumedAt ?? null).toBeNull();
  });
});

describe('BalanceService.listMyMovements — Fix Pending/Delete Pending Phase 2 Maker Queue worklist', () => {
  function issue(service: BalanceService, lcNumber: string, createdBy: string) {
    const result = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy,
    });
    if (!result.created) throw new Error('expected a new movement');
    return result.movement;
  }

  test('defaults to PENDING+REJECTED for the given createdBy, paired with each movement\'s own contract', () => {
    const service = new BalanceService(createDb(':memory:'));
    const pending = issue(service, 'MYMV-001', 'maker1');
    const releasedSource = issue(service, 'MYMV-002', 'maker1');
    service.release(releasedSource.movementId, 'checker1');
    const rejectedSource = issue(service, 'MYMV-003', 'maker1');
    service.reject(rejectedSource.movementId, 'checker1', 'MANUAL_TEST_REJECT');
    issue(service, 'MYMV-004', 'maker2'); // a different Maker's own PENDING — must not leak into maker1's queue

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items).toHaveLength(2); // pending + rejectedSource; releasedSource (RELEASED) excluded by the default status set
    const movementIds = page.items.map((r) => r.movement.movementId);
    expect(movementIds).toContain(pending.movementId);
    expect(movementIds).toContain(rejectedSource.movementId);
    expect(movementIds).not.toContain(releasedSource.movementId);
    const rejectedRow = page.items.find((r) => r.movement.movementId === rejectedSource.movementId)!;
    expect(rejectedRow.movement.status).toBe('REJECTED');
    expect(rejectedRow.contract.naturalKey.lcNumber).toBe('MYMV-003');
  });

  test('respects an explicit statuses filter; returns every matching row unpaginated (pagination moved client-side, 2026-08-28)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const pending = issue(service, 'MYMV-010', 'maker3');
    const rejectedSource = issue(service, 'MYMV-011', 'maker3');
    service.reject(rejectedSource.movementId, 'checker1', 'MANUAL_TEST_REJECT');

    const pendingOnly = service.listMyMovements({ createdBy: 'maker3', statuses: ['PENDING'] });
    expect(pendingOnly.items).toHaveLength(1);
    expect(pendingOnly.items[0]!.movement.movementId).toBe(pending.movementId);

    const both = service.listMyMovements({ createdBy: 'maker3' });
    expect(both.items).toHaveLength(2);
    expect(both.items.map((r) => r.movement.movementId)).toEqual(expect.arrayContaining([pending.movementId, rejectedSource.movementId]));
  });

  test('returns an empty list (not an error) for a createdBy with nothing PENDING/REJECTED', () => {
    const service = new BalanceService(createDb(':memory:'));
    const page = service.listMyMovements({ createdBy: 'nobody-has-submitted-anything' });
    expect(page).toEqual({ items: [] });
  });
});

// User-directed 2026-08-28 ("Order by Function ASC → LC Number ASC → Secondary Reference Number ASC" /
// "Maker Queue 提供 LC Number Search 功能" / "支援 LIKE / Partial Match"). The TRUE Maker Queue ordering
// (Function-first) is an Angular-side concern — see maker-queue.service.spec.ts — since Function has no
// column here; this server layer only owns the base LC-Number-ascending order (a stable tiebreaker
// Angular's own sort is applied on top of) and the substring `q` filter.
describe('BalanceService.listMyMovements — base LC Number ascending order, optional substring `q` filter', () => {
  function issue(service: BalanceService, lcNumber: string, createdBy: string) {
    const result = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy,
    });
    if (!result.created) throw new Error('expected a new movement');
    return result.movement;
  }

  test('the default (unfiltered) list is ordered by LC Number ascending, not creation order', () => {
    const service = new BalanceService(createDb(':memory:'));
    // Issued deliberately out of alphabetical order, so a created_at-based sort would return them in a
    // different order than this test's own assertion.
    issue(service, 'SORT-CCC', 'maker7');
    issue(service, 'SORT-AAA', 'maker7');
    issue(service, 'SORT-BBB', 'maker7');

    const page = service.listMyMovements({ createdBy: 'maker7' });

    expect(page.items.map((r) => r.contract.naturalKey.lcNumber)).toEqual(['SORT-AAA', 'SORT-BBB', 'SORT-CCC']);
  });

  test('a q filter returns only PENDING/REJECTED items whose LC Number contains it, others under the same createdBy excluded', () => {
    const service = new BalanceService(createDb(':memory:'));
    const target = issue(service, 'SORT-FILTER-001', 'maker8');
    issue(service, 'OTHER-002', 'maker8');

    const page = service.listMyMovements({ createdBy: 'maker8', q: 'SORT-FILTER-001' });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.movement.movementId).toBe(target.movementId);
    expect(page.items[0]!.contract.naturalKey.lcNumber).toBe('SORT-FILTER-001');
  });

  test('the filter is a substring LIKE, not exact-match — a partial q matches (user-directed, "支援 LIKE / Partial Match")', () => {
    const service = new BalanceService(createDb(':memory:'));
    const target = issue(service, 'SORT-EXACT-001', 'maker9');

    const page = service.listMyMovements({ createdBy: 'maker9', q: 'EXACT' });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.movement.movementId).toBe(target.movementId);
  });

  test('a q with no match returns an empty list', () => {
    const service = new BalanceService(createDb(':memory:'));
    issue(service, 'SORT-NOMATCH-001', 'maker9');

    const page = service.listMyMovements({ createdBy: 'maker9', q: 'DOES-NOT-EXIST' });

    expect(page.items).toHaveLength(0);
  });

  test('a search result set keeps the same LC-Number-ascending base ordering as the unfiltered list — multiple still-PENDING/REJECTED movements on the SAME LC stay ordered most-recent-first within it', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issue(service, 'SORT-SAME-LC-001', 'maker10');
    service.release(lc.movementId, 'checker1');
    const older = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '1000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker10',
    });
    if (!older.created) throw new Error('expected a new movement');
    const newer = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random() + 1,
      amount: '2000',
      currency: 'USD',
      sourceTransactionRef: 'B02',
      createdBy: 'maker10',
    });
    if (!newer.created) throw new Error('expected a new movement');

    const page = service.listMyMovements({ createdBy: 'maker10', q: 'SORT-SAME-LC-001' });

    expect(page.items.map((r) => r.movement.movementId)).toEqual([newer.movement.movementId, older.movement.movementId]);
  });
});

describe('BalanceService.listMyMovements — EARMARKED (acknowledged, not yet Maker-Submitted into A4) is excluded (business-confirmed 2026-08-27, "EARMARKED 等同 APPROVED 不要出現在 MAKER QUEUE 上")', () => {
  function issueSightLcAndUtilize(service: BalanceService, lcNumber: string, createdBy: string) {
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy,
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'IB-001',
      createdBy,
    });
    if (!utilize.created) throw new Error('expected a new movement');
    return utilize.movement;
  }

  test('a plain PENDING (never acknowledged, EARMARKING) A3 row still appears', () => {
    const service = new BalanceService(createDb(':memory:'));
    const utilize = issueSightLcAndUtilize(service, 'MQ-EARMARK-1', 'maker1');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).toContain(utilize.movementId);
  });

  test('an acknowledged-but-not-yet-Maker-Submitted (EARMARKED) A3 row is excluded', () => {
    const service = new BalanceService(createDb(':memory:'));
    const utilize = issueSightLcAndUtilize(service, 'MQ-EARMARK-2', 'maker1');
    service.acknowledgeArrival(utilize.movementId, 'checker1');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).not.toContain(utilize.movementId);
    expect(page.items).toHaveLength(0);
  });

  test('once Maker-Submitted into A4, the SAME row reappears (genuinely actionable PENDING again)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const utilize = issueSightLcAndUtilize(service, 'MQ-EARMARK-3', 'maker1');
    service.acknowledgeArrival(utilize.movementId, 'checker1');
    service.submitByMaker(utilize.movementId, 'maker1');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).toContain(utilize.movementId);
    expect(page.items).toHaveLength(1);
  });

  test('a REJECTED A4 attempt (acknowledged + makerSubmitted, then Checker-rejected) still appears', () => {
    const service = new BalanceService(createDb(':memory:'));
    const utilize = issueSightLcAndUtilize(service, 'MQ-EARMARK-4', 'maker1');
    service.acknowledgeArrival(utilize.movementId, 'checker1');
    service.submitByMaker(utilize.movementId, 'maker1');
    service.reject(utilize.movementId, 'checker1', 'SETTLEMENT_DECLINED');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).toContain(utilize.movementId);
  });

  test('the returned list stays consistent with the exclusion (no off-by-one from a naive client-side filter)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const earmarking = issueSightLcAndUtilize(service, 'MQ-EARMARK-5', 'maker9');
    const earmarked = issueSightLcAndUtilize(service, 'MQ-EARMARK-6', 'maker9');
    service.acknowledgeArrival(earmarked.movementId, 'checker1');

    const page = service.listMyMovements({ createdBy: 'maker9' });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.movement.movementId).toBe(earmarking.movementId);
  });
});

describe('BalanceService.listMyMovements — A6\'s own referenced A3/A3S UTILIZE is excluded once superseded by A6\'s own separate CREATE (business-confirmed 2026-08-27, "應該是一個 U01 B01" — a duplicate-row defect)', () => {
  function issueUsanceLcAndUtilize(service: BalanceService, lcNumber: string, createdBy: string) {
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy,
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy,
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.acknowledgeArrival(utilize.movement.movementId, 'checker1');
    const lcContract = service.resolveContract('IPLC_LC', { lcNumber });
    if (!lcContract) throw new Error('expected the just-issued LC to resolve');
    return { lc: lcContract, utilize: utilize.movement };
  }

  test('a Usance UTILIZE cannot call the A4 Maker Submit API before A6 exists', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { utilize } = issueUsanceLcAndUtilize(service, 'MQ-A6-DUP-1', 'maker1');
    expect(() => service.submitByMaker(utilize.movementId, 'maker1')).toThrow(/not eligible for A4/);

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items).toHaveLength(0);
  });

  test('once A6 creates its own separate CREATE (referencedTransactionId -> the UTILIZE), ONLY A6\'s own row appears — the referenced UTILIZE is excluded, not duplicated', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueUsanceLcAndUtilize(service, 'MQ-A6-DUP-2', 'maker1');
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'MQ-A6-DUP-2', ibNumber: 'B01' },
      movementType: 'CREATE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      referencedTransactionId: utilize.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).toEqual([acceptance.movement.movementId]);
    expect(page.items).toHaveLength(1);
  });

  test('if A6\'s own CREATE is later Delete-Pending\'d (CANCELLED), the referenced UTILIZE does NOT reappear — Delete Pending\'s own applyCancelSideEffects() (see the dedicated describe block below) reverts it to plain not-yet-actionable EARMARKED, the same "notYetActionableEarmark" state a fresh A3 record is already excluded in', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueUsanceLcAndUtilize(service, 'MQ-A6-DUP-3', 'maker1');
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'MQ-A6-DUP-3', ibNumber: 'B01' },
      movementType: 'CREATE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      referencedTransactionId: utilize.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.cancel(acceptance.movement.movementId, 'maker1', 'MAKER_EC');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).not.toContain(utilize.movementId);
  });
});

describe('BalanceService.cancel — A6 Delete Pending reverses the referenced UTILIZE\'s own Maker-Submit gate (business-confirmed 2026-08-27, "都只有一筆... 掛帳也掛在同一筆EVENT上")', () => {
  function issueUsanceLcAndUtilize(service: BalanceService, lcNumber: string, createdBy: string) {
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy,
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy,
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.acknowledgeArrival(utilize.movement.movementId, 'checker1');
    const lcContract = service.resolveContract('IPLC_LC', { lcNumber });
    if (!lcContract) throw new Error('expected the just-issued LC to resolve');
    return { lc: lcContract, utilize: utilize.movement };
  }

  test('cancelling A6\'s own CREATE clears the referenced UTILIZE\'s own makerSubmittedAt (revert to before A6 Submit) — no orphaned finalize row left behind', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueUsanceLcAndUtilize(service, 'CANCEL-A6-REVERT-1', 'maker1');
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'CANCEL-A6-REVERT-1', ibNumber: 'B01' },
      movementType: 'CREATE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      referencedTransactionId: utilize.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    const findUtilize = () => service.listMovements(lc.balanceContractId).find((m) => m.movementId === utilize.movementId)!;
    // applyCreateSideEffects() already set this — sanity-check the precondition before reversing it.
    expect(findUtilize().makerSubmittedAt).toBeTruthy();

    service.cancel(acceptance.movement.movementId, 'maker1', 'MAKER_EC');

    const reverted = findUtilize();
    expect(reverted.makerSubmittedAt).toBeNull();
    expect(reverted.makerSubmittedBy).toBeNull();
    expect(reverted.status).toBe('PENDING');
    expect(reverted.acknowledgedAt).toBeTruthy(); // A3/A3S's own Checker acknowledgment is a permanent historical fact, untouched.
  });

  test('cancelling A6\'s own CREATE writes exactly ONE delete_pending_audit row — the reversed UTILIZE gets no second row', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueUsanceLcAndUtilize(service, 'CANCEL-A6-REVERT-2', 'maker1');
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'CANCEL-A6-REVERT-2', ibNumber: 'B01' },
      movementType: 'CREATE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      parentLogicalContractId: lc.logicalContractId,
      referencedTransactionId: utilize.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');

    service.cancel(acceptance.movement.movementId, 'maker1', 'MAKER_EC');

    const audit = service.listDeletePendingAudit({ lcNumber: 'CANCEL-A6-REVERT-2' });
    expect(audit.items.map((r) => r.movementId)).toEqual([acceptance.movement.movementId]);
  });

  // Deliberately does NOT use this describe block's own issueUsanceLcAndUtilize() helper (it calls
  // acknowledgeArrival() as part of its standard A6 setup) — the defect fix below (§3 Cases 3/4, "cancel()
  // now 409s an Acknowledged-and-still-PENDING A3/A3S UTILIZE") means an acknowledged UTILIZE is no longer
  // a legal target for a bare cancel() at all, so this test's own point (proving
  // applyCancelSideEffects() no-ops when nothing references the cancelled movement) needs a genuinely
  // never-acknowledged UTILIZE to actually reach that code path.
  test('a standalone cancel() with no referencedTransactionId (e.g. plain, never-acknowledged A3 Delete Pending) is unaffected — applyCancelSideEffects() no-ops', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CANCEL-A6-REVERT-3' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');

    expect(() => service.cancel(utilize.movement.movementId, 'maker1', 'MAKER_EC')).not.toThrow();
    const cancelled = service.listMovements(lc.movement.balanceContractId).find((m) => m.movementId === utilize.movement.movementId)!;
    expect(cancelled.status).toBe('CANCELLED');
  });

  test('rejects A6 when referencedTransactionId no longer resolves', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CANCEL-A6-REVERT-4' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'CANCEL-A6-REVERT-4', ibNumber: 'B01' },
        movementType: 'CREATE',
        eventSeq: Date.now() + Math.random(),
        amount: '40000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        parentLogicalContractId: lc.movement.balanceContractId,
        referencedTransactionId: 'does-not-exist',
        createdBy: 'maker1',
      }),
    ).toThrow(/Referenced transaction does-not-exist was not found/);
  });

  test('rejects A6 when referencedTransactionId points at a non-UTILIZE movement', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueUsanceLcAndUtilize(service, 'CANCEL-A6-REVERT-5', 'maker1');
    // Points at the LC's own ISSUE (RELEASED, movementType 'ISSUE') instead of the UTILIZE — a raw API
    // caller's referencedTransactionId is never validated against a real A6 cascade shape.
    const issueMovement = service.listMovements(lc.balanceContractId).find((m) => m.movementType === 'ISSUE')!;
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'CANCEL-A6-REVERT-5', ibNumber: 'B02' },
        movementType: 'CREATE',
        eventSeq: Date.now() + Math.random(),
        amount: '1000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        parentLogicalContractId: lc.logicalContractId,
        referencedTransactionId: issueMovement.movementId,
        createdBy: 'maker1',
      }),
    ).toThrow(/not eligible for A6/);
    // The real UTILIZE (never referenced by anything here) is completely untouched.
    const utilizeStillIntact = service.listMovements(lc.balanceContractId).find((m) => m.movementId === utilize.movementId)!;
    expect(utilizeStillIntact.makerSubmittedAt).toBeNull();
    expect(utilizeStillIntact.status).toBe('PENDING');
  });
});

describe('BalanceService.withdrawMakerSubmit — A4 Delete Pending reverts to before A4 Submit (business-confirmed 2026-08-27)', () => {
  function issueSightLcAcknowledgedAndSubmitted(lcNumber: string) {
    const service = new BalanceService(createDb(':memory:'));
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'IB-001',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.acknowledgeArrival(utilize.movement.movementId, 'checker1');
    service.submitByMaker(utilize.movement.movementId, 'maker1');
    return { service, movement: utilize.movement };
  }

  test('from still-PENDING (A4 awaiting Checker): clears makerSubmittedAt, keeps status PENDING and acknowledgedAt intact', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-1');

    const withdrawn = service.withdrawMakerSubmit(movement.movementId, 'maker1');

    expect(withdrawn.status).toBe('PENDING');
    expect(withdrawn.makerSubmittedAt).toBeNull();
    expect(withdrawn.makerSubmittedBy).toBeNull();
    expect(withdrawn.acknowledgedAt).toBeTruthy();
    expect(withdrawn.acknowledgedBy).toBe('checker1');
  });

  test('after withdrawing from PENDING, the Maker can submitByMaker() (attempt A4) again', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-2');
    service.withdrawMakerSubmit(movement.movementId, 'maker1');

    const resubmitted = service.submitByMaker(movement.movementId, 'maker1');

    expect(resubmitted.makerSubmittedAt).toBeTruthy();
  });

  test('unified logic — from REJECTED (A4\'s own Checker already rejected it): clears makerSubmittedAt AND reverts status back to PENDING', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-3');
    const rejected = service.reject(movement.movementId, 'checker1', 'SETTLEMENT_DECLINED');
    expect(rejected.status).toBe('REJECTED');

    const withdrawn = service.withdrawMakerSubmit(movement.movementId, 'maker1');

    expect(withdrawn.status).toBe('PENDING');
    expect(withdrawn.makerSubmittedAt).toBeNull();
    expect(withdrawn.acknowledgedAt).toBeTruthy();
  });

  test('after withdrawing from REJECTED, the Maker can submitByMaker() (attempt A4) again and it can Release through to completion', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-4');
    service.reject(movement.movementId, 'checker1', 'SETTLEMENT_DECLINED');
    service.withdrawMakerSubmit(movement.movementId, 'maker1');

    const resubmitted = service.submitByMaker(movement.movementId, 'maker1');
    expect(resubmitted.makerSubmittedAt).toBeTruthy();
    const released = service.release(movement.movementId, 'checker1');
    expect(released.status).toBe('RELEASED');
  });

  test('rejects a movement that was never Maker-Submitted (still A3\'s own EARMARKED business)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'WD-5' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'IB-001',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.acknowledgeArrival(utilize.movement.movementId, 'checker1');

    expect(() => service.withdrawMakerSubmit(utilize.movement.movementId, 'maker1')).toThrow(IllegalStateTransitionError);
  });

  test('rejects a RELEASED movement', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-6');
    service.release(movement.movementId, 'checker1');

    expect(() => service.withdrawMakerSubmit(movement.movementId, 'maker1')).toThrow(IllegalStateTransitionError);
  });

  test('rejects a non-IPLC_LC/UTILIZE movement', () => {
    const service = new BalanceService(createDb(':memory:'));
    const cnf = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'WD-7' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!cnf.created) throw new Error('expected a new movement');

    expect(() => service.withdrawMakerSubmit(cnf.movement.movementId, 'maker1')).toThrow(RequestValidationError);
  });

  test('business-confirmed 2026-08-27 ("DELETE 後要記錄在 Inquire Delete Pending 內") — writes a delete_pending_audit row with statusBefore=PENDING, visible via Inquire Delete Pending', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-8');

    service.withdrawMakerSubmit(movement.movementId, 'maker1');

    const audit = service.listDeletePendingAudit({ lcNumber: 'WD-8' });
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]).toMatchObject({
      movementId: movement.movementId,
      movementType: 'UTILIZE',
      statusBefore: 'PENDING',
      cancelledBy: 'maker1',
      reasonCode: 'MAKER_EC',
    });
  });

  test('a REJECTED A4 attempt writes an audit row with statusBefore=REJECTED', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-9');
    service.reject(movement.movementId, 'checker1', 'SETTLEMENT_DECLINED');

    service.withdrawMakerSubmit(movement.movementId, 'maker1');

    const audit = service.listDeletePendingAudit({ lcNumber: 'WD-9' });
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]?.statusBefore).toBe('REJECTED');
  });

  test('a second withdraw-then-resubmit-then-withdraw cycle produces two independent audit rows sharing the same natural-key delete-seq chain', () => {
    const { service, movement } = issueSightLcAcknowledgedAndSubmitted('WD-10');
    service.withdrawMakerSubmit(movement.movementId, 'maker1');
    service.submitByMaker(movement.movementId, 'maker1');

    service.withdrawMakerSubmit(movement.movementId, 'maker1');

    const audit = service.listDeletePendingAudit({ lcNumber: 'WD-10' });
    expect(audit.items).toHaveLength(2);
    expect(audit.items.map((a) => a.deleteSeq).sort()).toEqual([1, 2]);
  });
});

// Balance-Component-DeletePending-TestPlan-zh.md §3 — the A3/A3S special-state matrix, all 6 cases.
// Uses the Sight/A3->A4 path as the representative walkthrough (A3S/Usance->A6 share the exact same
// acknowledgeArrival()/submitByMaker()/reject()/cancel() code paths — tenor/A3S-vs-A3 only changes which
// contract owns the UTILIZE, never the state-machine logic under test here).
//
// Defect #4 found executing this matrix (BA-directed §8 execution, 2026-08-27): cancel() had NO check at
// all for acknowledgedAt/makerSubmittedAt — calling it directly (bypassing the Angular UI's own
// disabled-button posture, which §6.5 explicitly says must not be the only guard) on an Acknowledged
// (EARMARKED, still PENDING) A3/A3S UTILIZE silently cancelled the whole earmark, contradicting §3 Cases
// 3/4's own approved Expected Result (❌ 409). Live-reproduced via curl against the real running
// microservice before fixing (both cases returned 200/CANCELLED). Fixed: cancel() now throws
// IllegalStateTransitionError (409) when `acknowledgedAt` is set AND `status === 'PENDING'` — scoped
// correctly since acknowledgedAt is only ever set on A3/A3S's own UTILIZE (acknowledgeArrival()'s own doc
// comment), and gated on status===PENDING specifically so Case 5 (post-Reject, status flips to REJECTED)
// still works per §0.2 P0's own "Reject re-enables Delete Pending" rule.
describe('BalanceService.cancel — §3 A3/A3S special-state matrix (Balance-Component-DeletePending-TestPlan-zh.md §3, 6 cases)', () => {
  function issueSightLcAndUtilize(lcNumber: string) {
    const service = new BalanceService(createDb(':memory:'));
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    return { service, movementId: utilize.movement.movementId };
  }

  test('Case 1 — A3 Submit -> Delete Pending directly (never approved): Success', () => {
    const { service, movementId } = issueSightLcAndUtilize('MATRIX-1');
    const cancelled = service.cancel(movementId, 'maker1', 'MAKER_EC');
    expect(cancelled.status).toBe('CANCELLED');
  });

  test('Case 2 — Submit -> Checker Reject (never approved) -> Delete Pending: Success', () => {
    const { service, movementId } = issueSightLcAndUtilize('MATRIX-2');
    service.reject(movementId, 'checker1', 'DOC_DISCREPANCY');
    const cancelled = service.cancel(movementId, 'maker1', 'MAKER_EC');
    expect(cancelled.status).toBe('CANCELLED');
  });

  test('Case 3 — Submit -> Checker Acknowledge (EARMARKED, still PENDING) -> Delete Pending: 409 (Defect #4 fix)', () => {
    const { service, movementId } = issueSightLcAndUtilize('MATRIX-3');
    service.acknowledgeArrival(movementId, 'checker1');
    expect(() => service.cancel(movementId, 'maker1', 'MAKER_EC')).toThrow(IllegalStateTransitionError);
    const untouched = service.listMovements(service.resolveContract('IPLC_LC', { lcNumber: 'MATRIX-3' })!.balanceContractId).find((m) => m.movementId === movementId)!;
    expect(untouched.status).toBe('PENDING'); // the rejected cancel() attempt must leave the earmark completely untouched.
    expect(untouched.acknowledgedAt).toBeTruthy();
  });

  test('Case 4 — (continuing 3) A4 Maker Submit -> Delete Pending: 409 (Defect #4 fix)', () => {
    const { service, movementId } = issueSightLcAndUtilize('MATRIX-4');
    service.acknowledgeArrival(movementId, 'checker1');
    service.submitByMaker(movementId, 'maker1');
    expect(() => service.cancel(movementId, 'maker1', 'MAKER_EC')).toThrow(IllegalStateTransitionError);
    const untouched = service.listMovements(service.resolveContract('IPLC_LC', { lcNumber: 'MATRIX-4' })!.balanceContractId).find((m) => m.movementId === movementId)!;
    expect(untouched.status).toBe('PENDING');
    expect(untouched.makerSubmittedAt).toBeTruthy();
  });

  test('Case 5 — (continuing 4) A4 Checker Reject -> Delete Pending: Success, all three audit points (Acknowledge/Reject/Delete) independently queryable', () => {
    const { service, movementId } = issueSightLcAndUtilize('MATRIX-5');
    service.acknowledgeArrival(movementId, 'checker1');
    service.submitByMaker(movementId, 'maker1');
    const rejected = service.reject(movementId, 'checker1', 'SETTLEMENT_DECLINED');
    expect(rejected.status).toBe('REJECTED');

    const cancelled = service.cancel(movementId, 'maker1', 'MAKER_EC');

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.acknowledgedAt).toBeTruthy();
    expect(cancelled.releasedBy).toBe('checker1');
    expect(cancelled.releasedAt).toBe(rejected.releasedAt);
    expect(cancelled.cancelledBy).toBe('maker1');
    expect(cancelled.cancelledAt).toBeTruthy();
    const audit = service.listDeletePendingAudit({ lcNumber: 'MATRIX-5' });
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0]!.statusBefore).toBe('REJECTED');
  });

  test('Case 6 — (continuing 4) A4 Checker Release -> Delete Pending: 409 (existing state machine, RELEASED is terminal — not a new rule)', () => {
    const { service, movementId } = issueSightLcAndUtilize('MATRIX-6');
    service.acknowledgeArrival(movementId, 'checker1');
    service.submitByMaker(movementId, 'maker1');
    const released = service.release(movementId, 'checker1');
    expect(released.status).toBe('RELEASED');

    expect(() => service.cancel(movementId, 'maker1', 'MAKER_EC')).toThrow(IllegalStateTransitionError);
  });
});

// Defect fix (BA code-review finding ahead of Balance-Component-DeletePending-TestPlan-zh.md §8 step 3,
// registered under that document's own §0.3 Test Governance Rule as the defect blocking §3 Case 5) —
// updateStatus()'s own released_by/released_at previously did a plain overwrite; cancel() never supplies
// either, so a REJECTED -> Delete Pending -> CANCELLED transition (statusTransition.ts's own REJECTED:
// { CANCEL: 'CANCELLED' }) silently erased reject()'s own audit pair (there is no separate
// rejected_by/rejected_at column — reject() writes into these same two). §0.2's own P0 rule requires all
// three points of the Acknowledge -> Reject -> Delete audit trail to remain independently queryable after
// the Delete; this closes the one already-shipped gap in reaching that.
describe('BalanceService.cancel — REJECTED -> Delete Pending preserves the prior Reject\'s own released_by/released_at (Balance-Component-DeletePending-TestPlan-zh.md §0.2 P0, §3 Case 5)', () => {
  function issueSightLcAcknowledgedSubmittedAndRejected(lcNumber: string) {
    const service = new BalanceService(createDb(':memory:'));
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'IB-001',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.acknowledgeArrival(utilize.movement.movementId, 'checker1');
    service.submitByMaker(utilize.movement.movementId, 'maker1');
    const rejected = service.reject(utilize.movement.movementId, 'checker1', 'SETTLEMENT_DECLINED');
    return { service, rejected };
  }

  test('Cancel after Reject keeps released_by/released_at exactly as Reject wrote them, alongside its own cancelled_by/cancelled_at and the original acknowledgedAt — all three audit points independently queryable', () => {
    const { service, rejected } = issueSightLcAcknowledgedSubmittedAndRejected('REJ-CANCEL-1');
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.releasedBy).toBe('checker1');
    expect(rejected.releasedAt).toBeTruthy();
    const rejectedAt = rejected.releasedAt;

    const cancelled = service.cancel(rejected.movementId, 'maker1', 'MAKER_EC');

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.acknowledgedAt).toBeTruthy(); // point 1: Acknowledge — untouched by any updateStatus() call.
    expect(cancelled.releasedBy).toBe('checker1'); // point 2: Reject — must survive Cancel's own updateStatus() call.
    expect(cancelled.releasedAt).toBe(rejectedAt);
    expect(cancelled.cancelledBy).toBe('maker1'); // point 3: Delete Pending — cancel()'s own dedicated pair.
    expect(cancelled.cancelledAt).toBeTruthy();
  });

  test('a plain (never-acknowledged) PENDING -> Reject -> Cancel path gets the same released_by/released_at preservation, with acknowledgedAt staying null throughout', () => {
    const service = new BalanceService(createDb(':memory:'));
    const created = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'REJ-CANCEL-2' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!created.created) throw new Error('expected a new movement');
    const rejected = service.reject(created.movement.movementId, 'checker1', 'DOC_DISCREPANCY');

    const cancelled = service.cancel(rejected.movementId, 'maker1', 'MAKER_EC');

    expect(cancelled.releasedBy).toBe('checker1');
    expect(cancelled.releasedAt).toBe(rejected.releasedAt);
    expect(cancelled.acknowledgedAt).toBeNull();
  });
});

describe('BalanceService.cancel — Delete Pending on a root A1/B1 ISSUE frees the natural key for reuse', () => {
  function issueRoot(service: BalanceService, instrumentType: 'IPLC_LC' | 'EPLC_CONFIRMATION', lcNumber: string) {
    const result = service.createMovement({
      instrumentType,
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!result.created) throw new Error('expected a new movement');
    return result.movement;
  }

  test('cancelling a PENDING A1 (IPLC_LC) ISSUE marks the contract CANCELLED, and the same LC Number can be re-ISSUEd', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueRoot(service, 'IPLC_LC', 'REUSE-001');

    service.cancel(issue.movementId, 'maker1', 'MAKER_EC');

    // Same natural key, fresh Submit — would throw NaturalKeyAlreadyExistsError before this fix.
    const secondAttempt = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'REUSE-001' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    expect(secondAttempt.created).toBe(true);
    if (!secondAttempt.created) return;
    // A genuinely new, independent contract — not a revival of the cancelled one.
    expect(secondAttempt.movement.balanceContractId).not.toBe(issue.balanceContractId);
  });

  test('cancelling a REJECTED A1 ISSUE (Delete Pending after Checker Reject) has the same effect', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueRoot(service, 'IPLC_LC', 'REUSE-002');
    service.reject(issue.movementId, 'checker1', 'MANUAL_TEST_REJECT');

    service.cancel(issue.movementId, 'maker1', 'MAKER_EC');

    const secondAttempt = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'REUSE-002' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    expect(secondAttempt.created).toBe(true);
  });

  test('works the same for B1 (EPLC_CONFIRMATION)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueRoot(service, 'EPLC_CONFIRMATION', 'REUSE-B1-001');

    service.cancel(issue.movementId, 'maker1', 'MAKER_EC');

    const secondAttempt = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'REUSE-B1-001' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    expect(secondAttempt.created).toBe(true);
  });

  test('does NOT cancel the contract when cancelling a non-ISSUE movement (e.g. AMEND_INCREASE on an already-RELEASED LC)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueRoot(service, 'IPLC_LC', 'REUSE-003');
    service.release(issue.movementId, 'checker1');
    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: Date.now() + Math.random(),
      amount: '10000',
      currency: 'USD',
      sourceTransactionRef: 'A01',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');

    service.cancel(amend.movement.movementId, 'maker1', 'MAKER_EC');

    // The contract is still ACTIVE — a fresh ISSUE against the SAME natural key must still be rejected.
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'REUSE-003' },
        movementType: 'ISSUE',
        eventSeq: Date.now() + Math.random(),
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'maker1',
      }),
    ).toThrow(NaturalKeyAlreadyExistsError);
  });

  test('DOES cancel the contract for a CHILD instrumentType\'s own ISSUE (SHGT/A8) when it was the only movement on it, freeing the SG Number for reuse', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = issueRoot(service, 'IPLC_LC', 'REUSE-004');
    service.release(lcIssue.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'REUSE-004' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'REUSE-004', sgNumber: 'G01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');

    service.cancel(sgIssue.movement.movementId, 'maker1', 'MAKER_EC');

    // Same SG Number under the same LC, fresh Submit — must now succeed as a genuinely new contract.
    const secondAttempt = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'REUSE-004', sgNumber: 'G01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '20000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(secondAttempt.created).toBe(true);
    if (!secondAttempt.created) return;
    expect(secondAttempt.movement.balanceContractId).not.toBe(sgIssue.movement.balanceContractId);
  });

  test('does NOT cancel a CHILD contract when a sibling movement already exists on it (only reachable via a direct, non-UI API call)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = issueRoot(service, 'IPLC_LC', 'REUSE-005');
    service.release(lcIssue.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'REUSE-005' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'REUSE-005', sgNumber: 'G01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    // A sibling movement reaching PENDING on the same still-un-Released SG (bypassing every Maker-action
    // picker's own requireIssueReleased filter) — a direct-API-only edge case, see cancel()'s own doc
    // comment for why the contract must be left ACTIVE rather than retired in this shape.
    const sibling = service.createMovement({
      instrumentType: 'SHGT',
      balanceContractId: sgIssue.movement.balanceContractId,
      movementType: 'FULL_REDEEM',
      eventSeq: Date.now() + Math.random(),
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sibling.created) throw new Error('expected a new movement');

    service.cancel(sgIssue.movement.movementId, 'maker1', 'MAKER_EC');

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'REUSE-005', sgNumber: 'G01' },
        parentLogicalContractId: lc.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: Date.now() + Math.random(),
        amount: '20000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(NaturalKeyAlreadyExistsError);
  });
});

describe('BalanceService.createMovement — sourceTransactionRef reuse after Delete Pending (business-confirmed 2026-08-27, live-reproduced on A3/S01/B04)', () => {
  function issueSightLc(service: BalanceService, lcNumber: string) {
    const result = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!result.created) throw new Error('expected a new movement');
    service.release(result.movement.movementId, 'checker1');
    return result.movement;
  }

  function submitUtilize(service: BalanceService, balanceContractId: string, sourceTransactionRef: string) {
    const result = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '10000',
      currency: 'USD',
      sourceTransactionRef,
      createdBy: 'maker1',
    });
    if (!result.created) throw new Error('expected a new movement');
    return result.movement;
  }

  test('A3: Submit -> Delete Pending -> same IB Number (B04) -> Submit again succeeds', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueSightLc(service, 'S01-SRC-REUSE-1');
    const first = submitUtilize(service, lc.balanceContractId, 'B04');

    service.cancel(first.movementId, 'maker1', 'MAKER_EC');

    expect(() => submitUtilize(service, lc.balanceContractId, 'B04')).not.toThrow();
  });

  test('A3: Submit -> Reject -> Delete Pending -> same IB Number (B04) -> Submit again succeeds', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueSightLc(service, 'S01-SRC-REUSE-2');
    const first = submitUtilize(service, lc.balanceContractId, 'B04');
    service.reject(first.movementId, 'checker1', 'DOCS_DISCREPANCY');

    service.cancel(first.movementId, 'maker1', 'MAKER_EC');

    expect(() => submitUtilize(service, lc.balanceContractId, 'B04')).not.toThrow();
  });

  test('the original CANCELLED movement itself is left untouched (still readable, still carries B04, still in Inquire Delete Pending) — only the duplicate check is narrowed', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueSightLc(service, 'S01-SRC-REUSE-3');
    const first = submitUtilize(service, lc.balanceContractId, 'B04');
    service.cancel(first.movementId, 'maker1', 'MAKER_EC');

    const second = submitUtilize(service, lc.balanceContractId, 'B04');

    const all = service.listMovements(lc.balanceContractId);
    const cancelledOriginal = all.find((m) => m.movementId === first.movementId);
    expect(cancelledOriginal?.status).toBe('CANCELLED');
    expect(cancelledOriginal?.sourceTransactionRef).toBe('B04');
    expect(second.status).toBe('PENDING');
    expect(second.sourceTransactionRef).toBe('B04');

    const audit = service.listDeletePendingAudit({ lcNumber: 'S01-SRC-REUSE-3' });
    expect(audit.items.map((a) => a.movementId)).toContain(first.movementId);
  });

  test('a still-PENDING (never cancelled) duplicate sourceTransactionRef is still rejected — the fix only excludes CANCELLED, not every status', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueSightLc(service, 'S01-SRC-REUSE-4');
    submitUtilize(service, lc.balanceContractId, 'B04');

    expect(() => submitUtilize(service, lc.balanceContractId, 'B04')).toThrow(RequestValidationError);
  });
});

describe('BalanceService.cancel — delete_pending_audit (Fix Pending/Delete Pending Phase, BA/business-directed 2026-08-27)', () => {
  function auditRows(db: ReturnType<typeof createDb>, movementId: string) {
    return db.prepare('SELECT * FROM delete_pending_audit WHERE movement_id = ? ORDER BY cancelled_at ASC').all(movementId) as any[];
  }

  test('cancelling a PENDING movement writes exactly one audit row with statusBefore=PENDING', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      sourceTransactionRef: undefined,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');

    service.cancel(issue.movement.movementId, 'maker1', 'MAKER_EC', 'no longer needed');

    const rows = auditRows(db, issue.movement.movementId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      movement_id: issue.movement.movementId,
      balance_contract_id: issue.movement.balanceContractId,
      event_seq: 1,
      movement_type: 'ISSUE',
      status_before: 'PENDING',
      cancelled_by: 'maker1',
      reason_code: 'MAKER_EC',
      remarks: 'no longer needed',
      delete_seq: 1,
    });
    expect(rows[0].audit_id).toEqual(expect.any(String));
    expect(rows[0].cancelled_at).toEqual(expect.any(String));
  });

  test('cancelling a REJECTED movement writes statusBefore=REJECTED', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.reject(issue.movement.movementId, 'checker1', 'MANUAL_TEST_REJECT');

    service.cancel(issue.movement.movementId, 'maker1', 'MAKER_EC');

    const rows = auditRows(db, issue.movement.movementId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status_before).toBe('REJECTED');
    expect(rows[0].delete_seq).toBe(1);
  });

  test('defaults reason_code to MAKER_EC when the caller omits it, same as the movement\'s own cancelled reasonCode', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-003' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');

    service.cancel(issue.movement.movementId, 'maker1');

    const rows = auditRows(db, issue.movement.movementId);
    expect(rows[0].reason_code).toBe('MAKER_EC');
  });

  test('a compound function\'s own cascade (cancel() called once per leg) writes one independent audit row per leg', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-004' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const lcContract = service.resolveContract('IPLC_LC', { lcNumber: 'AUDIT-004' });
    if (!lcContract) throw new Error('expected the just-issued LC to resolve');
    const businessEventId = 'audit-004-business-event';
    const sgRedeem = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'AUDIT-004', sgNumber: 'G01' },
      parentLogicalContractId: lcContract.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgRedeem.created) throw new Error('expected a new movement');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '5000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      businessEventId,
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');

    // Simulates deleteMakerPending()'s own A3S cascade (checker-actions.service.ts) — cancels each leg
    // via its own separate cancel() call, reverse creation order.
    service.cancel(sgRedeem.movement.movementId, 'maker1', 'MAKER_EC');
    service.cancel(utilize.movement.movementId, 'maker1', 'MAKER_EC');

    const sgRows = auditRows(db, sgRedeem.movement.movementId);
    const utilizeRows = auditRows(db, utilize.movement.movementId);
    expect(sgRows).toHaveLength(1);
    expect(utilizeRows).toHaveLength(1);
    expect(sgRows[0].audit_id).not.toBe(utilizeRows[0].audit_id);
    expect(sgRows[0].movement_type).toBe('ISSUE');
    expect(utilizeRows[0].movement_type).toBe('UTILIZE');
    // Different natural keys (LC-only vs. LC+SG) — each starts its own independent delete_seq at 1,
    // never sharing a counter just because they were cancelled in the same test/session.
    expect(sgRows[0].delete_seq).toBe(1);
    expect(utilizeRows[0].delete_seq).toBe(1);
  });

  test('delete_seq increments across repeated Delete Pending -> Resubmit cycles on the SAME natural key, even though A1/B1\'s LC-reuse fix gives each cycle a brand new balanceContractId', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);

    function issueAndCancel(eventSeq: number) {
      const issue = service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'AUDIT-SEQ-001' },
        movementType: 'ISSUE',
        eventSeq,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'maker1',
      });
      if (!issue.created) throw new Error('expected a new movement');
      service.cancel(issue.movement.movementId, 'maker1', 'MAKER_EC');
      return issue.movement;
    }

    const first = issueAndCancel(1);
    const second = issueAndCancel(2);
    const third = issueAndCancel(3);

    // A1's own LC-reuse fix (§9.3) means each Resubmit after a Delete Pending gets a brand new
    // balanceContractId — the natural key (lcNumber) is the only thing that stays constant.
    expect(second.balanceContractId).not.toBe(first.balanceContractId);
    expect(third.balanceContractId).not.toBe(first.balanceContractId);

    expect(auditRows(db, first.movementId)[0].delete_seq).toBe(1);
    expect(auditRows(db, second.movementId)[0].delete_seq).toBe(2);
    expect(auditRows(db, third.movementId)[0].delete_seq).toBe(3);
  });

  test('delete_seq is scoped per natural key — a different LC Number, or the same LC with a different SG Number, never shares another chain\'s counter', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);

    const lcA = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-SEQ-002A' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcA.created) throw new Error('expected a new movement');
    service.cancel(lcA.movement.movementId, 'maker1', 'MAKER_EC');
    service.cancel(
      (() => {
        const resubmit = service.createMovement({
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: 'AUDIT-SEQ-002A' },
          movementType: 'ISSUE',
          eventSeq: 2,
          amount: '60000',
          currency: 'USD',
          tenorType: 'SIGHT',
          expiryDate: '2099-12-31',
          createdBy: 'maker1',
        });
        if (!resubmit.created) throw new Error('expected a new movement');
        return resubmit.movement.movementId;
      })(),
      'maker1',
      'MAKER_EC',
    );
    // LC-A is now at delete_seq 2 (two full Delete Pending cycles).

    const lcB = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-SEQ-002B' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcB.created) throw new Error('expected a new movement');
    service.cancel(lcB.movement.movementId, 'maker1', 'MAKER_EC');

    // A genuinely different LC Number's own first Delete Pending starts at 1, unaffected by LC-A's
    // own count reaching 2 first.
    expect(auditRows(db, lcB.movement.movementId)[0].delete_seq).toBe(1);
  });

  test('DeletePendingAuditStore.listByMovement()/listByContract() — the store\'s own public read methods, not just raw SQL', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AUDIT-STORE-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '50000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.cancel(issue.movement.movementId, 'maker1', 'MAKER_EC', 'via store test');

    const store = new DeletePendingAuditStore(db);

    const byMovement = store.listByMovement(issue.movement.movementId);
    expect(byMovement).toHaveLength(1);
    expect(byMovement[0]).toMatchObject({
      movementId: issue.movement.movementId,
      balanceContractId: issue.movement.balanceContractId,
      deleteSeq: 1,
      statusBefore: 'PENDING',
      cancelledBy: 'maker1',
      reasonCode: 'MAKER_EC',
      remarks: 'via store test',
    });

    const byContract = store.listByContract(issue.movement.balanceContractId);
    expect(byContract).toEqual(byMovement);

    expect(store.listByMovement('no-such-movement')).toEqual([]);
    expect(store.listByContract('no-such-contract')).toEqual([]);
  });
});

describe('BalanceMovementStore.listShgtMovementsForParents — two children under the SAME parent', () => {
  test('groups multiple SG contracts\' own movements under one parentLogicalContractId key (branch-coverage gap: the second row for an already-seen parent must push onto the existing list, not overwrite it)', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'SHGT-SIBLINGS-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const lcContract = service.resolveContract('IPLC_LC', { lcNumber: 'SHGT-SIBLINGS-001' });
    if (!lcContract) throw new Error('expected the just-issued LC to resolve');

    const sg1 = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'SHGT-SIBLINGS-001', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 2,
      amount: '1000',
      currency: 'USD',
      parentLogicalContractId: lcContract.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sg1.created) throw new Error('expected a new movement');
    const sg2 = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'SHGT-SIBLINGS-001', sgNumber: 'SG02' },
      movementType: 'ISSUE',
      eventSeq: 3,
      amount: '2000',
      currency: 'USD',
      parentLogicalContractId: lcContract.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sg2.created) throw new Error('expected a new movement');

    const byParent = new BalanceMovementStore(db).listShgtMovementsForParents([lcContract.logicalContractId]);

    const movements = byParent.get(lcContract.logicalContractId) ?? [];
    expect(movements.map((m) => m.movementId).sort()).toEqual([sg1.movement.movementId, sg2.movement.movementId].sort());
  });
});

// Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
// 2026-08-27) — trial rollout for A1/A3, first two Functions wired up on the Angular side; the
// service method itself (editPending()) is generic across every movementType already covered by
// movementTypeRegistry, per the same test-plan-execution convention this file already uses elsewhere.
describe('BalanceService.editPending — Fix Pending trial (A1 ISSUE, A3 UTILIZE)', () => {
  function issueSightLc(service: BalanceService, lcNumber: string) {
    const result = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!result.created) throw new Error('expected a new movement');
    return result.movement;
  }

  function issueSightLcAndUtilize(service: BalanceService, lcNumber: string) {
    const lc = issueSightLc(service, lcNumber);
    service.release(lc.movementId, 'checker1');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '40000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    return { lc, utilize: utilize.movement };
  }

  test('A1 (ISSUE) — Fix Pending amount corrects the SAME row in place (same movementId/eventSeq), and a fix_pending_audit row preserves the pre-edit content', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-001');

    const corrected = service.editPending(issue.movementId, { amount: '120000', editedBy: 'maker2' });

    expect(corrected.status).toBe('PENDING');
    expect(corrected.amount).toBe('120000');
    expect(corrected.eventSeq).toBe(issue.eventSeq); // §19 — reused, not a new value
    expect(corrected.movementId).toBe(issue.movementId); // same identity, not a replacement row
    expect(corrected.createdBy).toBe('maker2'); // the editor now stands as the current content's author
    expect(corrected.editedBy).toBe('maker2');
    expect(corrected.editedAt).toBeTruthy();

    const contract = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A1-001' })!;
    // Exactly one row for this event — no second/duplicate row lingering anywhere.
    expect(service.listMovements(contract.balanceContractId)).toHaveLength(1);

    const audit = service.listFixPendingAudit(issue.movementId);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.statusBefore).toBe('PENDING');
    expect(audit[0]!.originalCreatedBy).toBe('maker1'); // the TRUE original Maker, preserved
    expect(audit[0]!.editedBy).toBe('maker2');
    expect((audit[0]!.beforeSnapshot as { amount: string }).amount).toBe('100000');
    expect((audit[0]!.afterSnapshot as { amount: string }).amount).toBe('120000');
  });

  test('A3 (UTILIZE) — Fix Pending amount, sourceTransactionRef carried over unchanged (locked, the movement\'s own business "2ndary Key")', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { utilize } = issueSightLcAndUtilize(service, 'FIXP-A3-001');

    const replacement = service.editPending(utilize.movementId, { amount: '35000', editedBy: 'maker1' });

    expect(replacement.amount).toBe('35000');
    expect(replacement.sourceTransactionRef).toBe('B01');
    expect(replacement.eventSeq).toBe(utilize.eventSeq);
  });

  test('§19.1 — Fix Pending is NOT bound to the original Maker; a different editor succeeds with no ownership check', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-002');
    expect(issue.createdBy).toBe('maker1');

    const replacement = service.editPending(issue.movementId, { amount: '90000', editedBy: 'someone-else-entirely' });

    expect(replacement.status).toBe('PENDING');
    expect(replacement.createdBy).toBe('someone-else-entirely');
  });

  test('REJECTED is also a legal source state (mirrors CANCEL\'s own PENDING/REJECTED shape)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { utilize } = issueSightLcAndUtilize(service, 'FIXP-A3-002');
    service.reject(utilize.movementId, 'checker1', 'DOC_DISCREPANCY');

    const replacement = service.editPending(utilize.movementId, { amount: '20000', editedBy: 'maker1' });

    expect(replacement.status).toBe('PENDING');
  });

  test('RELEASED/CANCELLED are illegal source states — 409, same statusTransition.ts table CANCEL already uses', () => {
    const service = new BalanceService(createDb(':memory:'));
    const released = issueSightLc(service, 'FIXP-A1-003');
    service.release(released.movementId, 'checker1');
    expect(() => service.editPending(released.movementId, { amount: '1', editedBy: 'maker1' })).toThrow(IllegalStateTransitionError);

    const cancelled = issueSightLc(service, 'FIXP-A1-004');
    service.cancel(cancelled.movementId, 'maker1');
    expect(() => service.editPending(cancelled.movementId, { amount: '1', editedBy: 'maker1' })).toThrow(IllegalStateTransitionError);
  });

  test('a corrected record lands back at PENDING and can be Fix-Pending-edited again — the in-place mechanism has no "already edited once" restriction', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-005');

    service.editPending(issue.movementId, { amount: '2', editedBy: 'maker1' });
    const twiceCorrected = service.editPending(issue.movementId, { amount: '3', editedBy: 'maker1' });

    expect(twiceCorrected.movementId).toBe(issue.movementId);
    expect(twiceCorrected.status).toBe('PENDING');
    expect(twiceCorrected.amount).toBe('3');
    expect(service.listFixPendingAudit(issue.movementId)).toHaveLength(2);
  });

  test('editing a non-existent movementId throws NotFoundError', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => service.editPending('00000000-0000-0000-0000-000000000000', { amount: '1', editedBy: 'maker1' })).toThrow(NotFoundError);
  });

  test('the sufficiency check genuinely re-runs against the patched amount — increasing A3\'s own amount past Available Balance is rejected (InsufficientBalanceError), proving this is not a lighter-weight path than a real Submit', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { utilize } = issueSightLcAndUtilize(service, 'FIXP-A3-003'); // LC Confirmed 100000, this UTILIZE 40000

    expect(() => service.editPending(utilize.movementId, { amount: '999999', editedBy: 'maker1' })).toThrow(InsufficientBalanceError);

    // Rejected attempt must leave the original record completely untouched.
    const contract = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A3-003' })!;
    const untouched = service.listMovements(contract.balanceContractId).find((m) => m.movementId === utilize.movementId)!;
    expect(untouched.status).toBe('PENDING');
    expect(untouched.amount).toBe('40000');
  });

  test('§6.1 transaction consistency — if the correction half fails mid-transaction, the record is rolled back to its original, untouched state, and no audit row survives either', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-006');

    const correctionSpy = jest.spyOn(BalanceMovementStore.prototype, 'applyFixPendingCorrection').mockImplementationOnce(() => {
      throw new Error('simulated correction failure, mid-transaction');
    });
    try {
      expect(() => service.editPending(issue.movementId, { amount: '150000', editedBy: 'maker1' })).toThrow('simulated correction failure');
    } finally {
      correctionSpy.mockRestore();
    }

    const contract = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A1-006' })!;
    const untouched = service.listMovements(contract.balanceContractId).find((m) => m.movementId === issue.movementId)!;
    expect(untouched.status).toBe('PENDING');
    expect(untouched.amount).toBe('100000'); // the original amount, unchanged
    expect(untouched.editedBy).toBeFalsy();
    expect(untouched.createdBy).toBe('maker1'); // never overwritten to the editor
    // And the audit row the failed transaction attempted to insert never survived the rollback either.
    expect(service.listFixPendingAudit(issue.movementId)).toHaveLength(0);
    expect(service.listMovements(contract.balanceContractId)).toHaveLength(1);
  });

  test('every optional passthrough field on the patch is honored when supplied, not just the ??-fallback-to-null default path', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-008');

    const replacement = service.editPending(issue.movementId, {
      amount: '111000',
      editedBy: 'maker2',
      businessEventId: 'BEV-EDIT-001',
      exposureNature: 'ACTUAL',
      legRef: 'LEG-01',
      newExpiryDate: '2030-01-01',
      transactionDate: '2026-08-28',
      businessDate: '2026-08-28',
      valueDate: '2026-08-28',
      sourceModule: 'FIXP-TEST',
      sourceFunction: 'A1',
      referencedTransactionId: '11111111-1111-1111-1111-111111111111',
      reasonCode: 'CUSTOMER_REQUEST',
      amendmentApproved: true,
      amendmentEffective: '2026-08-28',
      consentStatus: 'OBTAINED',
    });

    expect(replacement.businessEventId).toBe('BEV-EDIT-001');
    expect(replacement.exposureNature).toBe('ACTUAL');
    expect(replacement.legRef).toBe('LEG-01');
    expect(replacement.newExpiryDate).toBe('2030-01-01');
    expect(replacement.transactionDate).toBe('2026-08-28');
    expect(replacement.businessDate).toBe('2026-08-28');
    expect(replacement.valueDate).toBe('2026-08-28');
    expect(replacement.sourceModule).toBe('FIXP-TEST');
    expect(replacement.sourceFunction).toBe('A1');
    expect(replacement.referencedTransactionId).toBe('11111111-1111-1111-1111-111111111111');
    expect(replacement.reasonCode).toBe('CUSTOMER_REQUEST');
    expect(replacement.amendmentApproved).toBe(true);
    expect(replacement.amendmentEffective).toBe('2026-08-28');
    expect(replacement.consentStatus).toBe('OBTAINED');
  });

  test('accountEntries — provided and honored for a non-MEMO edit, forced null when exposureNature is patched to MEMO (same rule createMovement() itself applies)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issueWithEntries = issueSightLc(service, 'FIXP-A1-009');
    const withEntries = service.editPending(issueWithEntries.movementId, {
      amount: '105000',
      editedBy: 'maker2',
      accountEntries: [{ accountRef: 'GL-001', drCr: 'D', amount: '105000' }],
    });
    expect(withEntries.accountEntries).toEqual([{ accountRef: 'GL-001', drCr: 'D', amount: '105000' }]);

    const issueForMemo = issueSightLc(service, 'FIXP-A1-010');
    const memoEdit = service.editPending(issueForMemo.movementId, {
      amount: '106000',
      editedBy: 'maker2',
      exposureNature: 'MEMO',
      accountEntries: [{ accountRef: 'GL-002', drCr: 'C', amount: '106000' }],
    });
    expect(memoEdit.accountEntries).toBeNull();
  });

  test('a patched amount violating the currency\'s own decimal scale (e.g. USD to 3 decimal places) is rejected — proves this check genuinely re-runs against the CONTRACT\'s real currency, since the edit payload never carries currency itself', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-011');
    expect(() => service.editPending(issue.movementId, { amount: '100000.123', editedBy: 'maker2' })).toThrow(RequestValidationError);
  });

  test('the defensive "no movementTypeRegistry descriptor for this movementType" branch throws RequestValidationError — unreachable via the public API since editPending() always reuses old.movementType, a value that was itself only ever accepted by a prior createMovement() call against the SAME registry', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-015');

    const originalRegistry = (service as unknown as { movementTypeRegistry: Record<string, unknown> }).movementTypeRegistry;
    (service as unknown as { movementTypeRegistry: Record<string, unknown> }).movementTypeRegistry = {};
    try {
      expect(() => service.editPending(issue.movementId, { amount: '1', editedBy: 'maker2' })).toThrow(RequestValidationError);
    } finally {
      (service as unknown as { movementTypeRegistry: Record<string, unknown> }).movementTypeRegistry = originalRegistry;
    }
  });

  test('the defensive "no BalanceContract owning this movement" branch throws NotFoundError — same defense-in-depth posture as cancel()\'s own equivalent check, unreachable via the public API since a movement always has a real owning contract by FK construction', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-012');

    const contractSpy = jest.spyOn(BalanceContractStore.prototype, 'findById').mockReturnValueOnce(undefined);
    try {
      expect(() => service.editPending(issue.movementId, { amount: '1', editedBy: 'maker2' })).toThrow(NotFoundError);
    } finally {
      contractSpy.mockRestore();
    }
  });

  // Contract-level fields (2026-08-28, per direct user feedback — "為什麼只有amount可以改... Expiry Date,
  // Tenor Type etc.?"; "頁面配置檔 for A1-A11/B1-B7") — isCreatingEdit's own two branches. A1's own ISSUE
  // is `isCreating: true` in movementTypeRegistry, so its still-PENDING record owns the contract it just
  // created; A3's own UTILIZE is not, so the same patch fields must be silently ignored server-side even
  // if a caller sends them (defense-in-depth — the Angular client itself never sends them for A3 either,
  // per function-strategy.ts's own A3 fixPendingEditableFields: Set(['amount'])).
  test('A1 (ISSUE, isCreatingEdit=true) — patched tolerancePct/tenorType/tenorDays/expiryDate/mailFloatGraceDays are written onto the CONTRACT via updateIssueFields(), and the replacement\'s own ceilingAmount reflects the new tolerancePct', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-013'); // tenorType SIGHT, no tolerancePct set (contract.tolerancePct is null)

    const replacement = service.editPending(issue.movementId, {
      amount: '100000',
      editedBy: 'maker2',
      tolerancePct: '10',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      expiryDate: '2099-06-30',
      mailFloatGraceDays: 5,
    });

    // ceilingAmount = amount * (1 + tolerancePct/100) = 100000 * 1.10 = 110000 — proves the PATCHED
    // tolerancePct was actually used, not the contract's own pre-edit (null) value.
    expect(replacement.ceilingAmount).toBe('110000');

    const contract = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A1-013' })!;
    expect(contract.tolerancePct).toBe('10');
    expect(contract.tenorType).toBe('SELLERS_USANCE');
    expect(contract.tenorDays).toBe(90);
    expect(contract.expiryDate).toBe('2099-06-30');
    expect(contract.mailFloatGraceDays).toBe(5);
  });

  test('A1 (ISSUE, isCreatingEdit=true) via Fix Pending — contingentAccountEntry also books the Ceiling amount, same "LC Balance = Amount × (1 + Tolerance%) 帳務是用LC Balance出帳" rule createMovement() itself follows', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-016'); // no tolerancePct set yet

    const replacement = service.editPending(issue.movementId, { amount: '100000', editedBy: 'maker2', tolerancePct: '10' });

    expect(replacement.ceilingAmount).toBe('110000');
    expect(replacement.contingentAccountEntry?.amount).toBe('110000'); // not the face amount 100000
  });

  test('A1 (ISSUE, isCreatingEdit=true) — omitting a contract-level field from the patch leaves the contract\'s own existing value untouched (COALESCE, not a forced null)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = issueSightLc(service, 'FIXP-A1-014'); // tenorType SIGHT, expiryDate 2099-12-31 already set

    service.editPending(issue.movementId, { amount: '100000', editedBy: 'maker2', tolerancePct: '7' });

    const contract = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A1-014' })!;
    expect(contract.tolerancePct).toBe('7'); // the one field actually patched
    expect(contract.tenorType).toBe('SIGHT'); // untouched — not overwritten to null
    expect(contract.expiryDate).toBe('2099-12-31'); // untouched
  });

  test('A3 (UTILIZE, isCreatingEdit=false) — the SAME contract-level fields in the patch are silently ignored; the parent LC\'s own tolerancePct/tenorType are never touched by a non-creating edit', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueSightLcAndUtilize(service, 'FIXP-A3-004');
    const before = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A3-004' })!;
    expect(before.balanceContractId).toBe(lc.balanceContractId);

    service.editPending(utilize.movementId, {
      amount: '35000',
      editedBy: 'maker1',
      tolerancePct: '99',
      tenorType: 'BUYERS_USANCE',
      tenorDays: 999,
      expiryDate: '2001-01-01',
    });

    const after = service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A3-004' })!;
    expect(after.tolerancePct).toBe(before.tolerancePct);
    expect(after.tenorType).toBe(before.tenorType);
    expect(after.tenorDays).toBe(before.tenorDays);
    expect(after.expiryDate).toBe(before.expiryDate);
  });

  // 2026-08-28, per direct user feedback ("A2 Tolerance % FIX PENDING INCREASE/DECREASE時准許修改") —
  // tolerancePct is a DELIBERATE EXCEPTION to the A3-style "contract-level fields stay locked for a
  // non-creating edit" rule above: unlike tenorType/tenorDays/expiryDate, a patched tolerancePct on a
  // non-creating, tolerance-applicable edit (A2's own AMEND_INCREASE/AMEND_DECREASE) DOES flow into
  // the amendment's recalculated upper limit. It remains a proposal while PENDING; Checker Release
  // then makes it the contract's latest tolerance.
  test('A2 (AMEND_INCREASE) Fix Pending recalculates the full amended upper limit; tolerance becomes current only on Release', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'FIXP-A2-001' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      tolerancePct: '5', // the contract's own ORIGINAL Tolerance %, set at ISSUE
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: Date.now() + Math.random(),
      amount: '20000',
      currency: 'USD',
      sourceTransactionRef: 'A01',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    // ceilingAmount at the ORIGINAL Fix Pending-untouched tolerancePct (5%): 20000 * 1.05 = 21000.
    expect(amend.movement.ceilingAmount).toBe('21000');

    const replacement = service.editPending(amend.movement.movementId, {
      amount: '20000',
      editedBy: 'maker2',
      toleranceChangePct: '10',
      toleranceChangeDirection: 'INCREASE',
    });

    // Old upper = 100000 × 1.05 = 105000; new upper = 120000 × 1.15 = 138000;
    // the movement books the full upper-limit delta, 33000 (not 20000 × 1.15).
    expect(replacement.ceilingAmount).toBe('33000');
    expect(replacement.contingentAccountEntry?.amount).toBe('33000');
    expect(replacement.tolerancePct).toBe('5');
    expect(replacement.toleranceChangePct).toBe('10');

    // Pending proposal does not change operative terms.
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A2-001' })!.tolerancePct).toBe('5');
    service.release(replacement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'FIXP-A2-001' })!.tolerancePct).toBe('15');
  });

  test('A2 Tolerance-only amendment accepts Amount 0, leaves face amount unchanged, and applies 20% -> 15% on Checker Release', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'A2-TOLERANCE-ONLY' }, movementType: 'ISSUE', eventSeq: 1,
      amount: '100000', currency: 'USD', tenorType: 'SIGHT', expiryDate: '2099-12-31', tolerancePct: '20', createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC', balanceContractId: issue.movement.balanceContractId, movementType: 'AMEND_DECREASE', eventSeq: 2,
      amount: '0', currency: 'USD', toleranceChangePct: '5', toleranceChangeDirection: 'DECREASE', sourceTransactionRef: 'A01', createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.amount).toBe('0');
    expect(amend.movement.ceilingAmount).toBe('5000');

    service.release(amend.movement.movementId, 'checker1');
    const contract = service.resolveContract('IPLC_LC', { lcNumber: 'A2-TOLERANCE-ONLY' })!;
    expect(contract.tolerancePct).toBe('15');
    expect(service.getBalanceSnapshot(contract.balanceContractId).confirmedBalance).toBe('115000');
  });

  test('API rejects a monetary amendment where Amount is zero and Tolerance is unchanged', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'A2-NO-OP' }, movementType: 'ISSUE', eventSeq: 1,
      amount: '100000', currency: 'USD', tenorType: 'SIGHT', expiryDate: '2099-12-31', tolerancePct: '20', createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    expect(() => service.createMovement({
      instrumentType: 'IPLC_LC', balanceContractId: issue.movement.balanceContractId, movementType: 'AMEND_INCREASE', eventSeq: 2,
      amount: '0', currency: 'USD', toleranceChangePct: '0', toleranceChangeDirection: 'INCREASE', sourceTransactionRef: 'A01', createdBy: 'maker1',
    })).toThrow('must change Amount, Tolerance, or both');
  });

  test('A2 Fix Pending refreshes the persisted PENDING event snapshot immediately (S01: 32,000 amendment effect nets to 22,000)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'FIXP-S01-SNAPSHOT' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 3,
      amount: '10000',
      currency: 'USD',
      sourceTransactionRef: 'A01',
      toleranceChangePct: '10',
      toleranceChangeDirection: 'INCREASE',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.eventSnapshot?.availableBalance).toBe('111000');
    expect(amend.movement.eventSnapshot?.pendingEarmarkTotal).toBe('11000');

    const corrected = service.editPending(amend.movement.movementId, {
      amount: '10000',
      toleranceChangePct: '20',
      toleranceChangeDirection: 'INCREASE',
      editedBy: 'maker2',
    });

    // Old upper = 100,000; new upper = (100,000 + 10,000) × 120% = 132,000.
    // Amendment effect 32,000, net pending = 32,000 - the independent 10,000 UTILIZE = 22,000.
    expect(corrected.ceilingAmount).toBe('32000');
    expect(corrected.tolerancePct).toBeNull();
    expect(corrected.toleranceChangePct).toBe('20');
    expect(corrected.eventSnapshot).toMatchObject({
      confirmedBalance: '100000',
      availableBalance: '122000',
      pendingEarmarkTotal: '22000',
      offBalanceExposure: '0',
      tightAvailableBalance: '90000',
    });
    expect(service.getBalanceSnapshot(issue.movement.balanceContractId)).toMatchObject({
      confirmedBalance: '100000',
      availableBalance: '122000',
      pendingEarmarkTotal: '22000',
      offBalanceExposure: '0',
      tightAvailableBalance: '90000',
    });
  });

  test('Fix Pending persists every non-null root/Acceptance/SG snapshot in the corrected bundle', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'FIXP-SNAPSHOT-BUNDLE' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 2,
      amount: '1000',
      currency: 'USD',
      sourceTransactionRef: 'A01',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');

    const snapshot = {
      balanceContractId: issue.movement.balanceContractId,
      logicalContractId: 'logical-1',
      currency: 'USD',
      confirmedBalance: '100000',
      availableBalance: '102000',
      pendingEarmarkTotal: '2000',
      offBalanceExposure: '0',
      tightAvailableBalance: '100000',
      presentDocsEarmarkPending: null,
      presentDocsEarmarkApproved: null,
      redirectedImpact: null,
    };
    const captureSpy = jest.spyOn(MovementSnapshotService.prototype, 'captureBundle').mockReturnValueOnce({
      eventSnapshot: snapshot,
      rootEventSnapshot: snapshot,
      acceptanceEventSnapshot: snapshot,
      sgEventSnapshot: snapshot,
    });
    try {
      const corrected = service.editPending(amend.movement.movementId, {
        amount: '2000',
        editedBy: 'maker2',
        accountEntries: [{ accountRef: 'GL-SNAPSHOT', drCr: 'D', amount: '2000' }],
        amendmentApproved: false,
      });
      expect(corrected.eventSnapshot).toEqual(snapshot);
      expect(corrected.rootEventSnapshot).toEqual(snapshot);
      expect(corrected.acceptanceEventSnapshot).toEqual(snapshot);
      expect(corrected.sgEventSnapshot).toEqual(snapshot);
      expect(corrected.accountEntries).toEqual([{ accountRef: 'GL-SNAPSHOT', drCr: 'D', amount: '2000' }]);
      expect(corrected.amendmentApproved).toBe(false);
    } finally {
      captureSpy.mockRestore();
    }
  });

  test('A2 (AMEND_INCREASE) — omitting tolerancePct from the patch falls back to the contract\'s own current tolerancePct (COALESCE), same as a creating edit', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'FIXP-A2-002' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      tolerancePct: '10',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: Date.now() + Math.random(),
      amount: '20000',
      currency: 'USD',
      sourceTransactionRef: 'A02',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');

    const replacement = service.editPending(amend.movement.movementId, { amount: '30000', editedBy: 'maker2' });

    // No tolerancePct in the patch — falls back to the contract's own current 10%: 30000 * 1.10 = 33000.
    expect(replacement.ceilingAmount).toBe('33000');
  });
});

describe('BalanceService.editPending — Remarks-only mode', () => {
  function pendingStandaloneA9(service: BalanceService, lcNumber: string) {
    const lcIssue = service.createMovement({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber }, movementType: 'ISSUE', eventSeq: 91001, amount: '100000', currency: 'USD', tenorType: 'SIGHT', expiryDate: '2099-12-31', createdBy: 'maker1' });
    if (!lcIssue.created) throw new Error('expected LC issue');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber })!;
    const sgIssue = service.createMovement({ instrumentType: 'SHGT', naturalKey: { lcNumber, sgNumber: 'SG-A9' }, movementType: 'ISSUE', eventSeq: 91002, amount: '10000', currency: 'USD', parentLogicalContractId: lc.logicalContractId, createdBy: 'maker1' });
    if (!sgIssue.created) throw new Error('expected SG issue');
    service.release(sgIssue.movement.movementId, 'checker1');
    const sg = service.resolveContract('SHGT', { lcNumber, sgNumber: 'SG-A9' })!;
    const redeem = service.createMovement({ instrumentType: 'SHGT', balanceContractId: sg.balanceContractId, movementType: 'FULL_REDEEM', eventSeq: 91003, amount: '10000', currency: 'USD', createdBy: 'maker1' });
    if (!redeem.created) throw new Error('expected A9 redemption');
    return redeem.movement;
  }

  test('trims remarks, preserves all monetary/status/identity fields, and writes an audit snapshot', () => {
    const service = new BalanceService(createDb(':memory:'));
    const before = pendingStandaloneA9(service, 'FIXP-A9-001');
    const after = service.editPending(before.movementId, { amount: before.amount, editedBy: 'maker2', editMode: 'REMARKS_ONLY', remarks: '  checked docs  ' });
    expect(after).toMatchObject({ movementId: before.movementId, eventSeq: before.eventSeq, amount: before.amount, currency: before.currency, status: before.status, createdBy: before.createdBy, remarks: 'checked docs', editedBy: 'maker2' });
    const audit = service.listFixPendingAudit(before.movementId);
    expect(audit).toHaveLength(1);
    expect((audit[0]!.afterSnapshot as { remarks: string }).remarks).toBe('checked docs');
  });

  test('returns a rejected Remarks-only correction to PENDING for Checker review and audits the transition', () => {
    const service = new BalanceService(createDb(':memory:'));
    const pending = pendingStandaloneA9(service, 'FIXP-A9-REJECTED');
    const rejected = service.reject(pending.movementId, 'checker1', 'DOC_DISCREPANCY');

    const corrected = service.editPending(rejected.movementId, {
      amount: rejected.amount,
      editedBy: 'maker1',
      editMode: 'REMARKS_ONLY',
      remarks: 'documents corrected',
    });

    expect(corrected).toMatchObject({
      movementId: rejected.movementId,
      amount: rejected.amount,
      currency: rejected.currency,
      status: 'PENDING',
      remarks: 'documents corrected',
      editedBy: 'maker1',
    });
    const audit = service.listFixPendingAudit(rejected.movementId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ statusBefore: 'REJECTED' });
    expect(audit[0]!.afterSnapshot).toMatchObject({ status: 'PENDING', remarks: 'documents corrected' });
    expect(service.release(corrected.movementId, 'checker1').status).toBe('RELEASED');
  });

  test('rejects amount changes and blank remarks, and accepts any pending function', () => {
    const service = new BalanceService(createDb(':memory:'));
    const a9 = pendingStandaloneA9(service, 'FIXP-A9-002');
    expect(() => service.editPending(a9.movementId, { amount: '1', editedBy: 'maker2', editMode: 'REMARKS_ONLY', remarks: 'x' })).toThrow(RequestValidationError);
    expect(() => service.editPending(a9.movementId, { amount: a9.amount, editedBy: 'maker2', editMode: 'REMARKS_ONLY', remarks: '   ' }))
      .toThrow('Remarks is required for Remarks-only Fix Pending.');
    const issueResult = service.createMovement({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'FIXP-A9-NOT-SG' }, movementType: 'ISSUE', eventSeq: 91004, amount: '1000', currency: 'USD', tenorType: 'SIGHT', expiryDate: '2099-12-31', createdBy: 'maker1' });
    if (!issueResult.created) throw new Error('expected LC issue');
    const issue = issueResult.movement;
    const editedIssue = service.editPending(issue.movementId, { amount: issue.amount, editedBy: 'maker2', editMode: 'REMARKS_ONLY', remarks: 'issue note' });
    expect(editedIssue.remarks).toBe('issue note');
  });

  test('rejects every non-remarks business field even when its value is unchanged', () => {
    const service = new BalanceService(createDb(':memory:'));
    const movement = pendingStandaloneA9(service, 'FIXP-REMARKS-LOCKED');
    expect(() => service.editPending(movement.movementId, {
      amount: movement.amount,
      editedBy: 'maker2',
      editMode: 'REMARKS_ONLY',
      remarks: 'note',
      reasonCode: 'UNCHANGED',
    })).toThrow('Remarks-only Fix Pending may change remarks only.');
  });
});

// Phase 4 (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.5, 2026-08-28, user-
// directed "現在實作 Phase 4 compound cascade") — A3S's own documentArrivalWithSg compound Fix Pending
// cascade, exercising `BalanceService.applyArrivalWithSgCompoundEdit()`.
describe('BalanceService.editPending — Phase 4 compound cascade (A3S, documentArrivalWithSg)', () => {
  function issueSightLcWithSg(service: BalanceService, lcNumber: string, sgAmount: string) {
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '1000000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber })!;

    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber, sgNumber: `${lcNumber}-SG` },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: sgAmount,
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');
    const sg = service.resolveContract('SHGT', { lcNumber, sgNumber: `${lcNumber}-SG` })!;
    return { lc, sg };
  }

  /** Mirrors maker-submit.service.ts's own submitDocumentArrivalWithSg() — SG redeem MIN(billAmount, SG outstanding) first, then the LC's own UTILIZE, sharing one businessEventId. */
  function submitDocumentArrivalWithSg(service: BalanceService, lcBalanceContractId: string, sgBalanceContractId: string, sgOutstanding: string, billAmount: string, sourceTransactionRef: string) {
    const businessEventId = randomUUIDForTest();
    const redeemAmount = Math.min(Number(billAmount), Number(sgOutstanding));
    const sgRedeem = service.createMovement({
      instrumentType: 'SHGT',
      balanceContractId: sgBalanceContractId,
      movementType: redeemAmount >= Number(sgOutstanding) ? 'FULL_REDEEM' : 'PARTIAL_REDEEM',
      eventSeq: Date.now() + Math.random(),
      amount: String(redeemAmount),
      currency: 'USD',
      businessEventId,
      sourceTransactionRef,
      createdBy: 'maker1',
    });
    if (!sgRedeem.created) throw new Error('expected a new SG redeem movement');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lcBalanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: billAmount,
      currency: 'USD',
      businessEventId,
      sourceTransactionRef,
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new UTILIZE movement');
    return { sgRedeem: sgRedeem.movement, utilize: utilize.movement, businessEventId };
  }

  function randomUUIDForTest(): string {
    return `bev-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }

  test('Fix Pending Bill Amount downward — SG redeem recomputes MIN(newBillAmount, SG outstanding), stays PARTIAL_REDEEM, businessEventId preserved on both legs', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, sg } = issueSightLcWithSg(service, 'A3S-FIXP-001', '20000');
    const { sgRedeem, utilize, businessEventId } = submitDocumentArrivalWithSg(service, lc.balanceContractId, sg.balanceContractId, '20000', '15000', 'B01');
    expect(sgRedeem.movementType).toBe('PARTIAL_REDEEM');
    expect(sgRedeem.amount).toBe('15000');

    const corrected = service.editPending(utilize.movementId, { amount: '8000', editedBy: 'maker2' });

    expect(corrected.amount).toBe('8000');
    expect(corrected.ceilingAmount).toBe('8000'); // IPLC_LC UTILIZE — never tolerance-applicable
    expect(corrected.businessEventId).toBe(businessEventId); // regression: was silently nulled before the 2026-08-28 buildEditedRequest() fix
    expect(corrected.movementId).toBe(utilize.movementId); // same identity — an in-place correction, not a replacement

    const linked = service.findByBusinessEventId(businessEventId);
    expect(linked).toHaveLength(2); // still exactly two live legs — no stray extra row
    const newSg = linked.find((m) => m.movementType === 'FULL_REDEEM' || m.movementType === 'PARTIAL_REDEEM')!;
    expect(newSg.movementId).toBe(sgRedeem.movementId); // same identity on the SG leg too
    expect(newSg.status).toBe('PENDING');
    expect(newSg.movementType).toBe('PARTIAL_REDEEM');
    expect(newSg.amount).toBe('8000'); // MIN(8000, 20000)
    expect(newSg.businessEventId).toBe(businessEventId);

    // Both legs each get their own fix_pending_audit row preserving the pre-edit content.
    const sgAudit = service.listFixPendingAudit(sgRedeem.movementId);
    expect(sgAudit).toHaveLength(1);
    expect((sgAudit[0]!.beforeSnapshot as { amount: string }).amount).toBe('15000');
    const utilizeAudit = service.listFixPendingAudit(utilize.movementId);
    expect(utilizeAudit).toHaveLength(1);
    expect((utilizeAudit[0]!.beforeSnapshot as { amount: string }).amount).toBe('15000'); // the original Bill Amount
  });

  test('Fix Pending Bill Amount upward past the SG\'s own outstanding — SG redeem flips PARTIAL_REDEEM to FULL_REDEEM, capped at SG outstanding', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, sg } = issueSightLcWithSg(service, 'A3S-FIXP-002', '20000');
    const { utilize, businessEventId } = submitDocumentArrivalWithSg(service, lc.balanceContractId, sg.balanceContractId, '20000', '15000', 'B01');

    const replacement = service.editPending(utilize.movementId, { amount: '25000', editedBy: 'maker2' });

    expect(replacement.amount).toBe('25000'); // the LC's own UTILIZE is NOT capped by the SG's outstanding
    const linked = service.findByBusinessEventId(businessEventId);
    const newSg = linked.find((m) => m.status === 'PENDING' && (m.movementType === 'FULL_REDEEM' || m.movementType === 'PARTIAL_REDEEM'))!;
    expect(newSg.movementType).toBe('FULL_REDEEM');
    expect(newSg.amount).toBe('20000'); // MIN(25000, 20000) — capped at the SG's own outstanding
  });

  test('Fix Pending rejected — the corrected Bill Amount would need more SG capacity than currently Available (netting an unrelated still-PENDING redemption on the same SG)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, sg } = issueSightLcWithSg(service, 'A3S-FIXP-003', '20000');
    const { utilize } = submitDocumentArrivalWithSg(service, lc.balanceContractId, sg.balanceContractId, '20000', '5000', 'B01');
    // An unrelated, independent standalone A9-shaped PENDING redemption already reserves 10,000 of the
    // same SG's own capacity — Available (excluding the old A3S redemption itself) is 20000 - 10000 = 10000.
    const unrelated = service.createMovement({
      instrumentType: 'SHGT',
      balanceContractId: sg.balanceContractId,
      movementType: 'FULL_REDEEM',
      eventSeq: Date.now() + Math.random(),
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!unrelated.created) throw new Error('expected a new movement');

    expect(() => service.editPending(utilize.movementId, { amount: '18000', editedBy: 'maker2' })).toThrow(InsufficientBalanceError);

    // Rejected atomically — neither the UTILIZE nor the SG redemption's own PENDING record was touched.
    const utilizeRefetched = service.listMovements(lc.balanceContractId).find((m) => m.movementId === utilize.movementId)!;
    expect(utilizeRefetched.status).toBe('PENDING');
    expect(utilizeRefetched.amount).toBe('5000');
  });

  test('Fix Pending on a compound UTILIZE whose SG sibling is no longer PENDING (already Approved/Released) is rejected, not silently mis-edited', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, sg } = issueSightLcWithSg(service, 'A3S-FIXP-004', '20000');
    const { sgRedeem, utilize } = submitDocumentArrivalWithSg(service, lc.balanceContractId, sg.balanceContractId, '20000', '20000', 'B01');
    service.release(sgRedeem.movementId, 'checker1'); // A3S's own Checker Release genuinely releases the SG leg for real, while the LC's own UTILIZE stays PENDING (acknowledgment-only)

    expect(() => service.editPending(utilize.movementId, { amount: '12000', editedBy: 'maker2' })).toThrow(RequestValidationError);
  });

  test('a plain, non-compound A3 UTILIZE (no businessEventId) is completely unaffected by the compound-detection branch', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'A3S-FIXP-005' },
      movementType: 'ISSUE',
      eventSeq: Date.now() + Math.random(),
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const plainUtilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lcIssue.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: Date.now() + Math.random(),
      amount: '30000',
      currency: 'USD',
      sourceTransactionRef: 'B01',
      createdBy: 'maker1',
    });
    if (!plainUtilize.created) throw new Error('expected a new movement');

    const replacement = service.editPending(plainUtilize.movement.movementId, { amount: '35000', editedBy: 'maker2' });

    expect(replacement.amount).toBe('35000');
    expect(replacement.businessEventId).toBeNull();
  });

  test('the defensive "no BalanceContract owning the linked SG redemption" branch throws NotFoundError — same posture as the single-movement path\'s own equivalent check, unreachable via the public API since a movement always has a real owning contract by FK construction', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, sg } = issueSightLcWithSg(service, 'A3S-FIXP-007', '20000');
    const { utilize } = submitDocumentArrivalWithSg(service, lc.balanceContractId, sg.balanceContractId, '20000', '15000', 'B01');

    // First findById() call (in editPending()'s own preamble) resolves the LC contract normally; the
    // SECOND (inside applyArrivalWithSgCompoundEdit(), looking up the linked SG's own contract) fails.
    const contractSpy = jest.spyOn(BalanceContractStore.prototype, 'findById').mockReturnValueOnce(lc).mockReturnValueOnce(undefined);
    try {
      expect(() => service.editPending(utilize.movementId, { amount: '8000', editedBy: 'maker2' })).toThrow(NotFoundError);
    } finally {
      contractSpy.mockRestore();
    }
  });

  test('a failure correcting the SG leg rolls back the WHOLE compound transaction — the UTILIZE leg (corrected second) is left completely untouched, and no audit row from either leg survives', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, sg } = issueSightLcWithSg(service, 'A3S-FIXP-006', '20000');
    const { sgRedeem, utilize } = submitDocumentArrivalWithSg(service, lc.balanceContractId, sg.balanceContractId, '20000', '15000', 'B01');

    const correctionSpy = jest.spyOn(BalanceMovementStore.prototype, 'applyFixPendingCorrection').mockImplementationOnce(() => {
      throw new Error('simulated SG leg correction failure, mid-transaction');
    });
    try {
      expect(() => service.editPending(utilize.movementId, { amount: '8000', editedBy: 'maker2' })).toThrow('simulated SG leg correction failure');
    } finally {
      correctionSpy.mockRestore();
    }

    // Rolled back atomically — the UTILIZE itself was never even reached (SG leg corrected first).
    const utilizeRefetched = service.listMovements(lc.balanceContractId).find((m) => m.movementId === utilize.movementId)!;
    expect(utilizeRefetched.status).toBe('PENDING');
    expect(utilizeRefetched.amount).toBe('15000'); // the original Bill Amount
    const sgRefetched = service.listMovements(sg.balanceContractId).find((m) => m.movementId === sgRedeem.movementId)!;
    expect(sgRefetched.amount).toBe('15000');
    expect(service.listFixPendingAudit(utilize.movementId)).toHaveLength(0);
    expect(service.listFixPendingAudit(sgRedeem.movementId)).toHaveLength(0);
  });
});

describe('BalanceService — Transaction Index eligibility is enforced at API submit', () => {
  test('rejects B4 when the referenced Present Docs record is not RELEASED', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'INDEX-B4-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SIGHT',
      expiryDate: '2099-12-31',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new Confirmation');
    service.release(issue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'INDEX-B4-001' });
    if (!confirmation) throw new Error('expected the Confirmation to resolve');

    const presentDocs = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'INDEX-B4-001', ibNumber: 'E01' },
      parentLogicalContractId: confirmation.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!presentDocs.created) throw new Error('expected Present Docs');

    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'HONOUR',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'E01',
        referencedTransactionId: presentDocs.movement.movementId,
        createdBy: 'maker1',
      }),
    ).toThrow(/not eligible for B4/);
  });
});
