import Decimal from 'decimal.js';
import {
  checkUtilizeSufficiency,
  computeOffBalanceExposure,
  computePresentDocsEarmark,
  computePresentDocsEarmarkApproved,
  computePresentDocsEarmarkPending,
} from '../../../src/domain/offBalanceExposure';
import type { BalanceMovement } from '../../../src/types';

type M = Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>;
type Exam = Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status' | 'acknowledgedAt'>;

describe('computeOffBalanceExposure (Design doc §6.1)', () => {
  test('nets PENDING+RELEASED SHGT ISSUE against PARTIAL_REDEEM/FULL_REDEEM (v0.6)', () => {
    const shgt: M[] = [
      { movementType: 'ISSUE', ceilingAmount: '100000', status: 'RELEASED' },
      { movementType: 'PARTIAL_REDEEM', ceilingAmount: '30000', status: 'RELEASED' },
      { movementType: 'ISSUE', ceilingAmount: '10000', status: 'PENDING' },
    ];
    expect(computeOffBalanceExposure(shgt).toFixed()).toBe('80000');
  });

  test('FULL_REDEEM also nets against ISSUE', () => {
    const shgt: M[] = [
      { movementType: 'ISSUE', ceilingAmount: '50000', status: 'RELEASED' },
      { movementType: 'FULL_REDEEM', ceilingAmount: '50000', status: 'RELEASED' },
    ];
    expect(computeOffBalanceExposure(shgt).toFixed()).toBe('0');
  });

  test('ignores CANCELLED/REJECTED/SUPERSEDED SHGT movements', () => {
    const shgt: M[] = [
      { movementType: 'ISSUE', ceilingAmount: '100000', status: 'RELEASED' },
      { movementType: 'ISSUE', ceilingAmount: '999999', status: 'CANCELLED' },
    ];
    expect(computeOffBalanceExposure(shgt).toFixed()).toBe('100000');
  });

  test("defensive guard: throws on a movementType that is not ISSUE/PARTIAL_REDEEM/FULL_REDEEM — the caller is responsible for pre-filtering to one SHGT logical contract's own movements, but this function still refuses to silently ignore an unexpected shape", () => {
    const shgt: M[] = [{ movementType: 'AMEND', ceilingAmount: '1000', status: 'RELEASED' } as M];
    expect(() => computeOffBalanceExposure(shgt)).toThrow(/unexpected SHGT movementType "AMEND"/);
  });
});

describe('Present Docs Earmark (§6.1, business instruction 2026-08-15) — computePresentDocsEarmark / Pending / Approved', () => {
  test('computePresentDocsEarmark sums only PENDING EPLC_EXAMINATION CREATEs (Pending + Approved combined, since B3 acknowledgment never flips status)', () => {
    const exam: Exam[] = [
      { movementType: 'CREATE', ceilingAmount: '50000', status: 'PENDING', acknowledgedAt: null },
      { movementType: 'CREATE', ceilingAmount: '70000', status: 'PENDING', acknowledgedAt: '2026-08-15T00:00:00Z' },
      { movementType: 'CREATE', ceilingAmount: '999999', status: 'RELEASED', acknowledgedAt: null },
    ];
    expect(computePresentDocsEarmark(exam).toFixed()).toBe('120000');
  });

  test('computePresentDocsEarmarkPending sums only still-unacknowledged PENDING CREATEs', () => {
    const exam: Exam[] = [
      { movementType: 'CREATE', ceilingAmount: '50000', status: 'PENDING', acknowledgedAt: null },
      { movementType: 'CREATE', ceilingAmount: '70000', status: 'PENDING', acknowledgedAt: '2026-08-15T00:00:00Z' },
    ];
    expect(computePresentDocsEarmarkPending(exam).toFixed()).toBe('50000');
  });

  test('computePresentDocsEarmarkApproved sums only Checker-acknowledged (still PENDING) CREATEs', () => {
    const exam: Exam[] = [
      { movementType: 'CREATE', ceilingAmount: '50000', status: 'PENDING', acknowledgedAt: null },
      { movementType: 'CREATE', ceilingAmount: '70000', status: 'PENDING', acknowledgedAt: '2026-08-15T00:00:00Z' },
    ];
    expect(computePresentDocsEarmarkApproved(exam).toFixed()).toBe('70000');
  });

  test('defensive guard: sumExaminationCreates (shared by all three functions above) throws on a movementType other than CREATE — EPLC_EXAMINATION only ever has CREATE movements', () => {
    const exam: Exam[] = [{ movementType: 'AMEND', ceilingAmount: '1000', status: 'PENDING', acknowledgedAt: null } as Exam];
    expect(() => computePresentDocsEarmark(exam)).toThrow(/unexpected EPLC_EXAMINATION movementType "AMEND"/);
  });
});

describe('checkUtilizeSufficiency (Design doc §6.1, hardened v0.12: two-way ERROR/OK check — the tight-threshold branch was a non-blocking WARNING through v0.10/v0.11)', () => {
  test('OK: within both thresholds', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('50000'),
      availableBalance: new Decimal('121000'),
      offBalanceExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(true);
  });

  test('ERROR: exceeds tight threshold but not Available Balance itself (Case 4) — v0.12 hardened this from WARNING to a hard reject', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('50000'),
      availableBalance: new Decimal('121000'),
      offBalanceExposure: new Decimal('100000'),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds Tight Available Balance 21000/);
    expect(result.error).toMatch(/Document Arrival w\/ Shipping Gtee/);
  });

  test('ERROR: exceeds Available Balance itself, regardless of off-balance exposure', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('200000'),
      availableBalance: new Decimal('121000'),
      offBalanceExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/exceeds Available Balance/);
  });

  test('boundary: exact match on the tight threshold is OK', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('21000'),
      availableBalance: new Decimal('121000'),
      offBalanceExposure: new Decimal('100000'),
    });
    expect(result.ok).toBe(true);
  });

  test('the netting trick "Document Arrival w/ Shipping Gtee" relies on: a PENDING (not yet Released) redemption already reduces offBalanceExposure passed in here, so a fully-matched arrival sees 0 exposure and passes', () => {
    // Mirrors computeOffBalanceExposure() counting PENDING same as RELEASED — this test only proves
    // checkUtilizeSufficiency's own math given that already-netted figure; the netting itself is
    // computeOffBalanceExposure's job (see its own describe block above).
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('100000'),
      availableBalance: new Decimal('121000'),
      offBalanceExposure: new Decimal('0'), // the matched SG's 100,000 already netted out by the caller
    });
    expect(result.ok).toBe(true);
  });
});
