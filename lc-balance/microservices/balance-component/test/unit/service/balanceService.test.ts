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
import { CurrencyMismatchError, IllegalStateTransitionError } from '../../../src/errors';

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

  test("releasing A6's own linked Acceptance CREATE (referencedTransactionId -> an IPLC_LC/UTILIZE, Import side) never triggers the B3-consume side effect — scoped to EPLC_EXAMINATION only", () => {
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
    service.release(arrival.movement.movementId, 'checker1');

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

    // Must not throw and must not attempt to touch the (already-RELEASED, plain IPLC_LC/UTILIZE)
    // referenced movement's own presentDocsConsumedAt — it isn't an EPLC_EXAMINATION/CREATE at all, so
    // the auto-consume side effect's own type/instrumentType guard must correctly skip it.
    expect(() => service.release(acceptance.movement.movementId, 'checker1')).not.toThrow();
  });
});
