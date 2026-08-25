/**
 * Server-side backstop for the "Amount must be greater than 0" business requirement (2026-08-19,
 * "A1-A9, B1-B5 Amount figure should > 0") — user-reported gap 2026-08-21 ("SUBMIT & RELEASE API 也要有
 * 交易金額控制檢查"): confirmed live via a direct `POST /balance-movements` that `amount: "0"` and
 * `amount: "-5000"` were both silently accepted for a plain ISSUE before this fix, since the ONLY guard
 * against this lived in submit-rules.ts on the Angular side — trivially bypassed by any caller that
 * isn't that UI. See BalanceService.assertValidAmount()'s own doc comment for the AMEND/CLOSE exceptions.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { RequestValidationError } from '../../../src/errors';

function issueImportLc(service: BalanceService, lcNumber: string, amount = '10000') {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount,
    currency: 'USD',
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

describe('BalanceService — server-side amount validation (createMovement)', () => {
  test('rejects a zero amount for a plain ISSUE (the exact live-reproduced gap)', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'AMT-ZERO-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
  });

  test('rejects a negative amount for a plain ISSUE (the exact live-reproduced gap)', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'AMT-NEG-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '-5000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
  });

  test('a rejected zero/negative ISSUE never leaves an orphaned BalanceContract row behind — the SAME natural key can still legitimately ISSUE afterward', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'AMT-ORPHAN-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);

    const retry = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AMT-ORPHAN-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(retry.created).toBe(true);
  });

  test('accepts a genuinely positive amount for ISSUE (sanity — the guard is not over-broad)', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => issueImportLc(service, 'AMT-OK-001')).not.toThrow();
  });

  test('rejects zero/negative for AMEND_DECREASE (A2 — a distinct movementType, always a positive magnitude, unlike B2 below)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMT-A2-001');
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 3,
        amount: '-500',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
  });

  function issueConfirmation(service: BalanceService, lcNumber: string, amount = '10000') {
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount,
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');
    return confirmation;
  }

  test('AMEND (B2) is exempted from the sign check — a legitimate negative wire amount (Decrease direction) is accepted', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'AMT-B2-DEC-001');
    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'AMEND',
        eventSeq: 2,
        amount: '-2000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).not.toThrow();
  });

  test('AMEND (B2) still rejects an exact zero — Direction requires a genuine nonzero sign', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'AMT-B2-ZERO-001');
    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'AMEND',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
  });

  test('CLOSE (A10) is exempted from the >0 check — a genuinely 0 write-off is accepted (fully-utilized LC)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMT-CLOSE-ZERO-001', '10000');
    // Draw the LC fully down to 0 first, via UTILIZE, so a 0 Close amount is actually correct.
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

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 3,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_CLOSE_REASON',
      }),
    ).not.toThrow();
  });

  test('CLOSE (A10) still rejects a negative amount — a write-off can never be negative', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'AMT-CLOSE-NEG-001');
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '-1',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_CLOSE_REASON',
      }),
    ).toThrow(RequestValidationError);
  });
});
