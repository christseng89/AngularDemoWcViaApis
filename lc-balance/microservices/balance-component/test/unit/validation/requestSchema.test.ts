/**
 * Direct unit tests for the zod schema itself (Quality-report-balance.md BAL-116) — separate from
 * app.test.ts's own HTTP-layer wiring tests for the same behavior, which prove the route actually
 * calls this schema; these prove the schema's own validation rules in isolation.
 */
import { createMovementRequestSchema, firstValidationMessage } from '../../../src/validation/requestSchema';

const VALID_BODY = {
  instrumentType: 'IPLC_LC',
  movementType: 'ISSUE',
  eventSeq: 1,
  amount: '100000',
  currency: 'USD',
  createdBy: 'maker1',
};

describe('createMovementRequestSchema', () => {
  test('accepts a minimal valid body', () => {
    const result = createMovementRequestSchema.safeParse(VALID_BODY);
    expect(result.success).toBe(true);
  });

  test('passes through fields not in the schema (naturalKey, tolerancePct, etc.) unchanged — .passthrough(), not stripped', () => {
    const body = { ...VALID_BODY, naturalKey: { lcNumber: 'S001' }, tolerancePct: '10', parentLogicalContractId: 'lct-1' };
    const result = createMovementRequestSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.naturalKey).toEqual({ lcNumber: 'S001' });
      expect(result.data.tolerancePct).toBe('10');
      expect(result.data.parentLogicalContractId).toBe('lct-1');
    }
  });

  test.each(['instrumentType', 'movementType', 'amount', 'createdBy'])('rejects a missing %s', (field) => {
    const body: Record<string, unknown> = { ...VALID_BODY };
    delete body[field];
    const result = createMovementRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test('accepts a missing currency — OAS-GAP-16 direction (a): optional at this layer, required only when BalanceService.resolveOrCreateContract() has nothing to derive it from', () => {
    const body: Record<string, unknown> = { ...VALID_BODY };
    delete body.currency;
    const result = createMovementRequestSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  test('rejects an empty-string currency (present but blank is still invalid, unlike genuinely absent)', () => {
    const result = createMovementRequestSchema.safeParse({ ...VALID_BODY, currency: '' });
    expect(result.success).toBe(false);
  });

  test('rejects a missing eventSeq', () => {
    const body: Record<string, unknown> = { ...VALID_BODY };
    delete body.eventSeq;
    const result = createMovementRequestSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  test('accepts eventSeq 0 (a real, meaningful value — not treated as "missing")', () => {
    const result = createMovementRequestSchema.safeParse({ ...VALID_BODY, eventSeq: 0 });
    expect(result.success).toBe(true);
  });

  test('rejects a non-numeric eventSeq', () => {
    const result = createMovementRequestSchema.safeParse({ ...VALID_BODY, eventSeq: '1' });
    expect(result.success).toBe(false);
  });

  test('rejects a malformed amount and reports the MonetaryAmount pattern violation', () => {
    const result = createMovementRequestSchema.safeParse({ ...VALID_BODY, amount: 'not-a-number' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstValidationMessage(result.error)).toMatch(/is not a valid MonetaryAmount/);
    }
  });

  test('rejects an amount with more decimal places than its currency allows, and reports the scale violation (not the pattern one)', () => {
    const result = createMovementRequestSchema.safeParse({ ...VALID_BODY, amount: '10000.50', currency: 'JPY' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstValidationMessage(result.error)).toMatch(/has 2 decimal place\(s\) but currency JPY allows at most 0/);
    }
  });

  test("accepts an amount at exactly its currency's allowed scale", () => {
    const result = createMovementRequestSchema.safeParse({ ...VALID_BODY, amount: '1000.125', currency: 'KWD' });
    expect(result.success).toBe(true);
  });
});

describe('firstValidationMessage', () => {
  test("returns the first issue's message when multiple fields are missing", () => {
    const result = createMovementRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof firstValidationMessage(result.error)).toBe('string');
      expect(firstValidationMessage(result.error).length).toBeGreaterThan(0);
    }
  });
});
