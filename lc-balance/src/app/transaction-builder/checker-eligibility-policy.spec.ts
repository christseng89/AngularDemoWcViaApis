import { BalanceMovement } from './balance-component-api.service';
import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS, TransactionFunction } from './balance-component.model';
import { isCheckerActionableMovement } from './checker-eligibility-policy';

const fn = (code: string): TransactionFunction => [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((item) => item.code === code)!;

function movement(patch: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'movement-1',
    balanceContractId: 'contract-1',
    movementType: 'UTILIZE',
    amount: '100',
    status: 'PENDING',
    createdAt: '2026-08-29T00:00:00Z',
    ...patch,
  } as BalanceMovement;
}

describe('isCheckerActionableMovement', () => {
  it('rejects non-pending movements', () => {
    expect(isCheckerActionableMovement(movement({ status: 'RELEASED' }), fn('A3'))).toBe(false);
  });

  it('rejects a movement type that the selected function could not create', () => {
    expect(isCheckerActionableMovement(movement({ movementType: 'UTILIZE' }), fn('A2'))).toBe(false);
  });

  it('keeps an unacknowledged A3 utilization actionable', () => {
    expect(isCheckerActionableMovement(movement(), fn('A3'))).toBe(true);
  });

  it('removes an acknowledged A3 utilization from the A3 Checker queue', () => {
    expect(isCheckerActionableMovement(movement({ acknowledgedAt: '2026-08-29T01:00:00Z' }), fn('A3'))).toBe(false);
  });

  it('requires both acknowledgment and Maker submission for A4', () => {
    expect(isCheckerActionableMovement(movement(), fn('A4'))).toBe(false);
    expect(isCheckerActionableMovement(movement({ acknowledgedAt: '2026-08-29T01:00:00Z' }), fn('A4'))).toBe(false);
    expect(
      isCheckerActionableMovement(
        movement({ acknowledgedAt: '2026-08-29T01:00:00Z', makerSubmittedAt: '2026-08-29T02:00:00Z' }),
        fn('A4'),
      ),
    ).toBe(true);
  });

  it('falls back to pending-only eligibility when no function is selected', () => {
    expect(isCheckerActionableMovement(movement({ movementType: 'ANY' }), null)).toBe(true);
  });
});
