/**
 * Replays the Case 1-5 business scenarios worked through against
 * analysis/COMMON-BalanceComponent-Design-zh.md (v0.6) / lc-balance-wc/
 * analysis/balance-component-api.yaml (v0.4.0) during design review, as
 * executable test vectors over the real domain functions (src/domain/*).
 *
 * Deliberately NOT going through the DB/store layer — these tests exercise
 * pure calculation only. Each `test()` within a describe block depends on
 * the ledger state left behind by the previous one (a single sequential
 * business narrative, same posture as
 * payment-component/test/regression.ts's scenario replay) — do not reorder
 * or parallelize within a describe block.
 */
import Decimal from 'decimal.js';
import { ScenarioLedger } from './helpers/scenarioLedger';
import { checkAmendDecreaseSufficiency } from '../../src/domain/amendDecrease';
import { computeCeilingAmount } from '../../src/domain/tolerance';
import { assertFailed, assertSucceeded } from './helpers/assertFailed';

const TOLERANCE_10PCT = '10';

describe('Case 1 — USD Sight, no SHGT', () => {
  const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);

  test('1. LC Issue 100,000, Tolerance 10% -> Ceiling 110,000', () => {
    lc.credit('ISSUE', '100000');
    expect(lc.confirmed().toFixed()).toBe('110000');
    expect(lc.available().toFixed()).toBe('110000');
  });

  test('2. LC Amendment increase 10,000 -> ceilingAmount 11,000 (Tolerance-adjusted, not 10,000)', () => {
    const ceiling = lc.credit('AMEND_INCREASE', '10000');
    expect(ceiling.toFixed()).toBe('11000');
    expect(lc.confirmed().toFixed()).toBe('121000');
  });

  test('3. Document Arrival 50,000 -> OK, no warning (no SHGT)', () => {
    const result = lc.utilize('50000');
    expect(result.ok).toBe(true);
    assertSucceeded(result);
    expect(result.warning).toBeUndefined();
    expect(lc.available().toFixed()).toBe('71000'); // 121000 earmarked down to 71000
  });

  test('4. Accept Pay 50,000 (Sight) -> LC settles at 71,000/71,000', () => {
    lc.release('UTILIZE');
    expect(lc.confirmed().toFixed()).toBe('71000');
    expect(lc.available().toFixed()).toBe('71000');
  });
});

describe('Case 2 — USD Usance 120 days after sight, no SHGT', () => {
  const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
  const acceptance = new ScenarioLedger('IPLC_ACCEPTANCE'); // Acceptance carries no Tolerance of its own

  test('1-2. Issue + Amendment -> LC Ceiling 121,000', () => {
    lc.credit('ISSUE', '100000');
    lc.credit('AMEND_INCREASE', '10000');
    expect(lc.confirmed().toFixed()).toBe('121000');
  });

  test('3. Document Arrival 50,000 -> OK, PENDING earmark', () => {
    const result = lc.utilize('50000');
    expect(result.ok).toBe(true);
    assertSucceeded(result);
    expect(result.warning).toBeUndefined();
  });

  test('4. Accept 50,000 -> LC releases UTILIZE (71,000) AND Acceptance CREATE (50,000)', () => {
    lc.release('UTILIZE');
    expect(lc.confirmed().toFixed()).toBe('71000');

    acceptance.credit('CREATE', '50000');
    expect(acceptance.confirmed().toFixed()).toBe('50000');
    expect(acceptance.available().toFixed()).toBe('50000');
  });

  test('5. Settlement Due Date 50,000 -> Acceptance FULL_SETTLE to 0; LC untouched (Cross-Reference Finding 1)', () => {
    acceptance.debit('FULL_SETTLE', '50000');
    expect(acceptance.confirmed().toFixed()).toBe('0');
    expect(lc.confirmed().toFixed()).toBe('71000'); // maturity settlement never touches LC Balance
  });
});

describe('Case 3 — USD Sight + Shipping Guarantee 50,000 (matches document arrival) + IBL', () => {
  const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
  const shgt = new ScenarioLedger('SHGT');

  test('1-2. Issue + Amendment -> LC Ceiling 121,000', () => {
    lc.credit('ISSUE', '100000');
    lc.credit('AMEND_INCREASE', '10000');
  });

  test('3. Shipping Guarantee 50,000 -> SHGT Confirmed 50,000; LC untouched (no linkage, §5/§11)', () => {
    shgt.credit('ISSUE', '50000');
    expect(shgt.confirmed().toFixed()).toBe('50000');
    expect(lc.confirmed().toFixed()).toBe('121000');
  });

  test('4. Document Arrival 50,000 -> OK, NO warning: Tight Available (71,000) still >= 50,000', () => {
    const result = lc.utilize('50000', shgt.offBalanceExposure());
    expect(result.ok).toBe(true);
    assertSucceeded(result);
    expect(result.warning).toBeUndefined();
  });

  test('5. IBL/Pay 50,000 (120 days, Loan Component — no Balance Component call) -> LC settles at 71,000', () => {
    lc.release('UTILIZE');
    expect(lc.confirmed().toFixed()).toBe('71000');
  });

  test('5b. SG matches the arrived documents exactly (50,000=50,000) -> FULL_REDEEM to 0 (v0.6)', () => {
    const result = shgt.redeem('FULL_REDEEM', '50000');
    expect(result.ok).toBe(true);
    expect(shgt.confirmed().toFixed()).toBe('0');
  });

  test('6. Settlement Due Date 50,000 -> pure Loan Component event, LC/SHGT unchanged', () => {
    expect(lc.confirmed().toFixed()).toBe('71000');
    expect(shgt.confirmed().toFixed()).toBe('0');
  });
});

describe('Case 4 — USD Sight + Shipping Guarantee 100,000 (covers full LC) + IBL, only 50,000 documents arrive', () => {
  const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
  const shgt = new ScenarioLedger('SHGT');

  test('1-2. Issue + Amendment -> LC Ceiling 121,000', () => {
    lc.credit('ISSUE', '100000');
    lc.credit('AMEND_INCREASE', '10000');
  });

  test('3. Shipping Guarantee 100,000 -> SHGT Confirmed 100,000', () => {
    shgt.credit('ISSUE', '100000');
    expect(shgt.confirmed().toFixed()).toBe('100000');
  });

  test('4. Document Arrival 50,000 (unmatched) -> REJECTED: exceeds Tight Available 21,000 (v0.12 — was a non-blocking WARNING through v0.10/v0.11, see offBalanceExposure.ts)', () => {
    const result = lc.utilize('50000', shgt.offBalanceExposure());
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds Tight Available Balance 21000/);
    expect(result.error).toMatch(/Document Arrival w\/ Shipping Gtee/);
  });

  test('4b. The fix: PARTIAL_REDEEM the SG down to 50,000 FIRST — still an explicit, separate call, never auto-derived from the arrival amount — which raises Tight Available to 71,000', () => {
    const result = shgt.redeem('PARTIAL_REDEEM', '50000');
    expect(result.ok).toBe(true);
    expect(shgt.confirmed().toFixed()).toBe('50000'); // was permanently stuck at 100,000 pre-v0.6
  });

  test('4c. The SAME 50,000 Document Arrival now passes, since Tight Available (71,000) covers it', () => {
    const result = lc.utilize('50000', shgt.offBalanceExposure());
    expect(result.ok).toBe(true);
  });

  test('5. IBL/Pay 50,000 -> LC settles at 71,000', () => {
    lc.release('UTILIZE');
    expect(lc.confirmed().toFixed()).toBe('71000');
  });

  test('5c. Attempting to redeem more than what remains outstanding is rejected', () => {
    const result = shgt.redeem('FULL_REDEEM', '60000'); // only 50,000 left
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds this record's Available Balance/);
    expect(shgt.confirmed().toFixed()).toBe('50000'); // unchanged
  });
});

describe('Case 5 — USD Sight, Amendment Decrease exceeding Available Balance', () => {
  test('1. LC Issue 100,000, Tolerance 10% -> Ceiling 110,000', () => {
    const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
    lc.credit('ISSUE', '100000');
    expect(lc.confirmed().toFixed()).toBe('110000');
  });

  test('2. Amendment decrease 120,000 -> REJECTED (ceilingAmount 132,000 > Available 110,000)', () => {
    const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
    lc.credit('ISSUE', '100000');

    const result = lc.amendDecrease('120000');
    expect(result.ceilingAmount.toFixed()).toBe('132000');
    expect(result.ok).toBe(false);
    // Error message must disambiguate face-level vs Ceiling-level explicitly (reviewer confusion, 2026-08-14).
    expect(result.error).toMatch(/face-level amount 120000/);
    expect(result.error).toMatch(/Ceiling-level decrease of 132000/);
    // Rejected -> Confirmed Balance unchanged, no movement recorded.
    expect(lc.confirmed().toFixed()).toBe('110000');
  });

  test('boundary counter-example: decrease 105,000 also correctly rejected (would drive face amount to -5,000)', () => {
    const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
    lc.credit('ISSUE', '100000');

    // A naive check against the RAW face-level amount (105,000 <= Available 110,000)
    // would wrongly pass -- proving why §6.2 must compare ceilingAmount, not amount.
    const rawAmount = new Decimal('105000');
    expect(rawAmount.lessThanOrEqualTo(lc.available())).toBe(true); // the naive check would say "fine"

    const result = lc.amendDecrease('105000');
    expect(result.ceilingAmount.toFixed()).toBe('115500');
    expect(result.ok).toBe(false); // the Tolerance-adjusted check correctly rejects it
  });

  test('sanity: a decrease that keeps the face amount non-negative is accepted', () => {
    const lc = new ScenarioLedger('IPLC_LC', TOLERANCE_10PCT);
    lc.credit('ISSUE', '100000'); // Ceiling 110,000
    const result = lc.amendDecrease('50000'); // ceilingAmount 55,000 <= 110,000
    expect(result.ok).toBe(true);
    expect(lc.confirmed().toFixed()).toBe('55000');
  });
});

describe('checkAmendDecreaseSufficiency — direct unit coverage of the §6.2 formula', () => {
  test('exact-fit decrease is accepted (ceilingAmount === availableBalance)', () => {
    const result = checkAmendDecreaseSufficiency({
      amount: new Decimal('100000'),
      ceilingAmount: computeCeilingAmount('100000', '10', 'AMEND_DECREASE', 'IPLC_LC'),
      tightAvailableBalance: new Decimal('110000'),
    });
    expect(result.ok).toBe(true);
  });

  test('zero tolerance -> ceilingAmount equals the raw amount', () => {
    const ceiling = computeCeilingAmount('50000', '0', 'AMEND_DECREASE', 'IPLC_LC');
    expect(ceiling.toFixed()).toBe('50000');
  });

  test('null tolerance -> ceilingAmount equals the raw amount (identity, no conversion)', () => {
    const ceiling = computeCeilingAmount('50000', null, 'AMEND_DECREASE', 'IPLC_LC');
    expect(ceiling.toFixed()).toBe('50000');
  });

  test('business rule 2026-08-14: Tolerance NEVER applies to a non-LC instrumentType, even with the same movementType string and a populated tolerancePct', () => {
    const shgtCeiling = computeCeilingAmount('50000', '10', 'ISSUE', 'SHGT');
    expect(shgtCeiling.toFixed()).toBe('50000'); // NOT 55000 — SG amount is always its own face value
    const acceptanceCeiling = computeCeilingAmount('50000', '10', 'CREATE', 'IPLC_ACCEPTANCE');
    expect(acceptanceCeiling.toFixed()).toBe('50000'); // NOT 55000 — Bills amount is always its own face value
  });
});
