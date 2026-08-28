/**
 * F1 (external BA review) §8/§9 — Expiry Extension Amendment (AMEND_EXPIRY_DATE against an EXPIRED
 * contract) and A11/B7 Reopen (REOPEN against a CLOSED contract) end-to-end BalanceService coverage.
 * Same convention as closeFunction.test.ts/autoExpirySweep.test.ts — a real in-memory DB, no mocking.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { IllegalStateTransitionError, InsufficientBalanceError, RequestValidationError } from '../../../src/errors';
import { BATCH_CHECKER_ACTOR, BATCH_MAKER_ACTOR } from '../../../src/config';
import type { TenorType } from '../../../src/types';

function issueImportLc(service: BalanceService, lcNumber: string, opts: { amount?: string; expiryDate?: string; mailFloatGraceDays?: number; tenorType?: TenorType } = {}) {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: opts.amount ?? '10000',
    currency: 'USD',
    expiryDate: opts.expiryDate,
    mailFloatGraceDays: opts.mailFloatGraceDays,
    tenorType: opts.tenorType ?? 'SIGHT',
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

function submitAmendExpiryDate(service: BalanceService, balanceContractId: string, eventSeq: number, newExpiryDate: string, businessDate?: string) {
  return service.createMovement({
    instrumentType: 'IPLC_LC',
    balanceContractId,
    movementType: 'AMEND_EXPIRY_DATE',
    eventSeq,
    amount: '0',
    currency: 'USD',
    newExpiryDate,
    businessDate,
    sourceTransactionRef: `AMEND-EXPIRY-DATE-${eventSeq}`,
    createdBy: 'maker1',
  });
}

describe('AMEND_EXPIRY_DATE — plain amendment against an ACTIVE contract', () => {
  test('happy path: updates expiryDate, no status change, no REVERSAL created', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMEND-EXP-001', { expiryDate: '2026-06-01' });

    const amend = submitAmendExpiryDate(service, lc.balanceContractId, 2, '2026-12-31', '2026-01-01');
    if (!amend.created) throw new Error('expected a new movement');
    const released = service.release(amend.movement.movementId, 'checker1');
    expect(released.status).toBe('RELEASED');

    const reloaded = service.resolveContract('IPLC_LC', { lcNumber: 'AMEND-EXP-001' });
    expect(reloaded?.status).toBe('ACTIVE');
    expect(reloaded?.expiryDate).toBe('2026-12-31');
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000'); // untouched
  });

  test('rejects a missing newExpiryDate', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMEND-EXP-002', { expiryDate: '2026-06-01' });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'AMEND_EXPIRY_DATE',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        sourceTransactionRef: 'AMEND-EXP-002-AMEND-1',
        createdBy: 'maker1',
      }),
    ).toThrow(/newExpiryDate is required/);
  });

  test('rejects a newExpiryDate not strictly later than the Business Date', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMEND-EXP-003', { expiryDate: '2026-06-01' });
    expect(() => submitAmendExpiryDate(service, lc.balanceContractId, 2, '2026-01-01', '2026-06-01')).toThrow(
      /must be strictly later than the Business Date/,
    );
  });

  test('rejects a non-zero amount', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMEND-EXP-004', { expiryDate: '2026-06-01' });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'AMEND_EXPIRY_DATE',
        eventSeq: 2,
        amount: '1',
        currency: 'USD',
        newExpiryDate: '2026-12-31',
        sourceTransactionRef: 'AMEND-EXP-004-AMEND-1',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
  });
});

describe('AMEND_EXPIRY_DATE / REOPEN — natural-key resolution against a non-ACTIVE contract (F1 §8.6/§9.6)', () => {
  test('AMEND_EXPIRY_DATE resolves an EXPIRED contract by naturalKey (not just balanceContractId)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'NK-EXT-001', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    service.runAutoExpirySweep(new Date('2026-01-08'));
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'NK-EXT-001' }, true)?.status).toBe('EXPIRED');

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'NK-EXT-001' },
      movementType: 'AMEND_EXPIRY_DATE',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      newExpiryDate: '2027-01-01',
      businessDate: '2026-01-15',
      sourceTransactionRef: 'NK-EXT-001-AMEND-1',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.balanceContractId).toBe(lc.balanceContractId);
    service.release(amend.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'NK-EXT-001' })?.status).toBe('ACTIVE');
  });

  test('REOPEN resolves a CLOSED contract by naturalKey (not just balanceContractId)', () => {
    const service = new BalanceService(createDb(':memory:'));
    // expiryDate deliberately in the future — reactivates straight to ACTIVE (see the dedicated
    // "reactivates straight to ACTIVE"/"path B... -> EXPIRED" tests above for the branching itself;
    // this test's own purpose is only the naturalKey resolution path).
    const lc = issueImportLc(service, 'NK-REOPEN-001', { expiryDate: '2099-01-01' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'NK-REOPEN-001' }, true)?.status).toBe('CLOSED');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'NK-REOPEN-001' },
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    expect(reopen.movement.balanceContractId).toBe(lc.balanceContractId);
    service.release(reopen.movement.movementId, 'checker2');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'NK-REOPEN-001' })?.status).toBe('ACTIVE');
  });

  test('naturalKey resolution for AMEND_EXPIRY_DATE/REOPEN never matches an ACTIVE contract under a DIFFERENT logical contract of the same LC number (only the currently non-ACTIVE version)', () => {
    const service = new BalanceService(createDb(':memory:'));
    issueImportLc(service, 'NK-002', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    // No EXPIRED/CLOSED version exists yet — the plain ACTIVE-amendment path should be used instead,
    // proving findExpiredByNaturalKey()/findClosedByNaturalKey() are NOT consulted when the ACTIVE
    // resolver already found something (avoids ever attempting the fallback needlessly).
    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'NK-002' },
      movementType: 'AMEND_EXPIRY_DATE',
      eventSeq: 2,
      amount: '0',
      currency: 'USD',
      newExpiryDate: '2026-12-31',
      businessDate: '2026-01-01',
      sourceTransactionRef: 'NK-002-AMEND-1',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    service.release(amend.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'NK-002' })?.status).toBe('ACTIVE');
  });
});

describe('Expiry Extension Amendment — AMEND_EXPIRY_DATE against an EXPIRED contract (F1 §8)', () => {
  function expireLc(service: BalanceService, lcNumber: string) {
    const lc = issueImportLc(service, lcNumber, { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    const results = service.runAutoExpirySweep(new Date('2026-01-08'));
    expect(results).toContainEqual({ balanceContractId: lc.balanceContractId, ok: true });
    return service.resolveContract('IPLC_LC', { lcNumber }, true)!;
  }

  test('happy path: reverses the EXPIRE, restores Confirmed Balance, reactivates to ACTIVE with the new expiryDate', () => {
    const service = new BalanceService(createDb(':memory:'));
    const expired = expireLc(service, 'EXT-001');
    expect(expired.status).toBe('EXPIRED');
    expect(service.getBalanceSnapshot(expired.balanceContractId).confirmedBalance).toBe('0');

    const amend = submitAmendExpiryDate(service, expired.balanceContractId, 3, '2027-01-01', '2026-01-15');
    if (!amend.created) throw new Error('expected a new movement');
    service.release(amend.movement.movementId, 'checker1');

    const reactivated = service.resolveContract('IPLC_LC', { lcNumber: 'EXT-001' });
    expect(reactivated?.status).toBe('ACTIVE');
    expect(reactivated?.expiryDate).toBe('2027-01-01');
    expect(service.getBalanceSnapshot(expired.balanceContractId).confirmedBalance).toBe('10000');

    // The REVERSAL leg exists, points at the EXPIRE it reverses, and shares a businessEventId with the Extension.
    const movements = service.listMovements(expired.balanceContractId);
    const expireMovement = movements.find((m) => m.movementType === 'EXPIRE')!;
    const reversal = movements.find((m) => m.movementType === 'REVERSAL')!;
    expect(reversal.reversalOfMovementId).toBe(expireMovement.movementId);
    expect(reversal.status).toBe('RELEASED');
    expect(reversal.businessEventId).toBe(amend.movement.movementId);
    expect(reversal.ceilingAmount).toBe(expireMovement.ceilingAmount);
  });

  test('rejects Submit when there is an open (PENDING) Event anywhere in the tree — a second, concurrent Extension Submit sees the first Extension itself as an open Event', () => {
    const service = new BalanceService(createDb(':memory:'));
    const expired = expireLc(service, 'EXT-002');
    // §7.8 blocks a new SG/Document Arrival etc. against a non-ACTIVE parent, so the only realistic way
    // an EXPIRED contract gains a PENDING child event is a second, concurrent Extension Amendment
    // Submit seeing the first one's own still-PENDING record (same reasoning as the analogous REOPEN
    // concurrency test below).
    const first = submitAmendExpiryDate(service, expired.balanceContractId, 3, '2027-01-01', '2026-01-15');
    if (!first.created) throw new Error('expected a new movement');

    expect(() => submitAmendExpiryDate(service, expired.balanceContractId, 4, '2027-06-01', '2026-01-15')).toThrow(
      /not yet fully resolved/,
    );
  });

  test('rejects a contract that is neither ACTIVE nor EXPIRED (e.g. CLOSED)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const expired = expireLc(service, 'EXT-003');
    // Manual A10 Close (not the AUTO CLOSE sweep, which since F1 §13.5 also gates on the Auto Close Grace
    // Period off effectiveTo — irrelevant to this test's own concern, which is only getting the contract
    // to a genuine CLOSED status to exercise Extension Amendment's own status-eligibility rejection).
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: expired.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 3,
      amount: '0', // Confirmed Balance is already 0 after the EXPIRE write-off.
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');
    const closed = service.resolveContract('IPLC_LC', { lcNumber: 'EXT-003' }, true)!;
    expect(closed.status).toBe('CLOSED');

    expect(() => submitAmendExpiryDate(service, expired.balanceContractId, 4, '2027-01-01', '2026-01-15')).toThrow(
      /only ACTIVE or EXPIRED contracts are eligible/,
    );
  });

  test('Release re-checks eligibility against the THEN-current state — a concurrent Reject/re-open path is out of scope here, but re-verifies newExpiryDate is still in the future relative to the release date', () => {
    const service = new BalanceService(createDb(':memory:'));
    const expired = expireLc(service, 'EXT-004');
    // Submit is valid (newExpiryDate is after the supplied businessDate), but release() re-checks
    // against its OWN releasedAt (this.now()), which for a real clock is always "now" — this test
    // instead exercises the missing-newExpiryDate defensive branch directly.
    const amend = submitAmendExpiryDate(service, expired.balanceContractId, 3, '2099-01-01', '2026-01-15');
    if (!amend.created) throw new Error('expected a new movement');
    expect(() => service.release(amend.movement.movementId, 'checker1')).not.toThrow();
  });
});

describe('A11/B7 Reopen — REOPEN against a CLOSED contract (F1 §9)', () => {
  test('path A (direct CLOSE, never EXPIRED): reverses the single CLOSE, restores the balance, reactivates ACTIVE (expiry still in the future)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-A-001', { expiryDate: '2099-01-01' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-A-001' }, true)?.status).toBe('CLOSED');

    // F1, redesigned 2026-08-25 (see domain/reopenRestoration.ts) — REOPEN's own `amount` is never
    // caller-typed; the server overwrites whatever is submitted here with the computed restore-chain
    // total, so this '0' is deliberately irrelevant to the outcome (see the "server overrides whatever
    // amount is submitted" test below for direct proof of that).
    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    expect(reopen.movement.ceilingAmount).toBe('10000'); // computed at Submit — the single CLOSE's own write-off amount.
    expect(reopen.movement.contingentAccountEntry).not.toBeNull(); // a real Dr/Cr pair, visible to the Checker BEFORE approving — no more PENDING-with-nothing-to-review.
    service.release(reopen.movement.movementId, BATCH_CHECKER_ACTOR);

    const reactivated = service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-A-001' });
    expect(reactivated?.status).toBe('ACTIVE');
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000');

    // No separate REVERSAL leg any more — REOPEN itself carries the restoration, one movement total.
    const movements = service.listMovements(lc.balanceContractId);
    expect(movements.filter((m) => m.movementType === 'REVERSAL')).toHaveLength(0);
    expect(movements).toHaveLength(3); // ISSUE, CLOSE, REOPEN — nothing else.

    // Bug fix (reviewer-reported 2026-08-26) — release() used to silently null out reason_code for BOTH
    // movements (a plain SQL overwrite in updateStatus(), unlike the COALESCE every snapshot column
    // already used) — the CLOSE's own reasonCode as well as the REOPEN's own, each erased the moment its
    // own Release happened. See balanceMovementStore.ts's own updateStatus() doc comment.
    expect(movements.find((m) => m.movementType === 'CLOSE')?.reasonCode).toBe('TEST_CLOSE_REASON');
    expect(movements.find((m) => m.movementType === 'REOPEN')?.reasonCode).toBe('TEST_REOPEN_REASON');
  });

  // User-directed 2026-08-28 ("A10 and A11 if Tight Available Balance = 0 then no entries should be
  // generated. Refer to S01 for Import") — the real S01 shape (fully UTILIZE'd to Confirmed Balance 0,
  // then Closed) reproduced end to end: the CLOSE's own ceilingAmount is 0 (nothing left to write off),
  // so computeReopenRestoreAmount()'s own trailing-run sum is ALSO 0 — a legitimate REOPEN with nothing
  // to restore. deriveContingentAccountEntry() now returns null for this case too, same as the analogous
  // zero-amount CLOSE case in closeFunction.test.ts.
  test('restore-chain total is genuinely 0 (LC fully utilized before Close, S01-shaped) — no contingentAccountEntry is generated on either the CLOSE or the REOPEN', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-ZERO-001', { expiryDate: '2099-01-01' });
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      sourceTransactionRef: 'B01',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.submitByMaker(utilize.movement.movementId, 'maker1'); // BAL-123 — Sight-tenor UTILIZE requires Maker Submit before Release
    service.release(utilize.movement.movementId, 'checker1');
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('0');

    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    expect(close.movement.contingentAccountEntry).toBeNull();
    service.release(close.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-ZERO-001' }, true)?.status).toBe('CLOSED');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 4,
      amount: '0',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    expect(reopen.movement.ceilingAmount).toBe('0');
    expect(reopen.movement.contingentAccountEntry).toBeNull();
    const released = service.release(reopen.movement.movementId, BATCH_CHECKER_ACTOR);
    expect(released.status).toBe('RELEASED');
    expect(released.contingentAccountEntry).toBeNull();
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-ZERO-001' })?.status).toBe('ACTIVE');
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('0');
  });

  // Same root cause/fix as closeFunction.test.ts's own "Fix Pending on a still-PENDING CLOSE movement
  // itself" regression (2026-08-28) — reopenShaped's own gatherEventTree() call re-queries the DB rather
  // than reading ctx.existingMovements, so it always saw the very PENDING REOPEN movement being edited as
  // an "open event" and self-rejected every Fix Pending Save for A11/B7 too.
  test('Fix Pending on a still-PENDING REOPEN movement itself does not self-reject via the "open Events" eligibility scan', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-FIXPENDING-001', { expiryDate: '2099-01-01' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'ORIGINAL_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');

    const replacement = service.editPending(reopen.movement.movementId, { amount: reopen.movement.amount, reasonCode: 'CORRECTED_REOPEN_REASON', editedBy: 'maker1' });
    expect(replacement.status).toBe('PENDING');
    expect(replacement.reasonCode).toBe('CORRECTED_REOPEN_REASON');
    expect(replacement.ceilingAmount).toBe('10000'); // re-derived from the same restore-chain computation, unaffected by the edit

    const released = service.release(replacement.movementId, 'checker1');
    expect(released.status).toBe('RELEASED');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-FIXPENDING-001' })?.status).toBe('ACTIVE');
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000');
  });

  test('path B (EXPIRE then AUTO CLOSE — §9.7 chain reversal): reverses BOTH the EXPIRE and the CLOSE, restores the ORIGINAL balance (not 0)', () => {
    // Fixed now() so the EXPIRE's own effectiveTo (F1 §13.5 Auto Close Grace Period anchor) is
    // deterministic — the AUTO CLOSE sweep below is called well past its 2-business-day grace window.
    const service = new BalanceService(createDb(':memory:'), () => '2026-01-08T00:00:00Z');
    const lc = issueImportLc(service, 'REOPEN-B-001', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    const asOf = new Date('2026-01-08');
    service.runAutoExpirySweep(asOf);
    service.runAutoCloseSweep(new Date('2026-01-18'));
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-B-001' }, true)?.status).toBe('CLOSED');

    const movementsBefore = service.listMovements(lc.balanceContractId);
    const expireMovement = movementsBefore.find((m) => m.movementType === 'EXPIRE')!;
    const closeMovement = movementsBefore.find((m) => m.movementType === 'CLOSE')!;
    expect(expireMovement.ceilingAmount).toBe('10000'); // EXPIRE carried the real balance
    expect(closeMovement.ceilingAmount).toBe('0'); // AUTO CLOSE's own amount was already 0 by then

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 4,
      amount: '0',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    // The whole point of §9.7: only the last CLOSE (amount 0) is directly reflected on the contract —
    // computeReopenRestoreAmount() must sum the FULL trailing EXPIRE+CLOSE run (10000 + 0), not just
    // the last movement, or this would restore 0 instead of the real original balance.
    expect(reopen.movement.ceilingAmount).toBe('10000');
    service.release(reopen.movement.movementId, BATCH_CHECKER_ACTOR);

    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000');

    // No separate REVERSAL leg(s) any more — REOPEN itself carries the FULL restoration as its own
    // single signed amount, one movement total for the whole chain reversal.
    const movementsAfter = service.listMovements(lc.balanceContractId);
    expect(movementsAfter.filter((m) => m.movementType === 'REVERSAL')).toHaveLength(0);

    // Original expiryDate (2025-12-30) is well in the past relative to the release date -> EXPIRED, not ACTIVE.
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-B-001' }, true)?.status).toBe('EXPIRED');
  });

  test('reactivates straight to ACTIVE when the original expiryDate is still in the future', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-002', { expiryDate: '2099-01-01' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    service.release(reopen.movement.movementId, 'checker2');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-002' })?.status).toBe('ACTIVE');
  });

  test('rejects Submit on a non-root instrumentType', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-003', { expiryDate: '2099-12-31' });
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'REOPEN-003', sgNumber: 'SG01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 2,
      amount: '1000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');
    const sg = service.resolveContract('SHGT', { lcNumber: 'REOPEN-003', sgNumber: 'SG01' })!;

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        balanceContractId: sg.balanceContractId,
        movementType: 'REOPEN',
        eventSeq: 3, // 2 is already taken by the SG's own ISSUE above (same balanceContractId) — must differ.
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_REOPEN_REASON',
      }),
    ).toThrow(/Reopen only applies to a root LC\/Confirmation/);
  });

  test('rejects Submit on a contract that is not CLOSED', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-004', { expiryDate: '2099-12-31' });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REOPEN',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_REOPEN_REASON',
      }),
    ).toThrow(/current status is ACTIVE, not CLOSED/);
  });

  test('F1 proposal §13.1 item 3(a) (BA-ratified 2026-08-25): rejects a Submit with no reasonCode, even against an otherwise-eligible CLOSED contract', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-REASONCODE-001', { expiryDate: '2099-01-01' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'REOPEN-REASONCODE-001' }, true)?.status).toBe('CLOSED');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REOPEN',
        eventSeq: 3,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
        // reasonCode deliberately omitted.
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REOPEN',
        eventSeq: 3,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: null,
      }),
    ).toThrow(/reasonCode is required for REOPEN/);
  });

  test('rejects Submit with an open (PENDING) Event anywhere in the tree — a second, concurrent REOPEN Submit sees the first REOPEN itself as an open Event', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-005', { expiryDate: '2099-12-31' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    // First REOPEN Submit — stays PENDING (never released in this test).
    service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });

    // A second, concurrent REOPEN Submit must see the first one's own still-PENDING record as an open
    // Event and be rejected — this is the realistic scenario §9.8 guards against (a CLOSED contract can
    // never gain a PENDING child event any other way, since §7.8's ACTIVE-only resolution blocks every
    // other function from touching it while CLOSED).
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REOPEN',
        eventSeq: 4,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_REOPEN_REASON',
      }),
    ).toThrow(/not yet fully resolved/);
  });

  // F1, redesigned 2026-08-25 (see domain/reopenRestoration.ts) — REOPEN no longer requires the caller
  // to submit exactly 0 (the old design's own posture, when a linked REVERSAL leg carried the real
  // restoration separately). There is now nothing for a human to type at all: whatever amount is
  // submitted here is silently discarded and overwritten with the server-computed restore-chain total —
  // see the Angular UI's own removal of REOPEN's Amount field for the client-side half of this.
  test('server overrides whatever amount is submitted with the computed restore-chain total, regardless of what the caller sent', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REOPEN-006', { expiryDate: '2099-12-31' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '5', // deliberately wrong/irrelevant — must be ignored, not rejected.
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    expect(reopen.movement.amount).toBe('10000');
    expect(reopen.movement.ceilingAmount).toBe('10000');
  });
});

describe('REVERSAL — internal-only sufficiency checks (F1)', () => {
  test('rejects a missing reversalOfMovementId', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REV-001', { expiryDate: '2099-12-31' });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REVERSAL',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(/reversalOfMovementId is required/);
  });

  test('rejects a reversalOfMovementId that does not resolve on this contract', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REV-002', { expiryDate: '2099-12-31' });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REVERSAL',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        reversalOfMovementId: 'does-not-exist',
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(InsufficientBalanceError);
  });

  test('rejects reversing an already-reversed movement (double-reversal)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const expired = (() => {
      const lc = issueImportLc(service, 'REV-003', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
      service.runAutoExpirySweep(new Date('2026-01-08'));
      return service.resolveContract('IPLC_LC', { lcNumber: 'REV-003' }, true)!;
    })();
    const amend = submitAmendExpiryDate(service, expired.balanceContractId, 3, '2027-01-01', '2026-01-15');
    if (!amend.created) throw new Error('expected a new movement');
    service.release(amend.movement.movementId, 'checker1');

    const expireMovement = service.listMovements(expired.balanceContractId).find((m) => m.movementType === 'EXPIRE')!;
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: expired.balanceContractId,
        movementType: 'REVERSAL',
        eventSeq: 5,
        amount: expireMovement.ceilingAmount,
        currency: 'USD',
        reversalOfMovementId: expireMovement.movementId,
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(/has already been reversed/);
  });

  test('rejects an amount that does not exactly match the reversed movement', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'REV-004', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    service.runAutoExpirySweep(new Date('2026-01-08'));
    const expireMovement = service.listMovements(lc.balanceContractId).find((m) => m.movementType === 'EXPIRE')!;

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'REVERSAL',
        eventSeq: 3,
        amount: '1',
        currency: 'USD',
        reversalOfMovementId: expireMovement.movementId,
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(/must exactly equal the reversed movement/);
  });
});

describe('AMEND_EXPIRY_DATE / REOPEN Release-time re-checks (F1) — state can move between Submit and Release', () => {
  test('AMEND_EXPIRY_DATE: newExpiryDate is no longer strictly later than the Business Date by Release time', () => {
    const db = createDb(':memory:');
    // Every this.now() call (including Release's own releasedAt) returns a far-future date — simulates
    // enough wall-clock time passing between Submit and Release that a newExpiryDate valid at Submit
    // time no longer is.
    const service = new BalanceService(db, () => '2099-06-01T00:00:00Z');
    const lc = issueImportLc(service, 'RECHECK-AMEND-001', { expiryDate: '2026-06-01' });
    const amend = submitAmendExpiryDate(service, lc.balanceContractId, 2, '2027-01-01', '2026-01-01');
    if (!amend.created) throw new Error('expected a new movement');

    expect(() => service.release(amend.movement.movementId, 'checker1')).toThrow(
      /no longer strictly later than the Business Date/,
    );
  });

  test('AMEND_EXPIRY_DATE: contract status changed to something else between Submit and Release (defense-in-depth, DB-bypass simulated)', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-AMEND-002', { expiryDate: '2026-06-01' });
    const amend = submitAmendExpiryDate(service, lc.balanceContractId, 2, '2027-01-01', '2026-01-01');
    if (!amend.created) throw new Error('expected a new movement');
    // No user-facing path ever moves a contract to CANCELLED — simulate directly, same "bypass the
    // guarded path" technique this codebase already uses elsewhere (see app.test.ts's own A9 re-check
    // test) to prove the defense-in-depth branch actually fires.
    db.exec(`UPDATE balance_contracts SET status = 'CANCELLED' WHERE balance_contract_id = '${lc.balanceContractId}'`);

    expect(() => service.release(amend.movement.movementId, 'checker1')).toThrow(
      /no longer ACTIVE or EXPIRED/,
    );
  });

  test('Expiry Extension Amendment: hasOpenEvents becomes true between Submit and Release (DB-bypass simulated)', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-AMEND-003', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    service.runAutoExpirySweep(new Date('2026-01-08'));
    const expired = service.resolveContract('IPLC_LC', { lcNumber: 'RECHECK-AMEND-003' }, true)!;
    const amend = submitAmendExpiryDate(service, expired.balanceContractId, 3, '2027-01-01', '2026-01-15');
    if (!amend.created) throw new Error('expected a new movement');
    // §7.8 blocks every normal path from creating a new PENDING event under an EXPIRED contract —
    // simulate one arriving some other way (a future second caller, a migration) via a raw insert.
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, created_at)
       VALUES ('bypass-mv-1', '${expired.balanceContractId}', 999, 'AMEND_INCREASE', 'CONTINGENT', '1', '1', 'USD', 'PENDING', 'maker1', '2026-01-15T00:00:00Z')`,
    );

    expect(() => service.release(amend.movement.movementId, 'checker1')).toThrow(
      /not yet fully resolved/,
    );
  });

  // F1, redesigned 2026-08-25 (see release()'s own AMEND_EXPIRY_DATE doc comment for the full bug this
  // fixes) — a contract EXPIRED via a raw status write with no real EXPIRE in its history no longer
  // throws: there is genuinely nothing to reverse (same "0 is a legitimate figure" posture EXPIRE/CLOSE/
  // REOPEN already use elsewhere), and the Extension simply reactivates to ACTIVE with the balance
  // untouched.
  test('Expiry Extension Amendment against a contract EXPIRED via a raw status write (no real EXPIRE — DB-bypass simulated) reactivates cleanly with no REVERSAL generated, since there is nothing to restore', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-AMEND-004', { expiryDate: '2025-12-30' });
    db.exec(`UPDATE balance_contracts SET status = 'EXPIRED' WHERE balance_contract_id = '${lc.balanceContractId}'`);
    const amend = submitAmendExpiryDate(service, lc.balanceContractId, 2, '2027-01-01', '2026-01-15');
    if (!amend.created) throw new Error('expected a new movement');

    service.release(amend.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'RECHECK-AMEND-004' })?.status).toBe('ACTIVE');
    expect(service.listMovements(lc.balanceContractId).filter((m) => m.movementType === 'REVERSAL')).toHaveLength(0);
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000'); // the ISSUE's own balance, never written off, untouched.
  });

  // F1, user-reported live-testing bug (2026-08-25, "IMPORT S01 EXTEND後 無法做後續作業") — the actual
  // double-restoration scenario: a contract reaches EXPIRED via A11/B7 Reopen (§9.2 Option A, restoring
  // the balance directly on REOPEN's own signed amount, no REVERSAL) rather than via a genuine EXPIRE.
  // Extension Amendment must NOT find the OLD, already-effectively-neutralized EXPIRE and reverse it a
  // second time.
  test('Expiry Extension Amendment after A11 Reopen reactivated the contract to EXPIRED does NOT double-restore the balance — REOPEN already did it directly, nothing left for Extension to reverse', () => {
    // Fixed now() so the EXPIRE's own effectiveTo (F1 §13.5 Auto Close Grace Period anchor) is
    // deterministic — the AUTO CLOSE sweep below is called well past its 2-business-day grace window.
    const service = new BalanceService(createDb(':memory:'), () => '2026-01-08T00:00:00Z');
    const lc = issueImportLc(service, 'RECHECK-AMEND-005', { expiryDate: '2025-12-30', mailFloatGraceDays: 5 });
    service.runAutoExpirySweep(new Date('2026-01-08'));
    service.runAutoCloseSweep(new Date('2026-01-18'));
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'RECHECK-AMEND-005' }, true)?.status).toBe('CLOSED');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    service.release(reopen.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'RECHECK-AMEND-005' }, true)?.status).toBe('EXPIRED'); // original expiryDate (2025-12-30) is still in the past.
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000'); // REOPEN's own direct restoration.

    const amend = submitAmendExpiryDate(service, lc.balanceContractId, 4, '2027-01-01', '2026-01-15');
    if (!amend.created) throw new Error('expected a new movement');
    service.release(amend.movement.movementId, 'checker1');

    expect(service.resolveContract('IPLC_LC', { lcNumber: 'RECHECK-AMEND-005' })?.status).toBe('ACTIVE');
    // The bug: this used to read 20000 (REOPEN's own 10000 restoration PLUS a second, spurious REVERSAL
    // of the same original EXPIRE, since Extension's old logic couldn't tell REOPEN had already handled it).
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000');
    expect(service.listMovements(lc.balanceContractId).filter((m) => m.movementType === 'REVERSAL')).toHaveLength(0);
  });

  test('REOPEN: contract status changed to something else between Submit and Release (DB-bypass simulated)', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-REOPEN-001', { expiryDate: '2099-12-31' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');
    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    db.exec(`UPDATE balance_contracts SET status = 'CANCELLED' WHERE balance_contract_id = '${lc.balanceContractId}'`);

    expect(() => service.release(reopen.movement.movementId, 'checker2')).toThrow(
      /no longer CLOSED/,
    );
  });

  test('REOPEN: hasOpenEvents becomes true between Submit and Release (DB-bypass simulated)', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-REOPEN-002', { expiryDate: '2099-12-31' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');
    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, created_at)
       VALUES ('bypass-mv-2', '${lc.balanceContractId}', 998, 'AMEND_INCREASE', 'CONTINGENT', '1', '1', 'USD', 'PENDING', 'maker1', '2026-01-15T00:00:00Z')`,
    );

    expect(() => service.release(reopen.movement.movementId, 'checker2')).toThrow(
      /not yet fully resolved/,
    );
  });

  // F1, redesigned 2026-08-25 — with no separate REVERSAL leg(s) to fail to find, a CLOSED contract with
  // no real EXPIRE/CLOSE in its own history (raw-DB status bypass, no genuine write-off ever recorded)
  // is no longer an error case: computeReopenRestoreAmount() legitimately computes 0 (nothing to
  // restore), and REOPEN proceeds — same "0 is a legitimate figure" posture CLOSE/EXPIRE already use for
  // an already-fully-utilized contract.
  test('REOPEN against a CLOSED contract with no real EXPIRE/CLOSE in its history (raw status bypass) restores 0, not an error', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    // ISSUE now mandates expiryDate (F1 §13.5 Phase 2) — issue with a placeholder value, then null it back
    // out via the same raw-SQL bypass convention this file already uses, to simulate a legacy pre-F1
    // contract with no expiryDate recorded at all. This test's own point depends on that: REOPEN's own
    // targetStatus logic must fall back to EXPIRED (not ACTIVE) when there is genuinely no future
    // expiryDate to reactivate into.
    const lc = issueImportLc(service, 'RECHECK-REOPEN-003', { expiryDate: '2099-12-31' });
    db.exec(`UPDATE balance_contracts SET status = 'CLOSED', expiry_date = NULL WHERE balance_contract_id = '${lc.balanceContractId}'`);
    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 2,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    expect(reopen.movement.ceilingAmount).toBe('0');

    service.release(reopen.movement.movementId, 'checker1');
    // issueImportLc() here never set an expiryDate — release()'s own reactivation logic (unchanged by
    // this redesign) falls back to EXPIRED, not ACTIVE, when there is no future expiryDate to reactivate
    // into (same as any other REOPEN against a contract with no recorded expiryDate).
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'RECHECK-REOPEN-003' }, true)?.status).toBe('EXPIRED');
    // The raw status bypass above never actually wrote off the ISSUE's own 10000 (no real CLOSE ever
    // ran) — REOPEN itself correctly contributes 0 (nothing in the chain to restore), leaving the
    // pre-existing ISSUE balance untouched, not zeroed.
    expect(service.getBalanceSnapshot(lc.balanceContractId).confirmedBalance).toBe('10000');
  });
});

// F1, user-reported live-testing gap (2026-08-25, "Auto Close 時必須把REOPEN狀態交易排除 不然才REOPEN
// 下一秒就被AUTO CLOSE掉了" / "還有AUTO EXPIRE 也把REOPEN狀態交易排除") — isRecentlyReopened() gives a
// contract one full sweep interval of grace from BOTH background batches after its own most recent
// REOPEN, before either is allowed to act on it again.
describe('AUTO EXPIRY/AUTO CLOSE skip a recently-Reopened contract for one sweep interval (F1)', () => {
  test('AUTO CLOSE skips a contract whose latest movement is a REOPEN reactivating it to EXPIRED, then processes it once the grace interval has elapsed', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    // ISSUE now mandates expiryDate (F1 §13.5 Phase 2) — issue with a placeholder value, then null it back
    // out via a raw-SQL bypass (same convention as RECHECK-REOPEN-003 above) to simulate a legacy pre-F1
    // contract with no expiryDate recorded at all: REOPEN's own targetStatus logic falls back to EXPIRED
    // -> immediately re-eligible for AUTO CLOSE (SG/Acceptance both trivially 0) without the fix under test.
    const lc = issueImportLc(service, 'GRACE-CLOSE-001', { expiryDate: '2099-12-31' });
    db.exec(`UPDATE balance_contracts SET expiry_date = NULL WHERE balance_contract_id = '${lc.balanceContractId}'`);
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    service.release(reopen.movement.movementId, 'checker2');
    const reactivated = service.resolveContract('IPLC_LC', { lcNumber: 'GRACE-CLOSE-001' }, true)!;
    expect(reactivated.status).toBe('EXPIRED');
    const reopenedAt = new Date(service.listMovements(lc.balanceContractId).find((m) => m.movementType === 'REOPEN')!.releasedAt!);

    // Immediately after (well within the grace window) — AUTO CLOSE must skip it.
    const skipped = service.runAutoCloseSweep(new Date(reopenedAt.getTime() + 1_000));
    expect(skipped).toHaveLength(0);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'GRACE-CLOSE-001' }, true)?.status).toBe('EXPIRED');

    // Well past one full sweep interval later — AUTO CLOSE now processes it normally. Must also clear
    // F1 §13.5's own Auto Close Grace Period (2 BUSINESS days off effectiveTo, which reactivate() stamped
    // to this same REOPEN release moment) — 8 calendar days safely covers that regardless of which day of
    // the week the REOPEN itself happened to release on.
    const processed = service.runAutoCloseSweep(new Date(reopenedAt.getTime() + 8 * 24 * 60 * 60 * 1000));
    expect(processed).toHaveLength(1);
    expect(processed[0]!.ok).toBe(true);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'GRACE-CLOSE-001' }, true)?.status).toBe('CLOSED');
  });

  test('AUTO EXPIRY skips a contract whose latest movement is a REOPEN still within the grace window, even if expiryDate+grace has already elapsed (defense-in-depth — REOPEN itself never reactivates to ACTIVE with an already-past expiryDate, so this is exercised via a direct DB bypass of expiryDate, same convention as this file\'s other DB-bypass re-check tests)', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'GRACE-EXPIRE-001', { expiryDate: '2099-12-31' }); // overwritten below via raw SQL regardless
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    // Give it a future expiryDate directly (bypassing the natural A2 Amendment flow) so REOPEN reactivates
    // to ACTIVE, not EXPIRED — this test is specifically about AUTO EXPIRY's own candidate pool.
    db.exec(`UPDATE balance_contracts SET expiry_date = '2099-01-01' WHERE balance_contract_id = '${lc.balanceContractId}'`);
    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    service.release(reopen.movement.movementId, 'checker2');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'GRACE-EXPIRE-001' })?.status).toBe('ACTIVE');
    const reopenedAt = new Date(service.listMovements(lc.balanceContractId).find((m) => m.movementType === 'REOPEN')!.releasedAt!);

    // Now backdate expiryDate to already-past-grace — simulates the (structurally unreachable via normal
    // flow) race the grace window still defends against.
    db.exec(`UPDATE balance_contracts SET expiry_date = '2020-01-01' WHERE balance_contract_id = '${lc.balanceContractId}'`);

    const skipped = service.runAutoExpirySweep(new Date(reopenedAt.getTime() + 1_000));
    expect(skipped).toHaveLength(0);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'GRACE-EXPIRE-001' })?.status).toBe('ACTIVE');

    const processed = service.runAutoExpirySweep(new Date(reopenedAt.getTime() + 24 * 60 * 60 * 1000));
    expect(processed).toHaveLength(1);
    expect(processed[0]!.ok).toBe(true);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'GRACE-EXPIRE-001' }, true)?.status).toBe('EXPIRED');
  });
});

describe('REOPEN release-time re-check catches a restore-chain amount that shifted since Submit (F1)', () => {
  test('rejects Release when a raw-SQL-inserted extra CLOSE lands on the chain between Submit and Release, changing the computed restore amount', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-REOPEN-AMOUNT-001', { expiryDate: '2099-12-31' });
    const close = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_CLOSE_REASON',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const reopen = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'REOPEN',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: 'maker1',
      reasonCode: 'TEST_REOPEN_REASON',
    });
    if (!reopen.created) throw new Error('expected a new movement');
    expect(reopen.movement.ceilingAmount).toBe('10000');

    // Simulates a second CLOSE landing on the chain (between an earlier EXPIRE-shaped movement and this
    // REOPEN) after Submit but before Release — no user-facing path can create this ordering today (the
    // contract is CLOSED, blocking every other function per §7.8), so it's constructed directly, same
    // "bypass the guarded path" technique this file's own other release()-time re-check tests already use.
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, released_by, created_at, released_at)
       VALUES ('bypass-extra-close', '${lc.balanceContractId}', 4, 'CLOSE', 'CONTINGENT', '3000', '3000', 'USD', 'RELEASED', 'maker1', 'checker1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    );

    expect(() => service.release(reopen.movement.movementId, 'checker2')).toThrow(/the amount to restore has changed since Submit/);
  });
});
