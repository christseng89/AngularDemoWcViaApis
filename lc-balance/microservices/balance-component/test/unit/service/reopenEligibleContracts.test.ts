/**
 * F1 (external BA review) §9.6/§11 — BalanceService.listReopenEligibleContracts(), A11/B7 Reopen's own
 * Step-1 picker hint. Mirrors closeEligibleContractsBatch.test.ts's own shape but for the genuinely
 * different eligibility rule: CLOSED status + no open Events anywhere in the tree — no SG/Acceptance
 * Confirmed-Balance-zero condition (that's Close's own rule, not Reopen's — see
 * service/balanceService.ts's own listReopenEligibleContracts() doc comment).
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import type { BalanceContract } from '../../../src/types';

function issueAndCloseImportLc(service: BalanceService, lcNumber: string): BalanceContract {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '10000',
    currency: 'USD',
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');

  const close = service.createMovement({
    instrumentType: 'IPLC_LC',
    balanceContractId: issue.movement.balanceContractId,
    movementType: 'CLOSE',
    eventSeq: 2,
    amount: '10000',
    currency: 'USD',
    createdBy: 'maker1',
  });
  if (!close.created) throw new Error('expected a new movement');
  service.release(close.movement.movementId, 'checker1');

  const closed = service.resolveContract('IPLC_LC', { lcNumber }, true);
  if (!closed) throw new Error('expected the just-closed LC to resolve with includeAnyStatus');
  return closed;
}

describe('BalanceService.listReopenEligibleContracts — A11/B7 Reopen Step-1 picker hint', () => {
  test('returns a genuinely eligible CLOSED LC (no open Events) and excludes an ACTIVE one entirely', () => {
    const service = new BalanceService(createDb(':memory:'));
    const closed = issueAndCloseImportLc(service, 'N1-REOPEN-ELIGIBLE-001');

    const active = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'N1-REOPEN-ACTIVE-002' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '5000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!active.created) throw new Error('expected a new movement');
    service.release(active.movement.movementId, 'checker1');

    const page = service.listReopenEligibleContracts('IPLC_LC');

    expect(page.items.map((c) => c.balanceContractId)).toEqual([closed.balanceContractId]);
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(10);
  });

  test('a CLOSED contract with a still-open Event (simulating a race — a PENDING record reaching the DB some other way after Close) is excluded, same hasOpenEvents rule REOPEN\'s own createMovement()-time check enforces', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const closed = issueAndCloseImportLc(service, 'N1-REOPEN-OPENEVENT-003');

    // Bypass the normal API surface directly via the DB, same established "raw SQL bypass" convention
    // this suite already uses elsewhere (see app.test.ts's own businessEventId-stripping test) — a
    // second, still-PENDING movement stuck on this now-CLOSED contract is otherwise unreachable through
    // the guarded createMovement()/release() path (CLOSE itself already requires hasOpenEvents === false).
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, created_at)
       VALUES ('bypass-mv-1', '${closed.balanceContractId}', 3, 'AMEND_DECREASE', 'CONTINGENT', '0', '0', 'USD', 'PENDING', 'maker1', '2026-08-25T00:00:00.000Z')`,
    );

    const page = service.listReopenEligibleContracts('IPLC_LC');

    expect(page.items.map((c) => c.balanceContractId)).not.toContain(closed.balanceContractId);
  });

  test('lcNumber filter (exact match) and pagination both apply over the eligible set, same semantics as listCloseEligibleContracts()', () => {
    const service = new BalanceService(createDb(':memory:'));
    const a = issueAndCloseImportLc(service, 'N1-REOPEN-PAGE-A');
    const b = issueAndCloseImportLc(service, 'N1-REOPEN-PAGE-B');
    const c = issueAndCloseImportLc(service, 'N1-REOPEN-PAGE-C');

    const filtered = service.listReopenEligibleContracts('IPLC_LC', { lcNumber: 'N1-REOPEN-PAGE-B' });
    expect(filtered.items.map((ct) => ct.naturalKey.lcNumber)).toEqual(['N1-REOPEN-PAGE-B']);
    expect(filtered.total).toBe(1);

    const page1 = service.listReopenEligibleContracts('IPLC_LC', { pageSize: 2, page: 1 });
    const page2 = service.listReopenEligibleContracts('IPLC_LC', { pageSize: 2, page: 2 });
    expect(page1.total).toBe(3);
    expect(page2.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(1);
    const allIds = [...page1.items, ...page2.items].map((ct) => ct.balanceContractId);
    expect(new Set(allIds)).toEqual(new Set([a.balanceContractId, b.balanceContractId, c.balanceContractId]));
  });

  test('EPLC_CONFIRMATION works the same way as IPLC_LC, and a non-root instrumentType is rejected', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'N1-REOPEN-CONF-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '8000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    const close = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      balanceContractId: issue.movement.balanceContractId,
      movementType: 'CLOSE',
      eventSeq: 2,
      amount: '8000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!close.created) throw new Error('expected a new movement');
    service.release(close.movement.movementId, 'checker1');

    const page = service.listReopenEligibleContracts('EPLC_CONFIRMATION');
    expect(page.items.map((c) => c.naturalKey.lcNumber)).toEqual(['N1-REOPEN-CONF-001']);

    expect(() => service.listReopenEligibleContracts('SHGT')).toThrow(/Reopen only applies to a root LC\/Confirmation/);
  });
});
