/**
 * User-directed 2026-08-26 ("UI必輸欄位 API也是必輸欄位 三者一體... API包括 MAKER CHECKER") — dedicated
 * coverage for the 5 mandatory-field rules `BalanceService` gained that day, closing gaps that were
 * previously enforced ONLY client-side (submit-rules.ts): naturalKey.lcNumber/ibNumber/sgNumber,
 * sourceTransactionRef (Amendment No./IB/EB Number), tenorType, and tenorDays. Each rule is checked at
 * BOTH createMovement() (Maker) and release() (Checker, defense-in-depth against a movement/contract that
 * reached the DB some other way) — see balanceService.ts's own assertNaturalKeyFieldsRequired()/
 * assertSecondaryRefRequired()/assertTenorRequired() doc comments for the exact scope of each rule.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { RequestValidationError } from '../../../src/errors';

function issueImportLc(service: BalanceService, lcNumber: string, overrides: Record<string, unknown> = {}) {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '10000',
    currency: 'USD',
    expiryDate: '2099-12-31',
    tenorType: 'SIGHT',
    createdBy: 'maker1',
    ...overrides,
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

describe('naturalKey fields mandatory on a creating movement (rule 1-3)', () => {
  test('rejects ISSUE with a blank naturalKey.lcNumber', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: '' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2099-12-31',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      }),
    ).toThrow(/naturalKey\.lcNumber is required for ISSUE against IPLC_LC/);
  });

  test('rejects SHGT ISSUE with no naturalKey.sgNumber', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'NK-SG-001');
    expect(() =>
      service.createMovement({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'NK-SG-001' },
        movementType: 'ISSUE',
        eventSeq: 2,
        amount: '2000',
        currency: 'USD',
        parentLogicalContractId: lc.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(/naturalKey\.sgNumber is required for ISSUE against SHGT/);
  });

  test('rejects IPLC_ACCEPTANCE CREATE with no naturalKey.ibNumber', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'NK-IB-001', { tenorType: 'SELLERS_USANCE', tenorDays: 60 });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'NK-IB-001' },
        movementType: 'CREATE',
        eventSeq: 2,
        amount: '2000',
        currency: 'USD',
        parentLogicalContractId: lc.logicalContractId,
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      }),
    ).toThrow(/naturalKey\.ibNumber is required for CREATE against IPLC_ACCEPTANCE/);
  });

  test('passes ISSUE/SHGT/Acceptance when every required naturalKey field is present (sanity — the guard is not over-broad)', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => issueImportLc(service, 'NK-OK-001')).not.toThrow();
  });

  test('a movement resolved via balanceContractId (not naturalKey) is never subject to this rule', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'NK-EXISTING-001');
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '500',
        currency: 'USD',
        sourceTransactionRef: 'AMD-01',
        createdBy: 'maker1',
      }),
    ).not.toThrow();
  });

  test('Checker release() re-checks naturalKey.lcNumber against the already-persisted contract, defense-in-depth against a DB-bypass-created row', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'NK-BYPASS-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2099-12-31',
      tenorType: 'SIGHT',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    // Simulate a legacy/bypassed row whose lcNumber was blanked out some other way than createMovement(),
    // BEFORE the Checker ever gets to Release it — the ONLY way to reach this state, since createMovement()
    // itself would have already rejected a blank lcNumber.
    db.exec(`UPDATE balance_contracts SET lc_number = '' WHERE balance_contract_id = '${issue.movement.balanceContractId}'`);
    expect(() => service.release(issue.movement.movementId, 'checker1')).toThrow(/naturalKey\.lcNumber is required for ISSUE against IPLC_LC/);
  });

  test('Checker release() re-checks naturalKey.ibNumber against the already-persisted contract too, defense-in-depth against a DB-bypass-created row', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'NK-IB-BYPASS-001', { tenorType: 'SELLERS_USANCE', tenorDays: 60 });
    const create = service.createMovement({
      instrumentType: 'IPLC_ACCEPTANCE',
      naturalKey: { lcNumber: 'NK-IB-BYPASS-001', ibNumber: 'IB-01' },
      movementType: 'CREATE',
      eventSeq: 2,
      amount: '2000',
      currency: 'USD',
      parentLogicalContractId: lc.logicalContractId,
      tenorType: 'SELLERS_USANCE',
      createdBy: 'maker1',
    });
    if (!create.created) throw new Error('expected a new movement');
    db.exec(`UPDATE balance_contracts SET ib_number = '' WHERE balance_contract_id = '${create.movement.balanceContractId}'`);
    expect(() => service.release(create.movement.movementId, 'checker1')).toThrow(/naturalKey\.ibNumber is required for CREATE against IPLC_ACCEPTANCE/);
  });
});

describe('sourceTransactionRef mandatory (rule 4)', () => {
  test.each(['AMEND_INCREASE', 'AMEND_DECREASE', 'UTILIZE'])('rejects %s with no sourceTransactionRef', (movementType) => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, `SR-${movementType}-001`);
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType,
        eventSeq: 2,
        amount: '500',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(new RegExp(`sourceTransactionRef is required for ${movementType}`));
  });

  test('rejects AMEND (B2) with no sourceTransactionRef', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'EPLC_CONFIRMATION',
      naturalKey: { lcNumber: 'SR-B2-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2099-12-31',
      tenorType: 'SIGHT',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    service.release(issue.movement.movementId, 'checker1');
    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: issue.movement.balanceContractId,
        movementType: 'AMEND',
        eventSeq: 2,
        amount: '500',
        currency: 'USD',
        createdBy: 'maker1',
      }),
    ).toThrow(/sourceTransactionRef is required for AMEND\./);
  });

  test('does not apply to ISSUE/CLOSE/REOPEN/EXPIRE — sourceTransactionRef stays optional there', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => issueImportLc(service, 'SR-EXEMPT-001')).not.toThrow();
  });

  test('Checker release() re-checks sourceTransactionRef against the already-persisted movement, defense-in-depth against a DB-bypass-created row', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = issueImportLc(service, 'SR-BYPASS-001');
    db.exec(
      `INSERT INTO balance_movements (movement_id, balance_contract_id, event_seq, movement_type, exposure_nature, amount, ceiling_amount, currency, status, created_by, created_at)
       VALUES ('bypass-sr-1', '${lc.balanceContractId}', 2, 'AMEND_INCREASE', 'CONTINGENT', '500', '500', 'USD', 'PENDING', 'maker1', '2026-08-26T00:00:00.000Z')`,
    );
    expect(() => service.release('bypass-sr-1', 'checker1')).toThrow(/sourceTransactionRef is required for AMEND_INCREASE/);
  });
});

describe('tenorType/tenorDays mandatory (rule 5)', () => {
  test('rejects IPLC_LC ISSUE with no tenorType', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'TEN-NOTYPE-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2099-12-31',
        createdBy: 'maker1',
      }),
    ).toThrow(/tenorType is required for ISSUE against IPLC_LC/);
  });

  test('rejects EPLC_CONFIRMATION ISSUE with no tenorType', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'TEN-B1-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2099-12-31',
        createdBy: 'maker1',
      }),
    ).toThrow(/tenorType is required for ISSUE against EPLC_CONFIRMATION/);
  });

  test('rejects IPLC_ACCEPTANCE CREATE with no tenorType', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'TEN-A6-001', { tenorType: 'SELLERS_USANCE', tenorDays: 60 });
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'TEN-A6-001', ibNumber: 'IB-01' },
        movementType: 'CREATE',
        eventSeq: 2,
        amount: '2000',
        currency: 'USD',
        parentLogicalContractId: lc.logicalContractId,
        createdBy: 'maker1',
      }),
    ).toThrow(/tenorType is required for CREATE against IPLC_ACCEPTANCE/);
  });

  test('rejects IPLC_LC ISSUE with a Usance tenorType but no tenorDays', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'TEN-NODAYS-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2099-12-31',
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      }),
    ).toThrow(/tenorDays must be greater than 0 for SELLERS_USANCE/);
  });

  test('passes IPLC_LC ISSUE for Sight with no tenorDays at all (0 is the correct, protected value — not required to be typed)', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => issueImportLc(service, 'TEN-SIGHT-001')).not.toThrow();
  });

  test('B1/A6 have no tenorDays>0 backstop — a Usance EPLC_CONFIRMATION ISSUE with no tenorDays still passes, same as the client (no equivalent submit-rules.ts guard exists for B1)', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'TEN-B1-USANCE-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2099-12-31',
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      }),
    ).not.toThrow();
  });

  test('Checker release() re-checks tenorType against the already-persisted contract, defense-in-depth against a DB-bypass-created row', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'TEN-BYPASS-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2099-12-31',
      tenorType: 'SIGHT',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    // Simulate a legacy contract predating this rule, whose tenorType was never recorded.
    db.exec(`UPDATE balance_contracts SET tenor_type = NULL WHERE balance_contract_id = '${issue.movement.balanceContractId}'`);
    expect(() => service.release(issue.movement.movementId, 'checker1')).toThrow(/tenorType is required for ISSUE against IPLC_LC/);
  });

  test('Checker release() re-checks tenorDays > 0 for a non-Sight IPLC_LC ISSUE too, defense-in-depth against a DB-bypass-created row', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'TEN-DAYS-BYPASS-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2099-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 60,
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    // Simulate a legacy contract whose tenorDays was never recorded, even though tenorType was.
    db.exec(`UPDATE balance_contracts SET tenor_days = NULL WHERE balance_contract_id = '${issue.movement.balanceContractId}'`);
    expect(() => service.release(issue.movement.movementId, 'checker1')).toThrow(/tenorDays must be greater than 0 for SELLERS_USANCE/);
  });
});

// User-directed 2026-08-28 ("Tolerance MUST >= 0") — checked at createMovement() (Maker, A1/B1 ISSUE
// only — the only place tolerancePct is ever caller-supplied), editPending() (Fix Pending, A1/B1's own
// creating-edit only — see buildEditedRequest()'s own `creatingOnly()` gate), and release() (Checker,
// defense-in-depth against a contract that reached the DB some other way).
describe('tolerancePct must not be negative', () => {
  test('rejects IPLC_LC ISSUE with a negative tolerancePct', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() =>
      service.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'TOL-NEG-001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        expiryDate: '2099-12-31',
        tenorType: 'SIGHT',
        tolerancePct: '-5',
        createdBy: 'maker1',
      }),
    ).toThrow(/tolerancePct "-5" must not be negative/);
  });

  test('accepts a positive tolerancePct and a zero tolerancePct', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => issueImportLc(service, 'TOL-POS-001', { tolerancePct: '10' })).not.toThrow();
    expect(() => issueImportLc(service, 'TOL-ZERO-001', { tolerancePct: '0' })).not.toThrow();
  });

  test('a null/omitted tolerancePct (not applicable, or genuinely optional) is untouched', () => {
    const service = new BalanceService(createDb(':memory:'));
    expect(() => issueImportLc(service, 'TOL-NULL-001')).not.toThrow();
  });

  test('Fix Pending (editPending) rejects patching an A1 ISSUE with a negative tolerancePct', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'TOL-FIXP-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2099-12-31',
      tenorType: 'SIGHT',
      tolerancePct: '10',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    expect(() => service.editPending(issue.movement.movementId, { amount: '10000', tolerancePct: '-1', editedBy: 'maker1' })).toThrow(
      /tolerancePct "-1" must not be negative/,
    );
  });

  test('Checker release() re-checks tolerancePct against the already-persisted contract, defense-in-depth against a DB-bypass-created row', () => {
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'TOL-BYPASS-001' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      expiryDate: '2099-12-31',
      tenorType: 'SIGHT',
      tolerancePct: '10',
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    // Simulate a legacy/bypassed row whose tolerancePct went negative some other way than createMovement()
    // or editPending() — the ONLY way to reach this state, since both already reject a negative value.
    db.exec(`UPDATE balance_contracts SET tolerance_pct = '-10' WHERE balance_contract_id = '${issue.movement.balanceContractId}'`);
    expect(() => service.release(issue.movement.movementId, 'checker1')).toThrow(/tolerancePct "-10" must not be negative/);
  });
});
