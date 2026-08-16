/**
 * Direct BalanceService unit tests — bypasses routes/balanceMovements.ts entirely (no HTTP/supertest),
 * proving the invariant money.ts's own doc comment states ("the only place in the service allowed to
 * construct a Decimal from a wire string") actually holds at the service layer, not just at the HTTP
 * boundary. Quality-report-balance.md BAL-115: three call sites in createMovement() used to construct
 * `new Decimal(req.amount)` directly, bypassing parseMonetaryAmount()'s own MONETARY_AMOUNT_PATTERN
 * check — invisible when only exercised via app.test.ts's HTTP-integration tests, since
 * routes/balanceMovements.ts now validates the amount's shape before ever calling createMovement(). A
 * caller that constructs a BalanceService directly (as these tests do, and as any future non-HTTP
 * caller would) skips that route-level check entirely, so the invariant needs its own, separate proof.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { InvalidMonetaryAmountError } from '../../../src/money';

describe('BalanceService.createMovement — parseMonetaryAmount enforcement at the service layer (BAL-115)', () => {
  test('AMEND_DECREASE with a malformed amount throws InvalidMonetaryAmountError, not a silent NaN comparison', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BAL115-AD-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: 'not-a-number',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InvalidMonetaryAmountError);
  });

  test('SHGT ISSUE (SG Issue vs. parent LC Tight Available Balance check) with a malformed amount throws InvalidMonetaryAmountError', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BAL115-SG-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'BAL115-SG-001' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');

    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'BAL115-SG-001', sgNumber: 'SG01' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: 'garbage',
        currency: 'USD',
        parentLogicalContractId: lc.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(InvalidMonetaryAmountError);
  });

  test('EPLC_EXAMINATION CREATE (Present Docs earmark check vs. parent Confirmation) with a malformed amount throws InvalidMonetaryAmountError', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'BAL115-PD-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber: 'BAL115-PD-001' });
    if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');

    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'BAL115-PD-001', ibNumber: 'EB01' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: 'nope',
        currency: 'USD',
        parentLogicalContractId: confirmation.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(InvalidMonetaryAmountError);
  });
});

/**
 * Bug fixed 2026-08-16, reviewer-reported ("A1 -> A8 -> A3S -> A4, the related SG entries was not
 * shown"): a Checker session independent of the Maker's own in-memory submitResult had no way to
 * resolve A3S's own linked SG redemption movement, so it silently never got released — see
 * BalanceMovementStore.findByBusinessEventId's own doc comment for the full root cause.
 */
describe('BalanceService.findByBusinessEventId', () => {
  test('returns every movement sharing a businessEventId, across different contracts, oldest first', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lcIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'BEID-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!lcIssue.created) throw new Error('expected a new movement');
    service.release(lcIssue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'BEID-001' });
    if (!lc) throw new Error('expected the just-issued LC to resolve');
    const sgIssue = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'BEID-001', sgNumber: 'SG01' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '20000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      createdBy: 'maker1',
    });
    if (!sgIssue.created) throw new Error('expected a new movement');
    service.release(sgIssue.movement.movementId, 'checker1');

    const businessEventId = '11111111-1111-1111-1111-111111111111';
    const sgRedeem = service.createMovement({
      instrumentType: 'SHGT',
      balanceContractId: sgIssue.movement.balanceContractId,
      movementType: 'FULL_REDEEM',
      eventSeq: 2,
      amount: '20000',
      currency: 'USD',
      businessEventId,
      createdBy: 'maker1',
    });
    if (!sgRedeem.created) throw new Error('expected a new movement');
    const lcUtilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '20000',
      currency: 'USD',
      businessEventId,
      createdBy: 'maker1',
    });
    if (!lcUtilize.created) throw new Error('expected a new movement');

    const linked = service.findByBusinessEventId(businessEventId);

    expect(linked.map((m) => m.movementId)).toEqual([sgRedeem.movement.movementId, lcUtilize.movement.movementId]);
    expect(linked.map((m) => m.movementType)).toEqual(['FULL_REDEEM', 'UTILIZE']);
    // The LC's own earlier ISSUE (no businessEventId) and the SG's own ISSUE are NOT included.
    expect(linked.every((m) => m.movementType !== 'ISSUE')).toBe(true);
  });

  test('returns an empty array for a businessEventId no movement carries', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(service.findByBusinessEventId('99999999-9999-9999-9999-999999999999')).toEqual([]);
  });
});
