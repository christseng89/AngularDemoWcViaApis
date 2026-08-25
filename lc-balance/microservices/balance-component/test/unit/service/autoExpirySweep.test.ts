/**
 * F1 (external BA review) — AUTO EXPIRY / AUTO CLOSE end-to-end BalanceService coverage. See
 * domain/expiryEligibility.test.ts for the pure eligibility-rule unit tests; this file exercises the
 * three-layer wiring (createMovement()'s own expireShaped sufficiency check, release()'s own re-check +
 * markExpired()/markClosed() side effects, runAutoExpirySweep()/runAutoCloseSweep()/
 * runExpirySweepCycle()) against a real in-memory DB, same convention as closeFunction.test.ts.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { BATCH_CHECKER_ACTOR, BATCH_MAKER_ACTOR } from '../../../src/config';

function issueImportLc(service: BalanceService, lcNumber: string, opts: { amount?: string; expiryDate?: string; mailFloatGraceDays?: number } = {}) {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: opts.amount ?? '10000',
    currency: 'USD',
    expiryDate: opts.expiryDate,
    mailFloatGraceDays: opts.mailFloatGraceDays,
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

describe('ISSUE captures expiryDate/mailFloatGraceDays onto the contract (F1)', () => {
  test('caller-supplied expiryDate/mailFloatGraceDays are stored as-is', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'F1-CAPTURE-001', { expiryDate: '2026-06-01', mailFloatGraceDays: 7 });
    expect(lc.expiryDate).toBe('2026-06-01');
    expect(lc.mailFloatGraceDays).toBe(7);
  });

  test('omitted mailFloatGraceDays falls back to the Import-side config default', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'F1-CAPTURE-002', { expiryDate: '2026-06-01' });
    expect(lc.mailFloatGraceDays).toBe(5); // MAIL_FLOAT_GRACE_DAYS.IMPORT in config.ts
  });

  test('omitted expiryDate stays null (not every LC needs one recorded)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'F1-CAPTURE-003');
    expect(lc.expiryDate).toBeNull();
  });

  test('Export side (B1/EPLC_CONFIRMATION) falls back to the Export-side config default', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'F1-CAPTURE-B1-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2026-06-01',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'F1-CAPTURE-B1-001' });
    expect(confirmation?.mailFloatGraceDays).toBe(5); // MAIL_FLOAT_GRACE_DAYS.EXPORT in config.ts
  });
});

describe('EXPIRE movementType (createMovement/release wiring)', () => {
  test('happy path: ACTIVE, no open Events -> Submit + Release writes off Confirmed Balance to 0 and sets status EXPIRED, REGARDLESS of outstanding SG/Acceptance (BA §7.2)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'EXPIRE-001', { expiryDate: '2026-01-01' });

    // Issue an outstanding SG under this LC — proves EXPIRE does NOT require SG=0 (unlike CLOSE).
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'EXPIRE-001', sgNumber: 'SG01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '3000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    const expire = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'EXPIRE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
    });
    if (!expire.created) throw new Error('expected a new movement');
    expect(expire.movement.status).toBe('PENDING');

    const released = service.release(expire.movement.movementId, BATCH_CHECKER_ACTOR);
    expect(released.status).toBe('RELEASED');

    const snapshot = service.getBalanceSnapshot(lc.balanceContractId);
    expect(snapshot.confirmedBalance).toBe('0');
    const reloaded = service.resolveContract('IPLC_LC', { lcNumber: 'EXPIRE-001' }, true);
    expect(reloaded?.status).toBe('EXPIRED');
  });

  test('rejects EXPIRE on a non-root instrumentType', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'EXPIRE-002');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'EXPIRE-002', sgNumber: 'SG01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '3000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');
    const sg = service.resolveContract('SHGT', { lcNumber: 'EXPIRE-002', sgNumber: 'SG01' });

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        balanceContractId: sg!.balanceContractId,
        movementType: 'EXPIRE',
        eventSeq: 2,
        amount: '3000',
        currency: 'USD',
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(/EXPIRE only applies to a root LC\/Confirmation/);
  });

  test('rejects EXPIRE with an open (PENDING) event anywhere in the tree', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'EXPIRE-003');
    // A PENDING UTILIZE keeps hasOpenEvents true.
    service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '1000',
      currency: 'USD',
      createdBy: 'maker1',
    });

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'EXPIRE',
        eventSeq: 3,
        amount: '10000',
        currency: 'USD',
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(/not yet fully resolved/);
  });

  test('rejects an EXPIRE amount that does not exactly equal the current Confirmed Balance', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'EXPIRE-004');
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'EXPIRE',
        eventSeq: 2,
        amount: '9999',
        currency: 'USD',
        createdBy: BATCH_MAKER_ACTOR,
      }),
    ).toThrow(/EXPIRE amount must exactly equal the current Confirmed Balance/);
  });

  test('zero-amount EXPIRE is accepted (a fully-utilized, expired LC has nothing left to write off)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'EXPIRE-005');
    const utilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!utilize.created) throw new Error('expected a new movement');
    service.release(utilize.movement.movementId, 'checker1');

    const expire = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'EXPIRE',
      eventSeq: 3,
      amount: '0',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
    });
    if (!expire.created) throw new Error('expected a new movement');
    expect(() => service.release(expire.movement.movementId, BATCH_CHECKER_ACTOR)).not.toThrow();
  });
});

describe('runAutoExpirySweep (F1)', () => {
  test('EXPIREs an ACTIVE LC past expiryDate + mailFloatGraceDays, leaves one not yet past grace untouched', () => {
    const service = new BalanceService(createDb(':memory:'));
    const due = issueImportLc(service, 'SWEEP-001', { expiryDate: '2026-01-01', mailFloatGraceDays: 5 });
    const notDue = issueImportLc(service, 'SWEEP-002', { expiryDate: '2026-01-01', mailFloatGraceDays: 30 });

    const results = service.runAutoExpirySweep(new Date('2026-01-10'));

    expect(results).toEqual([{ balanceContractId: due.balanceContractId, ok: true }]);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'SWEEP-001' }, true)?.status).toBe('EXPIRED');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'SWEEP-002' }, true)?.status).toBe('ACTIVE');
  });

  test('leaves a contract with no recorded expiryDate untouched', () => {
    const service = new BalanceService(createDb(':memory:'));
    issueImportLc(service, 'SWEEP-003');
    expect(service.runAutoExpirySweep(new Date('2099-01-01'))).toEqual([]);
  });

  test('is idempotent across repeated sweep calls — a second run finds nothing left to do', () => {
    const service = new BalanceService(createDb(':memory:'));
    issueImportLc(service, 'SWEEP-004', { expiryDate: '2026-01-01', mailFloatGraceDays: 5 });
    const asOf = new Date('2026-01-10');
    expect(service.runAutoExpirySweep(asOf)).toHaveLength(1);
    expect(service.runAutoExpirySweep(asOf)).toEqual([]);
  });

  test('Import and Export sides respect their own independently-configured grace days', () => {
    const service = new BalanceService(createDb(':memory:'));
    // Import default is 5 days (config.ts) — 3 days past expiry is still within Import's own grace.
    const importLc = issueImportLc(service, 'SWEEP-005', { expiryDate: '2026-01-01' });
    const exportIssue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'SWEEP-006' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2026-01-01',
      createdBy: 'maker1',
    });
    if (!exportIssue.created) throw new Error('expected a new movement');
    service.release(exportIssue.movement.movementId, 'checker1');

    const results = service.runAutoExpirySweep(new Date('2026-01-04')); // 3 days past expiry
    expect(results).toEqual([]);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'SWEEP-005' })?.balanceContractId).toBe(importLc.balanceContractId);
  });

  test('no-ops entirely when AUTO_EXPIRY_ENABLED is false — nothing touched, no error', () => {
    jest.resetModules();
    jest.doMock('../../../src/config', () => ({ ...jest.requireActual('../../../src/config'), AUTO_EXPIRY_ENABLED: false }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { BalanceService: PatchedService } = require('../../../src/service/balanceService');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createDb: patchedCreateDb } = require('../../../src/db');
    const service = new PatchedService(patchedCreateDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'SWEEP-007' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2026-01-01',
      mailFloatGraceDays: 5,
      createdBy: 'maker1',
    });
    service.release(issue.movement.movementId, 'checker1');

    expect(service.runAutoExpirySweep(new Date('2026-06-01'))).toEqual([]);
    jest.dontMock('../../../src/config');
    jest.resetModules();
  });
});

describe('runAutoCloseSweep (F1 §7.3) — independent second batch, reuses evaluateContractCloseEligibility() unmodified', () => {
  test('CLOSEs an EXPIRED contract with SG=0/Acceptance=0/no open Events; leaves one with an outstanding SG untouched', () => {
    const service = new BalanceService(createDb(':memory:'));
    const clean = issueImportLc(service, 'AUTOCLOSE-001', { expiryDate: '2026-01-01', mailFloatGraceDays: 5 });
    const dirty = issueImportLc(service, 'AUTOCLOSE-002', { expiryDate: '2026-01-01', mailFloatGraceDays: 5 });
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'AUTOCLOSE-002', sgNumber: 'SG01' },
      parentLogicalContractId: dirty.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '2000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    const asOf = new Date('2026-01-10');
    service.runAutoExpirySweep(asOf);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'AUTOCLOSE-001' }, true)?.status).toBe('EXPIRED');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'AUTOCLOSE-002' }, true)?.status).toBe('EXPIRED');

    // runAutoCloseSweep() reports one entry per EXPIRED candidate it attempted, success or failure —
    // not just the successes — so an operator can see WHY a still-EXPIRED contract wasn't auto-closed.
    const results = service.runAutoCloseSweep();
    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ balanceContractId: clean.balanceContractId, ok: true });
    expect(results).toContainEqual(
      expect.objectContaining({ balanceContractId: dirty.balanceContractId, ok: false, error: expect.stringContaining('Shipping Guarantee Balance must be 0') }),
    );
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'AUTOCLOSE-001' }, true)?.status).toBe('CLOSED');
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'AUTOCLOSE-002' }, true)?.status).toBe('EXPIRED');
  });

  test('never touches an ACTIVE contract, even one already past its own expiry+grace (AUTO CLOSE only scans EXPIRED, never derives it)', () => {
    const service = new BalanceService(createDb(':memory:'));
    issueImportLc(service, 'AUTOCLOSE-003', { expiryDate: '2020-01-01', mailFloatGraceDays: 5 });
    expect(service.runAutoCloseSweep()).toEqual([]);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'AUTOCLOSE-003' })?.status).toBe('ACTIVE');
  });
});

describe('runExpirySweepCycle (F1) — AUTO EXPIRY then, same cycle, AUTO CLOSE', () => {
  test('a never-utilized LC (SG/Acceptance already 0) goes ACTIVE -> EXPIRED -> CLOSED in ONE cycle (known §8.5 gap, not yet a reopen-window regression)', () => {
    const service = new BalanceService(createDb(':memory:'));
    issueImportLc(service, 'CYCLE-001', { expiryDate: '2026-01-01', mailFloatGraceDays: 5 });

    const { expiry, close } = service.runExpirySweepCycle(new Date('2026-01-10'));
    expect(expiry).toHaveLength(1);
    expect(expiry[0]!.ok).toBe(true);
    expect(close).toHaveLength(1);
    expect(close[0]!.ok).toBe(true);
    expect(service.resolveContract('IPLC_LC', { lcNumber: 'CYCLE-001' }, true)?.status).toBe('CLOSED');
  });
});

describe('CLOSE/EXPIRE Release-time re-check — state can move between Submit and Release', () => {
  test('CLOSE: a new PENDING SG appears after Submit — Release re-checks eligibility and throws', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-CLOSE-001');
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
    // A real SG Issue can't actually land here — Tight Available Balance is already fully consumed by
    // the PENDING CLOSE's own -10000 decrease, so a genuine SG Issue attempt is itself rejected by
    // sufficiency (a real, separate protection). Simulate the race directly instead: a PENDING SG
    // arriving under this LC some other way (a future second caller, a migration) — same bypass
    // technique this codebase already uses elsewhere for defense-in-depth branches.
    db.exec(
      `INSERT INTO balance_contracts (balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number, sg_number, parent_logical_contract_id, status, currency, opening_balance, effective_from, created_by, created_at)
       VALUES ('bypass-sg-contract-1', 'bypass-sg-logical-1', 1, 'SHGT', 'RECHECK-CLOSE-001', 'SG01', '${lc.logicalContractId}', 'ACTIVE', 'USD', '0', '2026-01-01T00:00:00Z', 'maker1', '2026-01-01T00:00:00Z')`,
    );
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, created_at)
       VALUES ('bypass-sg-mv-1', 'bypass-sg-contract-1', 1, 'ISSUE', 'CONTINGENT', '1000', '1000', 'USD', 'PENDING', 'maker1', '2026-01-01T00:00:00Z')`,
    );

    expect(() => service.release(close.movement.movementId, 'checker1')).toThrow(
      /eligibility no longer holds/,
    );
  });

  test('EXPIRE: a new PENDING SG appears after Submit — Release re-checks eligibility and throws', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-EXPIRE-001', { expiryDate: '2026-01-01' });
    const expire = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'EXPIRE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
    });
    if (!expire.created) throw new Error('expected a new movement');
    // Same rationale as the CLOSE test above — a real SG Issue can't land here either (Tight Available
    // Balance already fully consumed by the PENDING EXPIRE), so the race is simulated directly.
    db.exec(
      `INSERT INTO balance_contracts (balance_contract_id, logical_contract_id, contract_version, instrument_type, lc_number, sg_number, parent_logical_contract_id, status, currency, opening_balance, effective_from, created_by, created_at)
       VALUES ('bypass-sg-contract-2', 'bypass-sg-logical-2', 1, 'SHGT', 'RECHECK-EXPIRE-001', 'SG01', '${lc.logicalContractId}', 'ACTIVE', 'USD', '0', '2026-01-01T00:00:00Z', 'maker1', '2026-01-01T00:00:00Z')`,
    );
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, created_at)
       VALUES ('bypass-sg-mv-2', 'bypass-sg-contract-2', 1, 'ISSUE', 'CONTINGENT', '1000', '1000', 'USD', 'PENDING', 'maker1', '2026-01-01T00:00:00Z')`,
    );

    expect(() => service.release(expire.movement.movementId, BATCH_CHECKER_ACTOR)).toThrow(
      /eligibility no longer holds/,
    );
  });

  test('EXPIRE: Confirmed Balance changes after Submit (an unrelated AMEND_INCREASE releases first) — Release re-checks the frozen amount and throws', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'RECHECK-EXPIRE-002', { expiryDate: '2026-01-01' });
    const expire = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'EXPIRE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: BATCH_MAKER_ACTOR,
    });
    if (!expire.created) throw new Error('expected a new movement');
    const increase = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 3,
      amount: '500',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!increase.created) throw new Error('expected a new movement');
    service.release(increase.movement.movementId, 'checker1'); // Confirmed Balance is now 10500, not the 10000 EXPIRE was frozen at.

    expect(() => service.release(expire.movement.movementId, BATCH_CHECKER_ACTOR)).toThrow(
      /Confirmed Balance has changed since Submit/,
    );
  });
});

describe('processSweepCandidate — reports (not throws) an idempotency conflict on the eventSeq it generates', () => {
  test('a pre-existing movement at the exact Date.now() eventSeq the sweep would generate is reported as ok:false, not thrown', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'SWEEP-IDEMPOTENCY-001', { expiryDate: '2026-01-01', mailFloatGraceDays: 5 });

    const fixedNow = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      // Occupies the exact (balanceContractId, eventSeq) pair the sweep's own Date.now()-based EXPIRE
      // request will collide with.
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: fixedNow,
        amount: '1',
        currency: 'USD',
        createdBy: 'maker1',
      });

      const results = service.runAutoExpirySweep(new Date('2026-01-10'));
      expect(results).toEqual([{ balanceContractId: lc.balanceContractId, ok: false, error: expect.stringContaining('idempotency conflict') }]);
    } finally {
      jest.spyOn(Date, 'now').mockRestore();
    }
  });
});
