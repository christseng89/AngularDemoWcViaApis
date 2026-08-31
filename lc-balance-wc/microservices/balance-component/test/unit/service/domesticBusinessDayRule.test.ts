/**
 * User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... 加一道檢查FOR A1 B1... UI API都需要")
 * — dedicated Maker+Checker coverage for `assertExpiryDateIsBusinessDay()`, scoped identically to
 * `assertExpiryDateRequired()` (ISSUE against a root instrumentType only): see domesticCalendar.ts for
 * the underlying calendar data/rules exercised here at the unit level.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { RequestValidationError } from '../../../src/errors';

describe('Expiry Date must be a genuine domestic business day at ISSUE (Maker/createMovement)', () => {
  test('rejects a known public holiday', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BIZDAY-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2026-01-01', // 元旦
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      }),
    ).toThrow(/expiryDate 2026-01-01 falls on a domestic non-business day \(元旦\)/);
  });

  test('rejects a Saturday/Sunday with no matching holiday', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BIZDAY-002' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2026-01-03', // Saturday
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      }),
    ).toThrow(/expiryDate 2026-01-03 falls on a domestic non-business day \(Saturday\/Sunday\)/);
  });

  test('accepts a genuine business day', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BIZDAY-003' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2026-01-08', // Thursday, no holiday
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      }),
    ).not.toThrow();
  });

  test('does not apply to a non-ISSUE movementType (e.g. an Amendment carrying a newExpiryDate through a different field)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BIZDAY-004' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2026-06-01',
      tenorType: 'SIGHT',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    // AMEND_EXPIRY_DATE's own newExpiryDate is a different field (req.expiryDate is untouched here) —
    // this rule is scoped to ISSUE only, same as assertExpiryDateRequired(). newExpiryDate '2027-01-01'
    // is itself a holiday (元旦) too, but that's irrelevant — proves THIS rule never even looks at it.
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'AMEND_EXPIRY_DATE',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        newExpiryDate: '2027-01-01',
        businessDate: '2026-01-01',
        sourceTransactionRef: 'BIZDAY-004-AMEND-1',
        createdBy: 'maker1',
      }),
    ).not.toThrow();
  });

  test('does not apply to a non-root instrumentType', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = (() => {
      const issue = service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BIZDAY-005' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2026-06-01',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      });
      if (!issue.created) throw new Error('expected a new movement');
      service.release(issue.movement.movementId, 'checker1');
      return service.resolveContract('IPLC_LC', { lcNumber: 'BIZDAY-005' })!;
    })();

    // SHGT has no expiryDate concept of its own — req.expiryDate would be undefined here regardless, but
    // this also confirms the ROOT_INSTRUMENT_TYPES gate itself (a SHGT ISSUE is structurally never
    // checked even if a caller somehow supplied one).
    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'BIZDAY-005', sgNumber: 'SG01' },
        parentLogicalContractId: lc.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        expiryDate: '2026-01-01',
        createdBy: 'maker1',
      }),
    ).not.toThrow(RequestValidationError);
  });
});

describe('Checker release() re-checks Expiry Date business-day eligibility, defense-in-depth (F1)', () => {
  test('rejects Release when the persisted contract expiryDate was bypassed onto a public holiday between Submit and Release', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BIZDAY-BYPASS-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2026-06-01', // valid at Submit time
      tenorType: 'SIGHT',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    // No real path can do this (createMovement() itself already rejects a bad expiryDate) — same
    // "bypass the guarded path" technique this codebase already uses for its other release()-time
    // defense-in-depth re-checks (see mandatoryFieldRules.test.ts).
    db.exec(`UPDATE balance_contracts SET expiry_date = '2026-01-01' WHERE balance_contract_id = '${issue.movement.balanceContractId}'`);

    expect(() => service.release(issue.movement.movementId, 'checker1')).toThrow(
      /expiryDate 2026-01-01 falls on a domestic non-business day \(元旦\)/,
    );
  });

  test('release() is unaffected when the persisted expiryDate is a genuine business day', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BIZDAY-BYPASS-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2026-06-01',
      tenorType: 'SIGHT',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    expect(() => service.release(issue.movement.movementId, 'checker1')).not.toThrow();
  });
});
