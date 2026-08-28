import { createDb } from '../../../src/db';
import { FixPendingAuditStore } from '../../../src/store/fixPendingAuditStore';

describe('FixPendingAuditStore', () => {
  test('listByContract returns every audit row across every movement under one contract, oldest first', () => {
    const db = createDb(':memory:');
    db.exec('PRAGMA foreign_keys = OFF'); // isolating the store's own SQL/mapping, not referential integrity (covered elsewhere)
    const store = new FixPendingAuditStore(db);

    store.insert({
      auditId: 'a1',
      editSeq: 1,
      movementId: 'm1',
      balanceContractId: 'c1',
      eventSeq: 1,
      originalCreatedBy: 'maker1',
      originalCreatedAt: '2026-01-01T00:00:00Z',
      statusBefore: 'PENDING',
      beforeSnapshot: { amount: '100' },
      afterSnapshot: { amount: '200' },
      editedBy: 'maker2',
      editedAt: '2026-01-02T00:00:00Z',
    });
    store.insert({
      auditId: 'a2',
      editSeq: 1,
      movementId: 'm2',
      balanceContractId: 'c1',
      eventSeq: 2,
      originalCreatedBy: 'maker1',
      originalCreatedAt: '2026-01-01T00:00:01Z',
      statusBefore: 'REJECTED',
      beforeSnapshot: { amount: '50' },
      afterSnapshot: { amount: '60' },
      editedBy: 'maker3',
      editedAt: '2026-01-03T00:00:00Z',
    });
    // A different contract's own audit row — must never leak into c1's own listByContract().
    store.insert({
      auditId: 'a3',
      editSeq: 1,
      movementId: 'm3',
      balanceContractId: 'c2',
      eventSeq: 1,
      originalCreatedBy: 'maker1',
      originalCreatedAt: '2026-01-01T00:00:02Z',
      statusBefore: 'PENDING',
      beforeSnapshot: {},
      afterSnapshot: {},
      editedBy: 'maker1',
      editedAt: '2026-01-01T00:00:03Z',
    });

    const rows = store.listByContract('c1');
    expect(rows.map((r) => r.movementId)).toEqual(['m1', 'm2']); // oldest edited_at first
    expect(rows[0]!.beforeSnapshot).toEqual({ amount: '100' });
    expect(rows[0]!.afterSnapshot).toEqual({ amount: '200' });
    expect(rows[1]!.statusBefore).toBe('REJECTED');

    expect(store.listByContract('c2')).toHaveLength(1);
    expect(store.listByContract('no-such-contract')).toHaveLength(0);
  });

  test('nextEditSeq is per-movement and 1-based', () => {
    const db = createDb(':memory:');
    db.exec('PRAGMA foreign_keys = OFF'); // isolating the store's own SQL/mapping, not referential integrity (covered elsewhere)
    const store = new FixPendingAuditStore(db);
    expect(store.nextEditSeq('m1')).toBe(1);

    store.insert({
      auditId: 'a1',
      editSeq: 1,
      movementId: 'm1',
      balanceContractId: 'c1',
      eventSeq: 1,
      originalCreatedBy: 'maker1',
      originalCreatedAt: '2026-01-01T00:00:00Z',
      statusBefore: 'PENDING',
      beforeSnapshot: {},
      afterSnapshot: {},
      editedBy: 'maker2',
      editedAt: '2026-01-02T00:00:00Z',
    });

    expect(store.nextEditSeq('m1')).toBe(2);
    expect(store.nextEditSeq('m-other')).toBe(1); // independent per movement
  });
});
