import { createDb } from '../../../src/db';
import { BalanceService, type CreateMovementRequest } from '../../../src/service/balanceService';
import { CompoundMovementService } from '../../../src/service/compoundMovementService';
import { SqliteUnitOfWork } from '../../../src/service/unitOfWork';

function issue(lcNumber: string, eventSeq: number, createdBy: string, businessEventId?: string): CreateMovementRequest {
  return {
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq,
    amount: '100',
    currency: 'USD',
    tenorType: 'SIGHT',
    tenorDays: 0,
    expiryDate: '2026-09-01',
    createdBy,
    businessEventId,
  };
}

describe('CompoundMovementService', () => {
  function setup() {
    const db = createDb(':memory:');
    const balance = new BalanceService(db);
    return { db, balance, service: new CompoundMovementService(balance, new SqliteUnitOfWork(db)) };
  }

  it('rejects malformed compound create commands before opening a transaction', () => {
    const { service } = setup();
    expect(() => service.create([issue('ONE', 1, 'maker1', 'event')])).toThrow('at least two');
    expect(() => service.create([issue('A', 1, 'maker1'), issue('B', 2, 'maker1')])).toThrow('same businessEventId');
    expect(() => service.create([issue('A', 1, 'maker1', 'one'), issue('B', 2, 'maker1', 'two')])).toThrow('same businessEventId');
  });

  it('rejects malformed compound release commands', () => {
    const { service } = setup();
    expect(() => service.release(['one'], 'checker1')).toThrow('at least two');
    expect(() => service.release(['same', 'same'], 'checker1')).toThrow('unique');
  });

  it('executes mixed release and acknowledge actions atomically', () => {
    const { balance, service } = setup();
    const firstResult = balance.createMovement(issue('LC-ACTION-1', 21, 'maker1'));
    const rootResult = balance.createMovement(issue('LC-ACTION-2', 22, 'maker1'));
    if (!firstResult.created || !rootResult.created) throw new Error('test setup failed');
    balance.release(rootResult.movement.movementId, 'checker1');
    const secondResult = balance.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: rootResult.movement.balanceContractId,
      movementType: 'UTILIZE',
      eventSeq: 23,
      amount: '10',
      currency: 'USD',
      createdBy: 'maker1',
      sourceTransactionRef: 'IB-ACTION-2',
    });
    if (!firstResult.created || !secondResult.created) throw new Error('test setup failed');
    const first = firstResult.movement;
    const second = secondResult.movement;
    const results = service.execute(
      [
        { kind: 'release', movementId: first.movementId },
        { kind: 'acknowledge', movementId: second.movementId },
      ],
      'checker1',
    );
    expect(results.map((movement) => movement.status)).toEqual(['RELEASED', 'PENDING']);
    expect(results[1]?.acknowledgedBy).toBe('checker1');
  });

  it('rejects a mixed action command with fewer than two actions', () => {
    const { service } = setup();
    expect(() => service.execute([{ kind: 'release', movementId: 'one' }], 'checker1')).toThrow('at least two');
  });

  it('rolls back every created leg when a later leg fails', () => {
    const db = createDb(':memory:');
    const balance = new BalanceService(db);
    const service = new CompoundMovementService(balance, new SqliteUnitOfWork(db));

    const invalid = { ...issue('LC-ATOMIC-2', 2, 'maker1', 'event-atomic'), amount: 'not-money' };

    expect(() => service.create([issue('LC-ATOMIC-1', 1, 'maker1', 'event-atomic'), invalid])).toThrow();
    const count = db.prepare('SELECT COUNT(*) AS count FROM balance_movements').get() as { count: number };
    expect(count.count).toBe(0);
  });

  it('rolls back earlier releases when a later leg fails', () => {
    const db = createDb(':memory:');
    const balance = new BalanceService(db);
    const service = new CompoundMovementService(balance, new SqliteUnitOfWork(db));
    const first = balance.createMovement(issue('LC-REL-1', 11, 'maker1'));
    const second = balance.createMovement(issue('LC-REL-2', 12, 'checker1'));
    if (!first.created || !second.created) throw new Error('test setup failed');

    expect(() => service.release([first.movement.movementId, second.movement.movementId], 'checker1')).toThrow();
    expect(balance.listMovements(first.movement.balanceContractId)[0]?.status).toBe('PENDING');
    expect(balance.listMovements(second.movement.balanceContractId)[0]?.status).toBe('PENDING');
  });
});
