import { computeAvailableBalance, computeConfirmedBalance, computeFaceAmount } from '../../../src/domain/balanceDerivation';
import type { BalanceMovement } from '../../../src/types';

type M = Pick<BalanceMovement, 'movementId' | 'movementType' | 'amount' | 'ceilingAmount' | 'status' | 'reversalOfMovementId'>;

let nextId = 0;
function m(movementType: string, amount: string, ceilingAmount: string, status: BalanceMovement['status'], reversalOfMovementId: string | null = null): M {
  return { movementId: `m${nextId++}`, movementType, amount, ceilingAmount, status, reversalOfMovementId };
}

describe('computeConfirmedBalance (Design doc §3.3)', () => {
  test('sums only RELEASED movements, signed by MOVEMENT_DIRECTION', () => {
    const movements: M[] = [
      m('ISSUE', '100000', '110000', 'RELEASED'),
      m('UTILIZE', '50000', '50000', 'RELEASED'),
      m('UTILIZE', '20000', '20000', 'PENDING'), // excluded — not RELEASED
    ];
    expect(computeConfirmedBalance(movements).toFixed()).toBe('60000');
  });

  test('throws on an unrecognized movementType rather than silently treating it as zero-effect', () => {
    const movements: M[] = [m('SOME_UNKNOWN_TYPE', '1', '1', 'RELEASED')];
    expect(() => computeConfirmedBalance(movements)).toThrow(/MOVEMENT_DIRECTION has no entry/);
  });
});

describe('computeAvailableBalance (Design doc §3.3)', () => {
  test('Confirmed minus a PENDING UTILIZE earmark', () => {
    const movements: M[] = [m('ISSUE', '110000', '110000', 'RELEASED'), m('UTILIZE', '30000', '30000', 'PENDING')];
    const confirmed = computeConfirmedBalance(movements);
    expect(confirmed.toFixed()).toBe('110000');
    expect(computeAvailableBalance(confirmed, movements).toFixed()).toBe('80000');
  });
});

describe('REVERSAL dynamic direction (F1, external BA review §11.2)', () => {
  test('a REVERSAL of an EXPIRE (direction -1) contributes the OPPOSITE (+1) sign to Confirmed Balance', () => {
    const original = m('EXPIRE', '40000', '40000', 'RELEASED');
    const reversal = m('REVERSAL', '40000', '40000', 'RELEASED', original.movementId);
    // ISSUE 100000 -> EXPIRE writes it off to 0 -> REVERSAL restores it back to 100000.
    const movements: M[] = [m('ISSUE', '100000', '100000', 'RELEASED'), original, reversal];
    expect(computeConfirmedBalance(movements).toFixed()).toBe('100000');
  });

  test('a REVERSAL of an ISSUE (direction +1) contributes the OPPOSITE (-1) sign', () => {
    const original = m('ISSUE', '100000', '100000', 'RELEASED');
    const reversal = m('REVERSAL', '100000', '100000', 'RELEASED', original.movementId);
    expect(computeConfirmedBalance([original, reversal]).toFixed()).toBe('0');
  });

  test('throws when reversalOfMovementId does not resolve within the supplied movements list', () => {
    const reversal = m('REVERSAL', '100000', '100000', 'RELEASED', 'does-not-exist');
    expect(() => computeConfirmedBalance([reversal])).toThrow(/no resolvable reversalOfMovementId/);
  });
});

describe('computeFaceAmount (Design doc §3.3/§6.2)', () => {
  test('tracks face-level amount independently of UTILIZE (which never touches face amount)', () => {
    const movements: M[] = [
      m('ISSUE', '100000', '110000', 'RELEASED'),
      m('AMEND_INCREASE', '10000', '11000', 'RELEASED'),
      m('UTILIZE', '50000', '50000', 'RELEASED'), // must NOT affect faceAmount
    ];
    expect(computeFaceAmount(movements).toFixed()).toBe('110000');
  });
});
