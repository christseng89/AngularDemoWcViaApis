/**
 * BalanceService.createMovement()'s new server-side enforcement of resolveExportSettlementRoute()
 * (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §3.2/§8) — B4's own HONOUR/ACCEPT routing is decided
 * client-side today with no server-side check; this is the new check, soft-rolled-out (only fires when
 * the Confirmation actually has a tenorBasis on file, so it never breaks a pre-existing B4 flow).
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { RequestValidationError } from '../../../src/errors';

function issueConfirmation(service: BalanceService, lcNumber: string, extra: Record<string, unknown> = {}) {
  const issue = service.createMovement({
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '100000',
    currency: 'USD',
    expiryDate: '2030-12-31',
    createdBy: 'maker1',
    ...extra,
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  return service.resolveContract('EPLC_CONFIRMATION', { lcNumber })!;
}

describe('createMovement() — B4 settlement route enforcement (soft-rolled-out on tenorBasis opt-in)', () => {
  test('no tenorBasis on file (the pre-existing corpus): completely unaffected, any movementType accepted without a route check', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'ESR-001', { tenorType: 'SIGHT', tenorDays: 0 });

    const honour = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: confirmation.balanceContractId,
      movementType: 'HONOUR',
      eventSeq: 2,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(honour.created).toBe(true);
  });

  test('tenorBasis=AFTER_SIGHT + tenorType=BUYERS_USANCE (Export Sight, Import financed): resolves to HONOUR, HONOUR is accepted', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'ESR-002', { tenorType: 'BUYERS_USANCE', tenorDays: 90, tenorBasis: 'AFTER_SIGHT' });

    const honour = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: confirmation.balanceContractId,
      movementType: 'HONOUR',
      eventSeq: 2,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(honour.created).toBe(true);
  });

  test('tenorBasis=AFTER_SIGHT + tenorType=BUYERS_USANCE: requesting ACCEPT instead of the resolved HONOUR is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'ESR-003', { tenorType: 'BUYERS_USANCE', tenorDays: 90, tenorBasis: 'AFTER_SIGHT' });

    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'ACCEPT',
        eventSeq: 2,
        amount: '100000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/does not match this Confirmation's own resolved settlement route/);
  });

  test('tenorBasis=AFTER_BL_DATE + tenorType=SELLERS_USANCE: resolves to ACCEPTANCE, ACCEPT is accepted', () => {
    const service = new BalanceService(createDb(':memory:'));
    const confirmation = issueConfirmation(service, 'ESR-004', { tenorType: 'SELLERS_USANCE', tenorDays: 90, tenorBasis: 'AFTER_BL_DATE' });

    const accept = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: confirmation.balanceContractId,
      movementType: 'ACCEPT',
      eventSeq: 2,
      amount: '100000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    expect(accept.created).toBe(true);
  });

  test('tenorType=DP with a tenorBasis on file: MANUAL_REVIEW_REQUIRED — rejected outright, never silently routed to ACCEPT/HONOUR', () => {
    const service = new BalanceService(createDb(':memory:'));
    // DP/DA aren't blocked by validateTenorBasisTypeCombination() (no defined tenorBasis relationship yet) —
    // this contract carries a tenorBasis to exercise resolveExportSettlementRoute()'s own DP/DA branch.
    const confirmation = issueConfirmation(service, 'ESR-005', { tenorType: 'DP', tenorDays: 30, tenorBasis: 'AFTER_BL_DATE' });

    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: confirmation.balanceContractId,
        movementType: 'ACCEPT',
        eventSeq: 2,
        amount: '100000',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(RequestValidationError);
  });
});
