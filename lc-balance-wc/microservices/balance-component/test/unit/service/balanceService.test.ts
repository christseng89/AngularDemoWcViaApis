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
import { IllegalStateTransitionError } from '../../../src/errors';

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

    // release() here is B4's own real finalization/consumption of the presentation — genuinely
    // different from B3's own acknowledge() (which never touches status). 2026-08-18 ("SAME AS EXPORT
    // CONFIRMED LC... 不應該因為後續交易而改變" — superseding this test's own prior "release() clears it
    // to 0" expectation): B3's own rootEventSnapshot must stay frozen at whatever createMovement()
    // captured (B3's own transaction time), unaffected by B4's own later release() — the isPresentDocsFinalize
    // fix in release() now leaves it untouched instead of recomputing/clearing it.
    const examReleased = service.release(examCreate.movement.movementId, 'checker1');
    expect(examReleased.rootEventSnapshot).toEqual(examCreate.movement.rootEventSnapshot);
    expect(examReleased.rootEventSnapshot!.presentDocsEarmarkPending).toBe('40000');
    expect(examReleased.rootEventSnapshot!.presentDocsEarmarkApproved).toBe('0');
  });

  test('EPLC_EXAMINATION rootEventSnapshot correctly shows Approved (not Pending) after B3 acknowledge()', () => {
    const service = new BalanceService(createDb(':memory:'));
    const cnfIssue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'EVSNAP-008' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!cnfIssue.created) throw new Error('expected a new movement');
    service.release(cnfIssue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'EVSNAP-008' });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');

    const examCreate = service.createMovement({
      instrumentType: 'EPLC_EXAMINATION',
      naturalKey: { lcNumber: 'EVSNAP-008', ibNumber: 'EB01' },
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '40000',
      currency: 'USD',
      parentLogicalContractId: confirmation.logicalContractId,
      createdBy: 'maker1',
    });
    if (!examCreate.created) throw new Error('expected a new movement');

    service.acknowledge(examCreate.movement.movementId, 'checker1');
    // acknowledge() itself doesn't touch rootEventSnapshot (out of scope, not a create/release
    // transition) — a fresh live query against the PARENT Confirmation's own contract independently
    // proves the Approved bucket now correctly reflects the acknowledgment.
    const acknowledgedParent = service.getBalanceSnapshot(confirmation.balanceContractId);
    expect(acknowledgedParent.presentDocsEarmarkApproved).toBe('40000');

    // 2026-08-18 ("SAME AS EXPORT CONFIRMED LC") — B3's own rootEventSnapshot stays frozen at its own
    // Create-time value (Pending 40000/Approved 0) even after acknowledge() AND release() — neither
    // touches it; superseding this test's own prior "release() clears it to 0" expectation.
    const examReleased = service.release(examCreate.movement.movementId, 'checker1');
    expect(examReleased.rootEventSnapshot).toEqual(examCreate.movement.rootEventSnapshot);
    expect(examReleased.rootEventSnapshot!.presentDocsEarmarkPending).toBe('40000');
    expect(examReleased.rootEventSnapshot!.presentDocsEarmarkApproved).toBe('0');
  });

  // 2026-08-18, business instruction ("SAME AS EXPORT CONFIRMED LC — Confirmed LC Balance and Acceptance
  // Balance snapshots must not change due to a later transaction") — the Export-side
  // analog of the S01/SG case: B3's own Present Docs earmark is submitted BEFORE any Acceptance exists
  // under a Usance Confirmed LC; its own acceptanceEventSnapshot must stay null (correctly reflecting
  // "no Acceptance yet"), even after an Acceptance is later created AND B4's own compound release
  // finalizes B3's own record for real.
  test("B3's own acceptanceEventSnapshot stays frozen (null — no Acceptance existed yet) even after an Acceptance is later created and B4 finalizes B3's own record", () => {
    const service = new BalanceService(createDb(':memory:'));
    const cnfIssue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'EVSNAP-B3ACC' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      tenorType: 'SELLERS_USANCE',
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

    // B4 finalizes B3's own record for real, hours "later" — this must NOT retroactively populate B3's
    // own acceptanceEventSnapshot with the Acceptance that didn't exist at B3's own transaction time.
    const examReleased = service.release(examCreate.movement.movementId, 'checker1');
    expect(examReleased.acceptanceEventSnapshot).toBeNull();
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

    // Releasing re-captures it too (still exactly one SG, still 12345).
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
