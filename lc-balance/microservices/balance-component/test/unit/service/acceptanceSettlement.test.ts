/**
 * assertAcceptanceSettlementAllowed (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §4.1/§8, P0) — the
 * new precondition PARTIAL_SETTLE/FULL_SETTLE runs against the Acceptance being settled (Import A7,
 * Export B5-到期結算; both share this exact check per v29 §4.2). These tests call
 * BalanceService.createMovement() DIRECTLY (bypassing routes/balanceMovements.ts's own Risk Containment
 * Gate, which is the layer that actually calls Standing) — createContract() only PERSISTS
 * contractualMaturityDate/operationalPaymentDate when the caller supplies them, so a test that needs an
 * APPROVED Acceptance supplies them directly on the CREATE request, same as the route would after
 * resolving them. See app.maturityDate.test.ts for the route-level (Standing-calling) behavior itself —
 * this file is purely about the Settlement precondition.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { InsufficientBalanceError } from '../../../src/errors';

const APPROVED_DATES = { contractualMaturityDate: '2026-12-25', operationalPaymentDate: '2026-12-28', standingCalculationId: 'calc-settle-1', calendarSnapshotId: 'snap-settle-1' };

/** Import A7 shape: LC ISSUE -> release -> UTILIZE -> release -> Acceptance CREATE (referencedTransactionId=UTILIZE, pre-resolved Maturity Date) -> release. Returns the RELEASED, APPROVED Acceptance contract. */
function buildApprovedAcceptance(service: BalanceService, lcNumber: string, amount = '10000') {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100000',
    currency: 'USD',
    expiryDate: '2030-12-31',
    tenorType: 'SELLERS_USANCE',
    tenorDays: 90,
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber })!;

  const utilize = service.createMovement({
    instrumentType: 'IPLC_LC',
    balanceContractId: lc.balanceContractId,
    movementType: 'UTILIZE',
    eventSeq: 2,
    amount,
    currency: 'USD',
    sourceTransactionRef: 'IB-01',
    createdBy: 'maker1',
  });
  if (!utilize.created) throw new Error('expected a new movement');
  service.release(utilize.movement.movementId, 'checker1');

  const acceptance = service.createMovement({
    instrumentType: 'IPLC_ACCEPTANCE',
    naturalKey: { lcNumber, ibNumber: 'IB-01' },
    parentLogicalContractId: lc.logicalContractId,
    movementType: 'CREATE',
    eventSeq: 1,
    amount,
    currency: 'USD',
    referencedTransactionId: utilize.movement.movementId,
    ...APPROVED_DATES,
    createdBy: 'maker1',
  });
  if (!acceptance.created) throw new Error('expected a new movement');
  service.release(acceptance.movement.movementId, 'checker1');

  return { acceptanceContract: service.resolveContract('IPLC_ACCEPTANCE', { lcNumber, ibNumber: 'IB-01' })!, utilizeMovementId: utilize.movement.movementId };
}

describe('assertAcceptanceSettlementAllowed — Import A7 (PARTIAL_SETTLE/FULL_SETTLE against IPLC_ACCEPTANCE)', () => {
  test('case 2: a fully RELEASED, APPROVED Acceptance with a RELEASED source UTILIZE — FULL_SETTLE allowed', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { acceptanceContract } = buildApprovedAcceptance(service, 'AS-001');

    const settle = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      balanceContractId: acceptanceContract.balanceContractId,
      movementType: 'FULL_SETTLE',
      eventSeq: 2,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(settle.created).toBe(true);
  });

  test('case 1: Acceptance CREATE still PENDING (not yet Released) — Settlement rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-002' })!;
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
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-002', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: utilize.movement.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    // Deliberately NOT released — confirmedBalance stays 0.

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InsufficientBalanceError);
  });

  test('case 5: confirmedBalance > 0 but maturityDateStatus still PENDING_BASE_DATE (no verified Base Date source) — Settlement rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-003' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
      // No tenorBasis/maturityDateCalendars — the Acceptance built under it stays PENDING_BASE_DATE forever.
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-003' })!;
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
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-003', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: utilize.movement.movementId,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.release(acceptance.movement.movementId, 'checker1');
    expect(service.resolveContract('IPLC_ACCEPTANCE', { lcNumber: 'AS-003', ibNumber: 'IB-01' })?.maturityDateStatus).toBe('PENDING_BASE_DATE');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InsufficientBalanceError);
  });

  test('referencedTransactionId points at a movementId that does not exist at all — fail-closed rejects', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-008' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-008' })!;
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-008', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: 'does-not-exist',
      ...APPROVED_DATES,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.release(acceptance.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/references a source movement that cannot be found/);
  });

  test('referencedTransactionId points at a RELEASED UTILIZE belonging to a DIFFERENT LC (currency mismatch) — fail-closed rejects', () => {
    const service = new BalanceService(createDb(':memory:'));
    // A second, unrelated EUR-denominated LC whose own UTILIZE is used as a mismatched reference below.
    const otherIssue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-009-OTHER' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'EUR',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!otherIssue.created) throw new Error('expected a new movement');
    service.release(otherIssue.movement.movementId, 'checker1');
    const otherLc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-009-OTHER' })!;
    const otherUtilize = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: otherLc.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 2,
      amount: '10000',
      currency: 'EUR',
      createdBy: 'maker1',
    });
    if (!otherUtilize.created) throw new Error('expected a new movement');
    service.release(otherUtilize.movement.movementId, 'checker1');

    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-009' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-009' })!;
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-009', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: otherUtilize.movement.movementId, // belongs to the unrelated EUR LC
      ...APPROVED_DATES,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.release(acceptance.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/Source movement currency does not match this Acceptance/);
  });

  test('case 8: Acceptance CREATE has no referencedTransactionId at all — fail-closed rejects (missing reference is never silently treated as "no check")', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-004' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-004' })!;
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-004', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      ...APPROVED_DATES,
      // No referencedTransactionId supplied at all.
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.release(acceptance.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/referencedTransactionId/);
  });

  test('case 7: referencedTransactionId points at a source UTILIZE that is still PENDING (not yet Released) — Settlement rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-005' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-005' })!;
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
    // Deliberately NOT released.
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-005', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: utilize.movement.movementId,
      ...APPROVED_DATES,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.release(acceptance.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/has not been Released yet/);
  });

  test('case 9: referencedTransactionId points at a RELEASED movement of the WRONG movementType (e.g. AMEND_INCREASE, not UTILIZE) — Settlement rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'AS-006' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const lc = service.resolveContract('IPLC_LC', { lcNumber: 'AS-006' })!;
    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_INCREASE',
      eventSeq: 2,
      amount: '5000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    service.release(amend.movement.movementId, 'checker1');
    const acceptance = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'AS-006', ibNumber: 'IB-01' },
      parentLogicalContractId: lc.logicalContractId,
      movementType: 'CREATE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      referencedTransactionId: amend.movement.movementId, // wrong type — should be UTILIZE
      ...APPROVED_DATES,
      createdBy: 'maker1',
    });
    if (!acceptance.created) throw new Error('expected a new movement');
    service.release(acceptance.movement.movementId, 'checker1');

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptance.movement.balanceContractId,
        movementType: 'FULL_SETTLE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/not an eligible Acceptance source/);
  });

  test('case 3: amount check still nets other still-PENDING Settlement on this same Acceptance (availableBalance, not confirmedBalance) — over-limit rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { acceptanceContract } = buildApprovedAcceptance(service, 'AS-007');

    const first = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      balanceContractId: acceptanceContract.balanceContractId,
      movementType: 'PARTIAL_SETTLE',
      eventSeq: 2,
      amount: '7000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(first.created).toBe(true); // still PENDING — not Released

    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        balanceContractId: acceptanceContract.balanceContractId,
        movementType: 'PARTIAL_SETTLE',
        eventSeq: 3,
        amount: '6000', // 7000 + 6000 = 13000 > 10000 outstanding
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(InsufficientBalanceError);
  });
});
