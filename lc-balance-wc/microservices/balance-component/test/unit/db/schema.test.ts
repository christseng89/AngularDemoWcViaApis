/**
 * Smoke test for the SQLite schema itself — proves the UNIQUE constraints
 * from Design doc §3.1/§8 are actually enforced by the DB, and that the
 * Catalog query (business instruction 2026-08-14, "除了開證，其他交易可以選
 * LC Number via Catalog") returns the expected rows.
 */
import { createDb, Db } from '../../../src/db';
import { BalanceContractStore } from '../../../src/store/balanceContractStore';
import { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { BalanceContract, BalanceMovement } from '../../../src/types';

function makeContract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    contractVersion: 1,
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'LC0001' },
    status: 'ACTIVE',
    currency: 'USD',
    tolerancePct: '10',
    openingBalance: '0',
    effectiveFrom: '2026-08-14T00:00:00Z',
    createdBy: 'maker1',
    createdAt: '2026-08-14T00:00:00Z',
    ...overrides,
  };
}

function makeMovement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    exposureNature: 'CONTINGENT',
    amount: '100000',
    ceilingAmount: '110000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-14T00:00:00Z',
    ...overrides,
  };
}

describe('SQLite schema (Design doc §3.1/§3.2/§8)', () => {
  let db: Db;
  let contracts: BalanceContractStore;
  let movements: BalanceMovementStore;

  beforeEach(() => {
    db = createDb(':memory:');
    contracts = new BalanceContractStore(db);
    movements = new BalanceMovementStore(db);
  });

  afterEach(() => {
    db.close();
  });

  test('round-trips a BalanceContract through insert/findById', () => {
    contracts.insert(makeContract());
    const found = contracts.findById('bc-1');
    expect(found?.naturalKey.lcNumber).toBe('LC0001');
    expect(found?.tolerancePct).toBe('10');
  });

  test('§3.1 — at most one ACTIVE version per logicalContractId (DB-enforced)', () => {
    contracts.insert(makeContract({ balanceContractId: 'bc-1', contractVersion: 1, status: 'ACTIVE' }));
    expect(() => contracts.insert(makeContract({ balanceContractId: 'bc-2', contractVersion: 2, status: 'ACTIVE' }))).toThrow(/UNIQUE constraint failed/);
  });

  test('§3.1 — (logicalContractId, contractVersion) must be unique', () => {
    contracts.insert(makeContract({ balanceContractId: 'bc-1', contractVersion: 1 }));
    expect(() => contracts.insert(makeContract({ balanceContractId: 'bc-2', contractVersion: 1, status: 'CLOSED' }))).toThrow(/UNIQUE constraint failed/);
  });

  test('§8 — (balanceContractId, eventSeq) idempotency: resubmission returns the existing row instead of erroring', () => {
    contracts.insert(makeContract());
    const first = movements.insert(makeMovement({ movementId: 'mv-1', eventSeq: 1 }));
    expect(first.created).toBe(true);

    const second = movements.insert(makeMovement({ movementId: 'mv-2', eventSeq: 1, amount: '999999' }));
    expect(second.created).toBe(false);
    if (!second.created) {
      expect(second.existing.movementId).toBe('mv-1'); // the ORIGINAL row, not a new one
    }
  });

  test('Catalog query (business instruction 2026-08-14) — filters by instrumentType + status, ordered by Reference (lc_number), paginated', () => {
    contracts.insert(makeContract({ balanceContractId: 'bc-1', logicalContractId: 'lc-1', naturalKey: { lcNumber: 'LC0001' }, status: 'ACTIVE' }));
    contracts.insert(makeContract({ balanceContractId: 'bc-2', logicalContractId: 'lc-2', naturalKey: { lcNumber: 'LC0002' }, status: 'CLOSED' }));
    contracts.insert(
      makeContract({ balanceContractId: 'bc-3', logicalContractId: 'lc-3', instrumentType: 'EPLC_LC', naturalKey: { lcNumber: 'LC0003' }, status: 'ACTIVE' }),
    );

    const activeIplc = contracts.listCatalog({ instrumentType: 'IPLC_LC', status: 'ACTIVE' });
    expect(activeIplc.items.map((c) => c.naturalKey.lcNumber)).toEqual(['LC0001']);
    expect(activeIplc.total).toBe(1);
    expect(activeIplc.page).toBe(1);
    expect(activeIplc.pageSize).toBe(10);

    const allIplc = contracts.listCatalog({ instrumentType: 'IPLC_LC' });
    // ordered by lc_number ASC, not insertion order.
    expect(allIplc.items.map((c) => c.naturalKey.lcNumber)).toEqual(['LC0001', 'LC0002']);
    expect(allIplc.total).toBe(2);
  });

  test('Catalog multi-status query returns ACTIVE and EXPIRED but excludes CLOSED — A2/B2 Expiry Date picker regression', () => {
    contracts.insert(makeContract({ balanceContractId: 'bc-active', logicalContractId: 'lc-active', naturalKey: { lcNumber: 'S-ACTIVE' }, status: 'ACTIVE' }));
    contracts.insert(makeContract({ balanceContractId: 'bc-expired', logicalContractId: 'lc-expired', naturalKey: { lcNumber: 'S-EXPIRED' }, status: 'EXPIRED' }));
    contracts.insert(makeContract({ balanceContractId: 'bc-closed', logicalContractId: 'lc-closed', naturalKey: { lcNumber: 'S-CLOSED' }, status: 'CLOSED' }));

    const result = contracts.listCatalog({ instrumentType: 'IPLC_LC', statuses: ['ACTIVE', 'EXPIRED'] });

    expect(result.items.map((contract) => contract.naturalKey.lcNumber)).toEqual(['S-ACTIVE', 'S-EXPIRED']);
    expect(result.total).toBe(2);
  });

  test('Catalog pagination (business instruction 2026-08-14) — page/pageSize slice a larger result set, ordered by Reference', () => {
    for (let i = 1; i <= 15; i++) {
      contracts.insert(
        makeContract({
          balanceContractId: `bc-page-${i}`,
          logicalContractId: `lc-page-${i}`,
          naturalKey: { lcNumber: `PAGE-${String(i).padStart(2, '0')}` },
          status: 'ACTIVE',
        }),
      );
    }

    const page1 = contracts.listCatalog({ instrumentType: 'IPLC_LC', status: 'ACTIVE', page: 1, pageSize: 10 });
    expect(page1.total).toBe(15);
    expect(page1.items).toHaveLength(10);
    expect(page1.items[0]?.naturalKey.lcNumber).toBe('PAGE-01');
    expect(page1.items[9]?.naturalKey.lcNumber).toBe('PAGE-10');

    const page2 = contracts.listCatalog({ instrumentType: 'IPLC_LC', status: 'ACTIVE', page: 2, pageSize: 10 });
    expect(page2.items).toHaveLength(5);
    expect(page2.items[0]?.naturalKey.lcNumber).toBe('PAGE-11');
    expect(page2.page).toBe(2);
  });

  test('Catalog lcNumber exact-match filter (business instruction 2026-08-14 "LC Index -> IB Index" cascading picker) — never matches a substring like q does', () => {
    contracts.insert(
      makeContract({
        balanceContractId: 'acc-1',
        logicalContractId: 'acc-lc-1',
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: '001', ibNumber: 'IB-A' },
        status: 'ACTIVE',
      }),
    );
    contracts.insert(
      makeContract({
        balanceContractId: 'acc-2',
        logicalContractId: 'acc-lc-2',
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: '001', ibNumber: 'IB-B' },
        status: 'ACTIVE',
      }),
    );
    // Same instrumentType, a DIFFERENT LC whose number contains "001" as a substring — must NOT show up for lcNumber:'001'.
    contracts.insert(
      makeContract({
        balanceContractId: 'acc-3',
        logicalContractId: 'acc-lc-3',
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: '2001', ibNumber: 'IB-C' },
        status: 'ACTIVE',
      }),
    );

    const ibIndex = contracts.listCatalog({ instrumentType: 'IPLC_ACCEPTANCE', status: 'ACTIVE', lcNumber: '001' });
    expect(ibIndex.total).toBe(2);
    expect(ibIndex.items.map((c) => c.naturalKey.ibNumber).sort()).toEqual(['IB-A', 'IB-B']);
  });

  test('Catalog q filter (typeahead) — case-insensitive substring match against lc_number, distinct from the exact-match lcNumber filter tested above', () => {
    contracts.insert(makeContract({ balanceContractId: 'q-1', logicalContractId: 'q-lc-1', naturalKey: { lcNumber: 'ABC-0001' }, status: 'ACTIVE' }));
    contracts.insert(makeContract({ balanceContractId: 'q-2', logicalContractId: 'q-lc-2', naturalKey: { lcNumber: 'XYZ-0002' }, status: 'ACTIVE' }));
    contracts.insert(makeContract({ balanceContractId: 'q-3', logicalContractId: 'q-lc-3', naturalKey: { lcNumber: 'ABC-0003' }, status: 'ACTIVE' }));

    const found = contracts.listCatalog({ instrumentType: 'IPLC_LC', q: 'ABC' });
    expect(found.items.map((c) => c.naturalKey.lcNumber).sort()).toEqual(['ABC-0001', 'ABC-0003']);
    expect(found.total).toBe(2);
  });

  test('Catalog tenorFamily filter (business-reported gap "Why U002 does not shown A5 — Document Arrival (Usance)?") — filters server-side so pagination reflects the eligible set, never drops legacy contracts with no tenorType recorded', () => {
    contracts.insert(
      makeContract({
        balanceContractId: 'sight-1',
        logicalContractId: 'sight-lc-1',
        naturalKey: { lcNumber: 'SIGHT-1' },
        tenorType: 'SIGHT',
        status: 'ACTIVE',
      }),
    );
    contracts.insert(
      makeContract({
        balanceContractId: 'usance-1',
        logicalContractId: 'usance-lc-1',
        naturalKey: { lcNumber: 'USANCE-1' },
        tenorType: 'SELLERS_USANCE',
        status: 'ACTIVE',
      }),
    );
    contracts.insert(
      makeContract({
        balanceContractId: 'usance-2',
        logicalContractId: 'usance-lc-2',
        naturalKey: { lcNumber: 'USANCE-2' },
        tenorType: 'BUYERS_USANCE',
        status: 'ACTIVE',
      }),
    );
    contracts.insert(
      makeContract({
        balanceContractId: 'legacy-1',
        logicalContractId: 'legacy-lc-1',
        naturalKey: { lcNumber: 'LEGACY-1' },
        tenorType: null,
        status: 'ACTIVE',
      }),
    );

    const sightOnly = contracts.listCatalog({ instrumentType: 'IPLC_LC', status: 'ACTIVE', tenorFamily: 'SIGHT' });
    expect(sightOnly.items.map((c) => c.naturalKey.lcNumber).sort()).toEqual(['LEGACY-1', 'SIGHT-1']);

    const usanceOnly = contracts.listCatalog({ instrumentType: 'IPLC_LC', status: 'ACTIVE', tenorFamily: 'USANCE' });
    expect(usanceOnly.items.map((c) => c.naturalKey.lcNumber).sort()).toEqual(['LEGACY-1', 'USANCE-1', 'USANCE-2']);
  });

  test('listShgtMovementsForParent joins through parentLogicalContractId (Design doc §6.1)', () => {
    contracts.insert(makeContract({ balanceContractId: 'lc-bc-1', logicalContractId: 'lc-logical-1', instrumentType: 'IPLC_LC' }));
    contracts.insert(
      makeContract({
        balanceContractId: 'shgt-bc-1',
        logicalContractId: 'shgt-logical-1',
        instrumentType: 'SHGT',
        parentLogicalContractId: 'lc-logical-1',
        naturalKey: { lcNumber: 'LC0001', sgNumber: 'SG0001' },
      }),
    );
    movements.insert(
      makeMovement({
        movementId: 'shgt-mv-1',
        balanceContractId: 'shgt-bc-1',
        eventSeq: 1,
        movementType: 'ISSUE',
        amount: '100000',
        ceilingAmount: '100000',
        status: 'RELEASED',
      }),
    );

    const found = movements.listShgtMovementsForParent('lc-logical-1');
    expect(found).toHaveLength(1);
    expect(found[0]?.movementId).toBe('shgt-mv-1');
  });

  test('findActiveByLogicalContractId / findActiveByNaturalKey resolve the same ACTIVE row', () => {
    contracts.insert(makeContract({ balanceContractId: 'bc-1', logicalContractId: 'lc-1', naturalKey: { lcNumber: 'LC0001' } }));

    const byLogical = contracts.findActiveByLogicalContractId('lc-1');
    const byNatural = contracts.findActiveByNaturalKey('IPLC_LC', { lcNumber: 'LC0001' });
    expect(byLogical?.balanceContractId).toBe('bc-1');
    expect(byNatural?.balanceContractId).toBe('bc-1');
  });

  test('BalanceMovementStore.insert rethrows a non-UNIQUE-constraint DB error unchanged (e.g. a FOREIGN KEY violation from a bogus balanceContractId) — the UNIQUE-violation resubmission path in insert() must not swallow every kind of DB error, only genuine idempotent resubmissions', () => {
    // No matching balance_contracts row for 'no-such-contract' — balance_movements.balance_contract_id
    // REFERENCES balance_contracts(balance_contract_id), and createDb() turns PRAGMA foreign_keys ON,
    // so this trips a FOREIGN KEY constraint failure, not a UNIQUE one.
    expect(() => movements.insert(makeMovement({ movementId: 'orphan-mv-1', balanceContractId: 'no-such-contract', eventSeq: 1 }))).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  test('BalanceMovementStore.updateStatus (Checker Release) records releasedBy/releasedAt/balanceAfter', () => {
    contracts.insert(makeContract());
    movements.insert(makeMovement({ movementId: 'mv-1', status: 'PENDING' }));

    movements.updateStatus({
      movementId: 'mv-1',
      status: 'RELEASED',
      releasedBy: 'checker1',
      releasedAt: '2026-08-14T02:00:00Z',
      balanceBefore: '0',
      balanceAfter: '110000',
    });

    const updated = movements.findById('mv-1');
    expect(updated?.status).toBe('RELEASED');
    expect(updated?.releasedBy).toBe('checker1');
    expect(updated?.balanceAfter).toBe('110000');
  });
});
