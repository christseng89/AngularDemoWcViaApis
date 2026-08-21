import Decimal from 'decimal.js';
import { evaluateCloseEligibility } from '../../../src/domain/closeEligibility';

function baseInputs() {
  return {
    alreadyClosed: false,
    rootConfirmedBalance: new Decimal(10000),
    sgConfirmedBalance: new Decimal(0),
    acceptanceConfirmedBalance: new Decimal(0),
    hasOpenEvents: false,
  };
}

describe('evaluateCloseEligibility (A10/B6)', () => {
  test('eligible when SG=0, Acceptance=0, no open Events, not already Closed', () => {
    expect(evaluateCloseEligibility(baseInputs())).toEqual({ eligible: true, reasons: [] });
  });

  test('rootConfirmedBalance alone never blocks eligibility, even when non-zero (it is the write-off amount, not a gate)', () => {
    const result = evaluateCloseEligibility({ ...baseInputs(), rootConfirmedBalance: new Decimal(999999) });
    expect(result.eligible).toBe(true);
  });

  test('already CLOSED is rejected with its own reason', () => {
    const result = evaluateCloseEligibility({ ...baseInputs(), alreadyClosed: true });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['This LC/Confirmation has already been Closed.']);
  });

  test('non-zero SG Balance is rejected, quoting the current figure', () => {
    const result = evaluateCloseEligibility({ ...baseInputs(), sgConfirmedBalance: new Decimal(2000) });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['Shipping Guarantee Balance must be 0 (currently 2000) — redeem the Shipping Guarantee first (A9).']);
  });

  test('non-zero Acceptance Balance is rejected, quoting the current figure', () => {
    const result = evaluateCloseEligibility({ ...baseInputs(), acceptanceConfirmedBalance: new Decimal(8000) });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['Acceptance Balance must be 0 (currently 8000) — settle the Acceptance first (A7/B5).']);
  });

  test('open Events anywhere in the tree are rejected', () => {
    const result = evaluateCloseEligibility({ ...baseInputs(), hasOpenEvents: true });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['One or more Events under this LC (including child ledgers) are not yet fully resolved.']);
  });

  test('every failed condition is reported together, not just the first', () => {
    const result = evaluateCloseEligibility({
      alreadyClosed: false,
      rootConfirmedBalance: new Decimal(10000),
      sgConfirmedBalance: new Decimal(2000),
      acceptanceConfirmedBalance: new Decimal(8000),
      hasOpenEvents: true,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(3);
  });
});
