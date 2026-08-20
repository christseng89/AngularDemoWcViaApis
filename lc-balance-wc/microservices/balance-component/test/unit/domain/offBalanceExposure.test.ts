import Decimal from 'decimal.js';
import {
  checkPresentDocsIssueSufficiency,
  checkShgtIssueSufficiency,
  checkUtilizeSufficiency,
  computeOffBalanceExposure,
  computePresentDocsEarmark,
  computePresentDocsEarmarkApproved,
  computePresentDocsEarmarkPending,
} from '../../../src/domain/offBalanceExposure';
import type { BalanceMovement } from '../../../src/types';
import { assertFailed } from '../helpers/assertFailed';

type M = Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>;
type Exam = Pick<BalanceMovement, 'movementId' | 'movementType' | 'ceilingAmount' | 'status' | 'presentDocsConsumedAt'>;

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

describe('Present Docs Earmark (§6.1; basis changed 2026-08-18, "所有交易要RELEASE過後 才能根據流程走下一個交易" — B3 now genuinely RELEASEs on its own, and stays counted until presentDocsConsumedAt) — computePresentDocsEarmark / Pending / Approved', () => {
  test('computePresentDocsEarmark sums PENDING and RELEASED-but-not-yet-consumed CREATEs (Pending + Approved combined) — a consumed one drops out entirely', () => {
    const exam: Exam[] = [
      { movementId: 'e1', movementType: 'CREATE', ceilingAmount: '50000', status: 'PENDING', presentDocsConsumedAt: null },
      { movementId: 'e2', movementType: 'CREATE', ceilingAmount: '70000', status: 'RELEASED', presentDocsConsumedAt: null },
      { movementId: 'e3', movementType: 'CREATE', ceilingAmount: '999999', status: 'RELEASED', presentDocsConsumedAt: '2026-08-18T00:00:00Z' },
    ];
    expect(computePresentDocsEarmark(exam).toFixed()).toBe('120000');
  });

  test('computePresentDocsEarmarkPending sums only still-PENDING (not yet Released) CREATEs', () => {
    const exam: Exam[] = [
      { movementId: 'e1', movementType: 'CREATE', ceilingAmount: '50000', status: 'PENDING', presentDocsConsumedAt: null },
      { movementId: 'e2', movementType: 'CREATE', ceilingAmount: '70000', status: 'RELEASED', presentDocsConsumedAt: null },
    ];
    expect(computePresentDocsEarmarkPending(exam).toFixed()).toBe('50000');
  });

  test('computePresentDocsEarmarkApproved sums only RELEASED CREATEs not yet consumed by B4', () => {
    const exam: Exam[] = [
      { movementId: 'e1', movementType: 'CREATE', ceilingAmount: '50000', status: 'PENDING', presentDocsConsumedAt: null },
      { movementId: 'e2', movementType: 'CREATE', ceilingAmount: '70000', status: 'RELEASED', presentDocsConsumedAt: null },
      { movementId: 'e3', movementType: 'CREATE', ceilingAmount: '999999', status: 'RELEASED', presentDocsConsumedAt: '2026-08-18T00:00:00Z' },
    ];
    expect(computePresentDocsEarmarkApproved(exam).toFixed()).toBe('70000');
  });

  test('defensive guard: sumExaminationCreates (shared by all three functions above) throws on a movementType other than CREATE — EPLC_EXAMINATION only ever has CREATE movements', () => {
    const exam: Exam[] = [{ movementId: 'e1', movementType: 'AMEND', ceilingAmount: '1000', status: 'PENDING', presentDocsConsumedAt: null } as Exam];
    expect(() => computePresentDocsEarmark(exam)).toThrow(/unexpected EPLC_EXAMINATION movementType "AMEND"/);
  });
});

describe('checkUtilizeSufficiency (Design doc §6.1, hardened v0.12: two-way ERROR/OK check — the tight-threshold branch was a non-blocking WARNING through v0.10/v0.11; business instruction 2026-08-20: the tight threshold is now Confirmed Balance, not Available Balance, minus still-PENDING decreases minus exposure — "只有APPROVED才可以動用")', () => {
  test('OK: within both thresholds', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('50000'),
      availableBalance: new Decimal('121000'),
      confirmedBalance: new Decimal('121000'),
      pendingDecreaseTotal: new Decimal('0'),
      offBalanceExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(true);
  });

  test('ERROR: exceeds tight threshold but not Available Balance itself (Case 4) — v0.12 hardened this from WARNING to a hard reject', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('50000'),
      availableBalance: new Decimal('121000'),
      confirmedBalance: new Decimal('121000'),
      pendingDecreaseTotal: new Decimal('0'),
      offBalanceExposure: new Decimal('100000'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds Tight Available Balance 21000/);
    expect(result.error).toMatch(/Document Arrival w\/ Shipping Gtee/);
  });

  test('ERROR: exceeds Available Balance itself, regardless of off-balance exposure', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('200000'),
      availableBalance: new Decimal('121000'),
      confirmedBalance: new Decimal('121000'),
      pendingDecreaseTotal: new Decimal('0'),
      offBalanceExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds Available Balance/);
  });

  test('boundary: exact match on the tight threshold is OK', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('21000'),
      availableBalance: new Decimal('121000'),
      confirmedBalance: new Decimal('121000'),
      pendingDecreaseTotal: new Decimal('0'),
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
      confirmedBalance: new Decimal('121000'),
      pendingDecreaseTotal: new Decimal('0'),
      offBalanceExposure: new Decimal('0'), // the matched SG's 100,000 already netted out by the caller
    });
    expect(result.ok).toBe(true);
  });

  test('ERROR: a still-PENDING (not yet Approved) ISSUE/AMEND_INCREASE inflates Available but not Confirmed — Tight Available Balance stays at Confirmed, so a draw against the not-yet-approved increase is rejected ("A1/A2 Submit -> A4 不可使用, APPROVE後才可以動用")', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('10'),
      availableBalance: new Decimal('10'), // a fresh A1 ISSUE, still PENDING, already counted here
      confirmedBalance: new Decimal('0'), // ...but not yet Released, so Confirmed is still 0
      pendingDecreaseTotal: new Decimal('0'),
      offBalanceExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds Tight Available Balance 0/);
  });

  test('ERROR: a still-PENDING AMEND_DECREASE ("占用從寬") occupies Tight Available Balance immediately even though Confirmed itself has not moved yet, while a separate still-PENDING AMEND_INCREASE on the same contract inflates Available but is correctly ignored by the tight threshold', () => {
    const result = checkUtilizeSufficiency({
      requestedAmount: new Decimal('80001'),
      availableBalance: new Decimal('130000'), // 100000 Confirmed + 50000 still-PENDING increase - 20000 still-PENDING decrease
      confirmedBalance: new Decimal('100000'),
      pendingDecreaseTotal: new Decimal('20000'), // only the decrease side, never netted against the increase
      offBalanceExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds Tight Available Balance 80000/);
    expect(result.error).toMatch(/Confirmed Balance 100000 minus 20000 still-PENDING decrease/);
  });
});

// desiger-comments.md F-02 — extracted from BalanceService.createMovement()'s own inline "creating a
// new contract" branch (2026-08-19), pure code motion. Direct unit coverage added here since the
// pre-existing indirect coverage (balanceService.test.ts / app.test.ts's own "SG Issue amount..."
// HTTP-integration assertions) already proves the extraction preserved behavior, but never isolated
// this function's own math the way this file's siblings above already do.
describe('checkShgtIssueSufficiency (business instruction 2026-08-14, v0.11 nets existing SG exposure first; business instruction 2026-08-20: base is Confirmed Balance minus still-PENDING decreases, not Available)', () => {
  test('OK: within the Tight Available Balance', () => {
    const result = checkShgtIssueSufficiency({
      requestedAmount: new Decimal('3000'),
      parentConfirmedBalance: new Decimal('3000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      existingShgtExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(true);
  });

  test('boundary: exact match on the Tight Available Balance is OK', () => {
    const result = checkShgtIssueSufficiency({
      requestedAmount: new Decimal('3000'),
      parentConfirmedBalance: new Decimal('5000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      existingShgtExposure: new Decimal('2000'),
    });
    expect(result.ok).toBe(true);
  });

  test('ERROR: exceeds the Tight Available Balance once existing SG exposure is netted out (v0.11, "two overlapping SG issuances... could each individually pass")', () => {
    const result = checkShgtIssueSufficiency({
      requestedAmount: new Decimal('3001'),
      parentConfirmedBalance: new Decimal('3000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      existingShgtExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/SG Issue amount 3001 exceeds parent LC's Tight Available Balance 3000/);
    expect(result.error).toMatch(/Confirmed Balance 3000 minus 0 still-PENDING decrease/);
  });

  test('ERROR: two overlapping SG issuances against the same LC — the second one is rejected once the first is netted in as existingShgtExposure', () => {
    const result = checkShgtIssueSufficiency({
      requestedAmount: new Decimal('90000'),
      parentConfirmedBalance: new Decimal('100000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      existingShgtExposure: new Decimal('90000'), // the first SG, already outstanding
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds parent LC's Tight Available Balance 10000/);
  });

  test('ERROR: a still-PENDING (not yet Approved) parent LC AMEND_INCREASE does not raise the Tight threshold ("增加從嚴")', () => {
    const result = checkShgtIssueSufficiency({
      requestedAmount: new Decimal('3001'),
      parentConfirmedBalance: new Decimal('3000'), // the parent's own PENDING increase is NOT reflected here
      parentPendingDecreaseTotal: new Decimal('0'),
      existingShgtExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
  });

  test('ERROR: a still-PENDING parent LC AMEND_DECREASE occupies the Tight threshold immediately ("占用從寬")', () => {
    const result = checkShgtIssueSufficiency({
      requestedAmount: new Decimal('2001'),
      parentConfirmedBalance: new Decimal('3000'),
      parentPendingDecreaseTotal: new Decimal('1000'), // still-PENDING, not yet Approved
      existingShgtExposure: new Decimal('0'),
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds parent LC's Tight Available Balance 2000/);
  });
});

describe('checkPresentDocsIssueSufficiency (business-reported gap 2026-08-15, "B3 沒檢查到單金額超過 Balance餘額", hardened same day to a running Present Earmark check; business instruction 2026-08-20: base is Confirmed Balance minus still-PENDING decreases, not Available)', () => {
  test('OK: within the Present-Earmark-adjusted Tight Available Balance', () => {
    const result = checkPresentDocsIssueSufficiency({
      requestedAmount: new Decimal('50000'),
      parentConfirmedBalance: new Decimal('100000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      presentDocsEarmark: new Decimal('0'),
      parentConfirmationBalanceContractId: 'bc-1',
    });
    expect(result.ok).toBe(true);
  });

  test('boundary: exact match on the earmark-adjusted threshold is OK', () => {
    const result = checkPresentDocsIssueSufficiency({
      requestedAmount: new Decimal('30000'),
      parentConfirmedBalance: new Decimal('100000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      presentDocsEarmark: new Decimal('70000'),
      parentConfirmationBalanceContractId: 'bc-1',
    });
    expect(result.ok).toBe(true);
  });

  test('ERROR: exceeds the earmark-adjusted Tight Available Balance — reproduces the reported E01(50k)+E02(70k)+E03(100k) SUM-never-checked gap', () => {
    const result = checkPresentDocsIssueSufficiency({
      requestedAmount: new Decimal('100000'),
      parentConfirmedBalance: new Decimal('100000'),
      parentPendingDecreaseTotal: new Decimal('0'),
      presentDocsEarmark: new Decimal('120000'), // E01 + E02 already outstanding
      parentConfirmationBalanceContractId: 'bc-conf-1',
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/Present Docs amount 100000 exceeds the parent Confirmation's Present Earmark-adjusted Tight Available Balance -20000/);
    expect(result.error).toMatch(/balanceContractId bc-conf-1/);
  });

  test('ERROR: a still-PENDING parent Confirmation AMEND (Decrease direction) occupies the Tight threshold immediately ("占用從寬")', () => {
    const result = checkPresentDocsIssueSufficiency({
      requestedAmount: new Decimal('80001'),
      parentConfirmedBalance: new Decimal('100000'),
      parentPendingDecreaseTotal: new Decimal('20000'), // still-PENDING B2 Decrease, not yet Approved
      presentDocsEarmark: new Decimal('0'),
      parentConfirmationBalanceContractId: 'bc-1',
    });
    expect(result.ok).toBe(false);
    assertFailed(result);
    expect(result.error).toMatch(/exceeds the parent Confirmation's Present Earmark-adjusted Tight Available Balance 80000/);
  });
});
