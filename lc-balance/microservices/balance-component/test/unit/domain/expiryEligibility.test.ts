import { evaluateExpiryEligibility, isPastExpiryGrace } from '../../../src/domain/expiryEligibility';

describe('evaluateExpiryEligibility (AUTO EXPIRY, F1 external BA review §7.2)', () => {
  test('eligible when ACTIVE and no open Events', () => {
    expect(evaluateExpiryEligibility({ contractStatus: 'ACTIVE', hasOpenEvents: false })).toEqual({ eligible: true, reasons: [] });
  });

  test('non-ACTIVE status is rejected, quoting the current status', () => {
    const result = evaluateExpiryEligibility({ contractStatus: 'CLOSED', hasOpenEvents: false });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['This LC/Confirmation is not ACTIVE (current status: CLOSED) — only an ACTIVE contract can EXPIRE.']);
  });

  test('open Events anywhere in the tree are rejected', () => {
    const result = evaluateExpiryEligibility({ contractStatus: 'ACTIVE', hasOpenEvents: true });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['One or more Events under this LC (including child ledgers) are not yet fully resolved.']);
  });

  test('both failed conditions are reported together, not just the first', () => {
    const result = evaluateExpiryEligibility({ contractStatus: 'EXPIRED', hasOpenEvents: true });
    expect(result.eligible).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });

  // The whole point of BA §7.2's correction: unlike evaluateCloseEligibility(), this function has NO
  // SG/Acceptance-balance-zero condition at all — there is nothing in ExpiryEligibilityInputs to even
  // pass a non-zero balance through. This test exists to pin that structural fact so a future "helpful"
  // addition of such a check doesn't silently reintroduce the bug the BA review corrected.
  test('has no SG/Acceptance-balance condition — an ACTIVE contract with no open Events is eligible regardless of any outstanding child balance', () => {
    const result = evaluateExpiryEligibility({ contractStatus: 'ACTIVE', hasOpenEvents: false });
    expect(result.eligible).toBe(true);
  });
});

describe('isPastExpiryGrace (F1 external BA review) — expiryDate + mailFloatGraceDays date gate, NOT UCP 600 Art. 14(c)', () => {
  test('false when expiryDate is null/undefined — a contract with no recorded expiry date can never AUTO EXPIRE', () => {
    expect(isPastExpiryGrace(null, 5, new Date('2026-01-10'))).toBe(false);
    expect(isPastExpiryGrace(undefined, 5, new Date('2026-01-10'))).toBe(false);
  });

  test('false while still within the grace period', () => {
    expect(isPastExpiryGrace('2026-01-01', 5, new Date('2026-01-06T00:00:00Z'))).toBe(false);
  });

  test('false exactly at the grace boundary (not yet past it)', () => {
    expect(isPastExpiryGrace('2026-01-01T00:00:00Z', 5, new Date('2026-01-06T00:00:00Z'))).toBe(false);
  });

  test('true one millisecond past the grace boundary', () => {
    expect(isPastExpiryGrace('2026-01-01T00:00:00Z', 5, new Date('2026-01-06T00:00:00.001Z'))).toBe(true);
  });

  test('true well past the grace period', () => {
    expect(isPastExpiryGrace('2026-01-01', 5, new Date('2026-06-01'))).toBe(true);
  });

  test('zero grace days — past due the instant expiryDate itself passes', () => {
    expect(isPastExpiryGrace('2026-01-01T00:00:00Z', 0, new Date('2026-01-01T00:00:00Z'))).toBe(false);
    expect(isPastExpiryGrace('2026-01-01T00:00:00Z', 0, new Date('2026-01-01T00:00:00.001Z'))).toBe(true);
  });
});
