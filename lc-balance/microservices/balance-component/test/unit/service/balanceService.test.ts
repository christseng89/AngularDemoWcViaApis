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
import { CurrencyMismatchError, IllegalStateTransitionError, NaturalKeyAlreadyExistsError, RequestValidationError } from '../../../src/errors';
import { DeletePendingAuditStore } from '../../../src/store/deletePendingAuditStore';
import { BalanceMovementStore } from '../../../src/store/balanceMovementStore';

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

    expect(page.total).toBe(2); // pending + rejectedSource; releasedSource (RELEASED) excluded by the default status set
    const movementIds = page.items.map((r) => r.movement.movementId);
    expect(movementIds).toContain(pending.movementId);
    expect(movementIds).toContain(rejectedSource.movementId);
    expect(movementIds).not.toContain(releasedSource.movementId);
    const rejectedRow = page.items.find((r) => r.movement.movementId === rejectedSource.movementId)!;
    expect(rejectedRow.movement.status).toBe('REJECTED');
    expect(rejectedRow.contract.naturalKey.lcNumber).toBe('MYMV-003');
  });

  test('respects an explicit statuses filter, page, and pageSize', () => {
    const service = new BalanceService(createDb(':memory:'));
    const pending = issue(service, 'MYMV-010', 'maker3');
    const rejectedSource = issue(service, 'MYMV-011', 'maker3');
    service.reject(rejectedSource.movementId, 'checker1', 'MANUAL_TEST_REJECT');

    const pendingOnly = service.listMyMovements({ createdBy: 'maker3', statuses: ['PENDING'] });
    expect(pendingOnly.total).toBe(1);
    expect(pendingOnly.items[0]!.movement.movementId).toBe(pending.movementId);

    const page1 = service.listMyMovements({ createdBy: 'maker3', page: 1, pageSize: 1 });
    expect(page1.total).toBe(2);
    expect(page1.items).toHaveLength(1);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(1);
    const page2 = service.listMyMovements({ createdBy: 'maker3', page: 2, pageSize: 1 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.movement.movementId).not.toBe(page1.items[0]!.movement.movementId);
  });

  test('returns an empty page (not an error) for a createdBy with nothing PENDING/REJECTED', () => {
    const service = new BalanceService(createDb(':memory:'));
    const page = service.listMyMovements({ createdBy: 'nobody-has-submitted-anything' });
    expect(page).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
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
    expect(page.total).toBe(0);
  });

  test('once Maker-Submitted into A4, the SAME row reappears (genuinely actionable PENDING again)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const utilize = issueSightLcAndUtilize(service, 'MQ-EARMARK-3', 'maker1');
    service.acknowledgeArrival(utilize.movementId, 'checker1');
    service.submitByMaker(utilize.movementId, 'maker1');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).toContain(utilize.movementId);
    expect(page.total).toBe(1);
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

  test('total/pagination stay consistent with the exclusion (no off-by-one from a naive client-side filter)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const earmarking = issueSightLcAndUtilize(service, 'MQ-EARMARK-5', 'maker9');
    const earmarked = issueSightLcAndUtilize(service, 'MQ-EARMARK-6', 'maker9');
    service.acknowledgeArrival(earmarked.movementId, 'checker1');

    const page = service.listMyMovements({ createdBy: 'maker9', page: 1, pageSize: 10 });

    expect(page.total).toBe(1);
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

  test('before A6 exists, the referenced UTILIZE alone appears once it is Maker-Submitted (e.g. via direct API)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { utilize } = issueUsanceLcAndUtilize(service, 'MQ-A6-DUP-1', 'maker1');
    service.submitByMaker(utilize.movementId, 'maker1');

    const page = service.listMyMovements({ createdBy: 'maker1' });

    expect(page.items.map((r) => r.movement.movementId)).toEqual([utilize.movementId]);
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
    expect(page.total).toBe(1);
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

  test('a referencedTransactionId pointing at a movement that no longer resolves (raw API edge case) is a silent no-op, never a throw', () => {
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
    const acceptance = service.createMovement({
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
    });
    if (!acceptance.created) throw new Error('expected a new movement');

    expect(() => service.cancel(acceptance.movement.movementId, 'maker1', 'MAKER_EC')).not.toThrow();
  });

  test('a referencedTransactionId pointing at a movement whose own shape doesn\'t match A6\'s cascade (e.g. movementType !== UTILIZE, or already not makerSubmitted) is unaffected — each `&&` guard clause independently no-ops', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { lc, utilize } = issueUsanceLcAndUtilize(service, 'CANCEL-A6-REVERT-5', 'maker1');
    // Points at the LC's own ISSUE (RELEASED, movementType 'ISSUE') instead of the UTILIZE — a raw API
    // caller's referencedTransactionId is never validated against a real A6 cascade shape.
    const issueMovement = service.listMovements(lc.balanceContractId).find((m) => m.movementType === 'ISSUE')!;
    const bogusReferencing = service.createMovement({
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
    });
    if (!bogusReferencing.created) throw new Error('expected a new movement');

    expect(() => service.cancel(bogusReferencing.movement.movementId, 'maker1', 'MAKER_EC')).not.toThrow();
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
