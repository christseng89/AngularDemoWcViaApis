/**
 * End-to-end HTTP integration test — replays Import Case 1 (Sight, no SHGT)
 * through the real Express app + SQLite (:memory:), proving the whole
 * stack (routes -> service -> domain -> store -> db) works together, not
 * just the domain functions in isolation (see caseWalkthroughs.test.ts).
 */
import request from 'supertest';
import { createDb } from '../../src/db';
import { createApp } from '../../src/app';

describe('HTTP integration — Import Case 1 (Sight, no SHGT)', () => {
  const app = createApp(createDb(':memory:'));
  let lcBalanceContractId: string;

  test('1. LC Issue 100,000, Tolerance 10% -> Ceiling 110,000', async () => {
    const createRes = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0001' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tolerancePct: '10',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(createRes.body.ceilingAmount).toBe('110000');
    expect(createRes.body.status).toBe('PENDING');
    lcBalanceContractId = createRes.body.balanceContractId;

    await request(app).post(`/balance-movements/${createRes.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const snapshot = await request(app).get(`/balance-contracts/${lcBalanceContractId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('110000');
    expect(snapshot.body.availableBalance).toBe('110000');
  });

  test('2. LC Amendment increase 10,000 -> 121,000', async () => {
    const createRes = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcBalanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(createRes.body.ceilingAmount).toBe('11000');
    await request(app).post(`/balance-movements/${createRes.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const snapshot = await request(app).get(`/balance-contracts/${lcBalanceContractId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('121000');
  });

  let utilizeMovementId: string;

  test('3. Document Arrival 50,000 -> 201 PENDING, no warning', async () => {
    const createRes = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcBalanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 3,
        amount: '50000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(createRes.body.status).toBe('PENDING');
    expect(createRes.body.warnings).toBeNull();
    utilizeMovementId = createRes.body.movementId;
  });

  test('4. Accept Pay 50,000 -> LC settles at 71,000', async () => {
    await request(app).post(`/balance-movements/${utilizeMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const snapshot = await request(app).get(`/balance-contracts/${lcBalanceContractId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('71000');
    expect(snapshot.body.availableBalance).toBe('71000');
  });

  test('resubmitting the same eventSeq is idempotent (200, not a new record)', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcBalanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 3,
        amount: '999999', // ignored — the ORIGINAL record is returned
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(200);
    expect(res.body.movementId).toBe(utilizeMovementId);
    expect(res.body.amount).toBe('50000');
  });

  test('catalog lists the LC, paginated and ordered by Reference (business instruction 2026-08-14)', async () => {
    const res = await request(app).get('/balance-contracts/catalog').query({ instrumentType: 'IPLC_LC' }).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].naturalKey.lcNumber).toBe('LC0001');
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
  });

  test('AMEND_DECREASE exceeding Available Balance is rejected with a disambiguated error message', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcBalanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 4,
        amount: '80000', // ceilingAmount 88,000 > Available 71,000
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    expect(res.body.message).toMatch(/face-level amount 80000/);
  });

  test('unknown Logical Contract 404s', async () => {
    await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'DOES-NOT-EXIST' }).expect(404);
  });
});

describe('HTTP integration — v0.12: unmatched Document Arrival now REJECTS past Tight Available; matched "Document Arrival w/ Shipping Gtee" (redeem-then-arrive) still succeeds (Import Case 4 shape)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;
  let sgId: string;

  test('setup: LC Issue 100,000 + Tolerance 10% + Amendment +10,000 -> Ceiling 121,000; SG 100,000 linked via parentLogicalContractId', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC0002' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    expect(lc.body.ceilingAmount).toBe('110000');
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const amend = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    expect(amend.body.ceilingAmount).toBe('11000');
    await request(app).post(`/balance-movements/${amend.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.confirmedBalance).toBe('121000');

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC0002' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC0002', sgNumber: 'SG0001' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    sgId = sg.body.balanceContractId;
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('plain, unmatched Document Arrival 50,000 -> 409, rejected (v0.12 — offBalanceExposure resolved via parentLogicalContractId join, still 100,000 since the SG has not been touched)', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 3, amount: '50000', currency: 'USD', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds Tight Available Balance 21000/);
  });

  let sgRedeemMovementId: string;
  let matchedUtilizeMovementId: string;

  test('"Document Arrival w/ Shipping Gtee" (full match only): Maker creates the SG\'s own FULL_REDEEM as PENDING FIRST — for 100,000, the SG\'s entire current outstanding, "protected and carried" from the SG record, not typed', async () => {
    const redeem = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'FULL_REDEEM', eventSeq: 2, amount: '100000', currency: 'USD', createdBy: 'maker1', businessEventId: 'A3-SG-demo-1' })
      .expect(201);
    sgRedeemMovementId = redeem.body.movementId;
    expect(redeem.body.status).toBe('PENDING');
  });

  test('Maker then creates the LC\'s own UTILIZE for the same 100,000 — passes with NO error, because computeOffBalanceExposure() already counts the PENDING FULL_REDEEM above, netting this SG\'s exposure out of Tight Available before this check ever runs', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 4, amount: '100000', currency: 'USD', createdBy: 'maker1', businessEventId: 'A3-SG-demo-1' })
      .expect(201);
    matchedUtilizeMovementId = res.body.movementId;
    expect(res.body.status).toBe('PENDING');
  });

  test('Checker approves BOTH with one compound Release action — SG redemption first, then the Document Arrival (component.ts release() ordering) — LC settles at 21,000, SG at 0', async () => {
    await request(app).post(`/balance-movements/${sgRedeemMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    await request(app).post(`/balance-movements/${matchedUtilizeMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.confirmedBalance).toBe('21000');

    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.confirmedBalance).toBe('0');
  });
});

describe('HTTP integration — SG Issue capped at parent LC Available Balance (business instruction 2026-08-14, override of Design doc §5/§11)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;

  test('setup: Issue LC0003 for 3,000, no tolerance', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC0003' }, movementType: 'ISSUE', eventSeq: 1, amount: '3000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC0003' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const snapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(snapshot.body.availableBalance).toBe('3000');
  });

  test('SG Issue for 3,001 (exceeds Available Balance 3,000 by 1) -> 409, rejected at Maker submission', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC0003', sgNumber: 'SG-OVER' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '3001',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds parent LC's Tight Available Balance 3000/);
  });

  test('SG Issue for exactly 3,000 (== Available Balance, not greater than) -> 201, succeeds', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC0003', sgNumber: 'SG-EXACT' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 2,
        amount: '3000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(res.body.ceilingAmount).toBe('3000');
  });

  test('v0.11: a SECOND SG Issue for just 1 more -> 409, netted against the first SG\'s own outstanding exposure, not just the LC\'s plain Available Balance', async () => {
    // SG-EXACT above already consumed the LC's entire 3,000 Available Balance as off-balance
    // exposure. The LC's own plain Available Balance is still 3,000 (SG issuance never touches
    // the LC contract itself) — a check against plain Available Balance alone would wrongly pass
    // this. Tight Available (3,000 - 3,000 already-outstanding SG exposure = 0) correctly rejects it.
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC0003', sgNumber: 'SG-OVERLAP' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 3,
        amount: '1',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds parent LC's Tight Available Balance 0/);
    expect(res.body.message).toMatch(/3000 already-outstanding Shipping Guarantee exposure/);
  });
});

describe('HTTP integration — SG redemption commitment control: two concurrent PENDING redemptions on the same SG (bug fixed 2026-08-15, found live: LC S001 / SG G01 ended up with pendingEarmarkTotal -12000 / availableBalance -5000)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;
  let sgId: string;

  test('setup: Issue LC0004 for 100,000, then SG0004 for 10,000, both released', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC0004' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC0004' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC0004', sgNumber: 'SG0004' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    sgId = sg.body.balanceContractId;
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('first redemption: PARTIAL_REDEEM 7,000, left PENDING (not released) — SG Available drops to 3,000', async () => {
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'PARTIAL_REDEEM', eventSeq: 2, amount: '7000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);

    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.confirmedBalance).toBe('10000');
    expect(sgSnapshot.body.availableBalance).toBe('3000');
  });

  test('second redemption for 5,000 (<= Confirmed 10,000 but > the 3,000 actually still Available) -> 409, rejected', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'PARTIAL_REDEEM', eventSeq: 3, amount: '5000', currency: 'USD', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds this record's Available Balance 3000/);

    // Confirms the rejection actually prevented the DB write — no over-redemption slipped through.
    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.availableBalance).toBe('3000');
    expect(sgSnapshot.body.pendingEarmarkTotal).toBe('-7000');
  });

  test('a redemption for exactly 3,000 (== what is actually Available) -> 201, succeeds', async () => {
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'PARTIAL_REDEEM', eventSeq: 4, amount: '3000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);

    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.availableBalance).toBe('0');
    expect(sgSnapshot.body.pendingEarmarkTotal).toBe('-10000');
  });
});

describe('HTTP integration — event timeline (business instruction 2026-08-14)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let issueMovementId: string;
  let amendMovementId: string;
  let utilizeMovementId: string;

  test('setup: Issue 80,000 (no tolerance) -> Amendment... actually just Issue + a Sight drawdown to 80,000 remaining', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'TIMELINE-001' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    lcId = issue.body.balanceContractId;
    issueMovementId = issue.body.movementId;
    await request(app).post(`/balance-movements/${issueMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const amend = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_DECREASE', eventSeq: 2, amount: '20000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    amendMovementId = amend.body.movementId;
    await request(app).post(`/balance-movements/${amendMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    // Confirmed now 80,000.

    const utilize = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 3, amount: '30000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    utilizeMovementId = utilize.body.movementId;
    await request(app).post(`/balance-movements/${utilizeMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    // Confirmed now 50,000 -- this final state is NOT what we're checking below.
  });

  test('GET /balance-contracts/:id/movements lists all 3 events in eventSeq (time) order', async () => {
    const res = await request(app).get(`/balance-contracts/${lcId}/movements`).expect(200);
    expect(res.body.map((m: any) => m.eventSeq)).toEqual([1, 2, 3]);
    expect(res.body.map((m: any) => m.movementType)).toEqual(['ISSUE', 'AMEND_DECREASE', 'UTILIZE']);
  });

  test('clicking the Amendment event shows the balance exactly as of that point (80,000) -- not the current live 50,000', async () => {
    const res = await request(app).get(`/balance-movements/${amendMovementId}/balance-as-of`).expect(200);
    expect(res.body).toMatchObject({
      currency: 'USD',
      confirmedBalance: '80000',
      availableBalance: '80000',
      pendingEarmarkTotal: '0',
      offBalanceExposure: '0',
      tightAvailableBalance: '80000',
    });
  });

  test('clicking the Issue event shows the balance as of Issue alone (100,000)', async () => {
    const res = await request(app).get(`/balance-movements/${issueMovementId}/balance-as-of`).expect(200);
    expect(res.body.confirmedBalance).toBe('100000');
  });

  test('clicking the final UTILIZE event matches the current live snapshot (50,000)', async () => {
    const asOf = await request(app).get(`/balance-movements/${utilizeMovementId}/balance-as-of`).expect(200);
    const live = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(asOf.body.confirmedBalance).toBe('50000');
    expect(asOf.body.confirmedBalance).toBe(live.body.confirmedBalance);
  });
});

describe('HTTP integration — Tenor Type Routing (business instruction 2026-08-14, Design doc §7 v0.7)', () => {
  const app = createApp(createDb(':memory:'));

  test('Seller\'s Usance and Buyer\'s Usance Acceptances both persist their own tenorType, with IDENTICAL Balance mechanics', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'TENOR-001' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const utilize = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const sellersAcceptance = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'TENOR-001', ibNumber: 'IB-SELLERS' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '40000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
      .expect(201);
    expect(sellersAcceptance.body.ceilingAmount).toBe('40000');

    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'TENOR-001', ibNumber: 'IB-SELLERS' }).expect(200);
    expect(contract.body.tenorType).toBe('SELLERS_USANCE');
    expect(contract.body.tenorDays).toBe(90);

    // Buyer's Usance goes through the exact same CREATE call shape and produces the exact same
    // ceilingAmount/Confirmed-Balance math — only the tenorType label differs.
    const buyersAcceptance = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'TENOR-001', ibNumber: 'IB-BUYERS' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '40000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        tenorDays: 120,
        createdBy: 'maker1',
      })
      .expect(201);
    expect(buyersAcceptance.body.ceilingAmount).toBe(sellersAcceptance.body.ceilingAmount);

    const buyersContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'TENOR-001', ibNumber: 'IB-BUYERS' }).expect(200);
    expect(buyersContract.body.tenorType).toBe('BUYERS_USANCE');
    expect(buyersContract.body.tenorDays).toBe(120);
  });
});

describe('HTTP integration — cannot re-ISSUE an already-ACTIVE natural key (business-reported gap 2026-08-14)', () => {
  const app = createApp(createDb(':memory:'));

  test('first ISSUE succeeds; a second ISSUE against the SAME LC Number is rejected, not silently applied on top', async () => {
    const first = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'DUP-001' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${first.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const second = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'DUP-001' }, movementType: 'ISSUE', eventSeq: 2, amount: '999999', currency: 'USD', createdBy: 'maker1' })
      .expect(409);
    expect(second.body.code).toBe('NATURAL_KEY_ALREADY_EXISTS');

    // Confirmed Balance must NOT have doubled — still exactly the first Issue's 100,000.
    const snapshot = await request(app).get(`/balance-contracts/${first.body.balanceContractId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('100000');
  });

  test('the same guard applies to CREATE on IPLC_ACCEPTANCE (LC Number + IB Number natural key)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'DUP-002' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const firstAcceptance = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'DUP-002', ibNumber: 'IB-001' }, movementType: 'CREATE', eventSeq: 1, amount: '50000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${firstAcceptance.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const secondAcceptance = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: 'DUP-002', ibNumber: 'IB-001' }, movementType: 'CREATE', eventSeq: 2, amount: '77777', currency: 'USD', createdBy: 'maker1' })
      .expect(409);
    expect(secondAcceptance.body.code).toBe('NATURAL_KEY_ALREADY_EXISTS');
  });

  test('a DIFFERENT LC Number is unaffected — this guard is per natural key, not global', async () => {
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'DUP-003' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'DUP-004' }, movementType: 'ISSUE', eventSeq: 1, amount: '200000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
  });
});

describe('HTTP integration — secondary reference (sourceTransactionRef) must be unique per contract (business-reported gap 2026-08-14)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;

  test('setup: Issue LC', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'REF-001' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    lcId = issue.body.balanceContractId;
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('first Amendment with reference "001-01" succeeds', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', sourceTransactionRef: '001-01', createdBy: 'maker1' })
      .expect(201);
    expect(res.body.sourceTransactionRef).toBe('001-01');
    await request(app).post(`/balance-movements/${res.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('a SECOND Amendment reusing the SAME reference "001-01" is rejected — even with a different eventSeq/amount', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 3, amount: '5000', currency: 'USD', sourceTransactionRef: '001-01', createdBy: 'maker1' })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/001-01/);

    // Confirmed unchanged by the rejected attempt.
    const snapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('110000');
  });

  test('a DIFFERENT reference "001-02" on the same contract succeeds', async () => {
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 4, amount: '5000', currency: 'USD', sourceTransactionRef: '001-02', createdBy: 'maker1' })
      .expect(201);
  });

  test('the SAME reference "001-01" is fine on a DIFFERENT contract — uniqueness is per contract, not global', async () => {
    const otherLc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'REF-002' }, movementType: 'ISSUE', eventSeq: 1, amount: '50000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: otherLc.body.balanceContractId, movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '1000', currency: 'USD', sourceTransactionRef: '001-01', createdBy: 'maker1' })
      .expect(201);
  });
});

describe('HTTP integration — LC Issue requires Tenor Type, and Acceptance flow-control against it (business instruction 2026-08-14: "開證時必須輸入Tenor Type" / "不然流程控制無法處理")', () => {
  const app = createApp(createDb(':memory:'));

  test('Create Acceptance is REJECTED under a Sight-declared LC', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'FLOW-SIGHT' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'FLOW-SIGHT' }).expect(200);
    expect(lcContract.body.tenorType).toBe('SIGHT');

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'FLOW-SIGHT', ibNumber: 'IB-001' },
        parentLogicalContractId: lcContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/Sight LC/);
  });

  test("Create Acceptance is REJECTED when its own tenorType doesn't match the parent LC's declared tenorType", async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'FLOW-SELLERS' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SELLERS_USANCE', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'FLOW-SELLERS' }).expect(200);

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'FLOW-SELLERS', ibNumber: 'IB-002' },
        parentLogicalContractId: lcContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE', // mismatch — parent says SELLERS_USANCE
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.message).toMatch(/does not match/);
  });

  test('Create Acceptance SUCCEEDS when tenorType matches a Usance-declared parent LC', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'FLOW-BUYERS' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'BUYERS_USANCE', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'FLOW-BUYERS' }).expect(200);

    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'FLOW-BUYERS', ibNumber: 'IB-003' },
        parentLogicalContractId: lcContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        createdBy: 'maker1',
      })
      .expect(201);
  });
});

describe('HTTP integration — Maker EC (Delete Pending), business instruction 2026-08-15', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;

  test('setup: Issue LC0005 for 100,000, released', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC0005' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('Maker cancels their own still-PENDING AMEND_INCREASE -> 200, CANCELLED, LC Confirmed Balance untouched', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);

    const cancelled = await request(app)
      .post(`/balance-movements/${amend.body.movementId}/cancel`)
      .send({ cancelledBy: 'maker1', reasonCode: 'TYPO' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.reasonCode).toBe('TYPO');

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.confirmedBalance).toBe('100000');
    expect(lcSnapshot.body.availableBalance).toBe('100000');
  });

  test('cancel without a reasonCode defaults to MAKER_EC', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 3, amount: '5000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    const cancelled = await request(app)
      .post(`/balance-movements/${amend.body.movementId}/cancel`)
      .send({ cancelledBy: 'maker1' })
      .expect(200);
    expect(cancelled.body.reasonCode).toBe('MAKER_EC');
  });

  test('cancel without cancelledBy -> 400', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 4, amount: '1000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({}).expect(400);
    // Clean up so it doesn't linger PENDING and pollute later tests' balance assertions on this same LC.
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
  });

  test('cancel an already-RELEASED movement -> 409, illegal transition (a Maker cannot EC something the Checker already finalized)', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_INCREASE', eventSeq: 5, amount: '2000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${amend.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
  });

  test('a CANCELLED movement never counts toward Available Balance, even after the fact', async () => {
    const utilize = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 6, amount: '30000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    let lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.pendingEarmarkTotal).toBe('-30000');

    await request(app).post(`/balance-movements/${utilize.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);

    lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.pendingEarmarkTotal).toBe('0');
    // Confirmed is 102,000 by this point (100,000 Issue + the 2,000 AMEND_INCREASE the earlier "already-
    // RELEASED" test released on this same shared LC) — Available should equal it exactly once the
    // CANCELLED UTILIZE's PENDING earmark is fully backed out.
    expect(lcSnapshot.body.availableBalance).toBe(lcSnapshot.body.confirmedBalance);
    expect(lcSnapshot.body.confirmedBalance).toBe('102000');
  });
});

describe('HTTP integration — Export Confirmation asset-side instruments (business instruction 2026-08-15, analysis/COMMON-BalanceComponent-ExportConfirmation-Gap-Analysis-zh.md)', () => {
  const app = createApp(createDb(':memory:'));
  let cnfLogicalId: string;
  let dfibId: string;
  let dfibCreateMovementId: string;
  let examEb03MovementId: string;

  test('setup: Confirmation LC E001 issued and released', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'E001' }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${cnf.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'E001' }).expect(200);
    cnfLogicalId = cnfContract.body.logicalContractId;
  });

  test('CNF_HONOUR_SIGHT proxy: create EPLC_DUE_FROM_ISSUING_BANK for 40,000, released', async () => {
    const dfib = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
        naturalKey: { lcNumber: 'E001', ibNumber: 'EB01' },
        parentLogicalContractId: cnfLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '40000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    dfibId = dfib.body.balanceContractId;
    dfibCreateMovementId = dfib.body.movementId;
    await request(app).post(`/balance-movements/${dfib.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const snapshot = await request(app).get(`/balance-contracts/${dfibId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('40000');
    expect(snapshot.body.availableBalance).toBe('40000');
  });

  test('CNF_REIMB proxy: REIMBURSE more than Available -> 409, rejected', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK', balanceContractId: dfibId, movementType: 'REIMBURSE', eventSeq: 2, amount: '50000', currency: 'USD', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds this record's Available Balance 40000/);
  });

  test('CNF_REIMB proxy: REIMBURSE exactly 40,000, released -> receivable fully cleared', async () => {
    const reimb = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK', balanceContractId: dfibId, movementType: 'REIMBURSE', eventSeq: 2, amount: '40000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${reimb.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const snapshot = await request(app).get(`/balance-contracts/${dfibId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('0');
    expect(snapshot.body.availableBalance).toBe('0');
  });

  // Business-reported gap 2026-08-15 ("B3 沒檢查到單金額超過 Balance餘額", repro'd with LC CU02 / EB E04 — a
  // 70,000 presentation against a Confirmation whose Available Balance was only 60,000 was accepted with zero
  // check). EPLC_EXAMINATION CREATE is MEMO_ONLY and correctly never moves the parent Confirmation's own
  // balance, but the presented amount must still be checked against what the Confirmation actually has
  // Available — a presentation that already exceeds Available could never be Honoured/Accepted in full.
  test('EX_DOC_RCV proxy: Present Docs amount exceeding parent Confirmation Available Balance -> 409, rejected', async () => {
    // E001's Available Balance is 60,000 at this point in the describe block (100,000 Issue minus the
    // 40,000 EPLC_DUE_FROM_ISSUING_BANK-triggering HONOUR would have reduced it, but no HONOUR/ACCEPT has
    // actually been posted against EPLC_CONFIRMATION itself yet in this describe block — only the proxy
    // DUE_FROM_ISSUING_BANK/REIMBURSE tests above ran directly against the DFIB contract, not the
    // Confirmation), so Available is still the full 100,000 Issue amount.
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'E001', ibNumber: 'EB02' },
        parentLogicalContractId: cnfLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '150000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds the parent Confirmation's Present Earmark-adjusted Available Balance 100000/);
  });

  test('EX_DOC_RCV proxy: Present Docs amount within parent Confirmation Available Balance -> 201, MEMO_ONLY (Confirmation balance untouched)', async () => {
    const exam = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'E001', ibNumber: 'EB03' },
        parentLogicalContractId: cnfLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '90000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'E001' }).expect(200);
    const cnfSnapshot = await request(app).get(`/balance-contracts/${cnfContract.body.balanceContractId}/balance`).expect(200);
    expect(cnfSnapshot.body.confirmedBalance).toBe('100000');
    expect(cnfSnapshot.body.availableBalance).toBe('100000');
    expect(exam.body.status).toBe('PENDING');
    examEb03MovementId = exam.body.movementId;
  });

  // Business-reported gap 2026-08-15 ("Export S001 都超 Present Docs. E01-E04 應該有一個 Present Earmark
  // Amount 控制 B3＋，B4－") — EB03 above is still PENDING (90,000), so it must now count against the next
  // presentation even though the Confirmation's own Available Balance (a single-presentation-in-isolation
  // view) still shows the full 100,000 — the two individually-fine amounts from these last two tests
  // (90,000 + 20,000 = 110,000) would together exceed the 100,000 Confirmation, which the OLD (2026-08-15,
  // same-day, later reversed) design would have missed entirely, same failure shape as the S001 repro
  // (E01 50,000 + E02 70,000 each individually passed against a 100,000 Available Confirmation).
  test('EX_DOC_RCV proxy: second presentation exceeding Present-Earmark-adjusted Available (10,000 headroom left after EB03) -> 409, rejected', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'E001', ibNumber: 'EB04' },
        parentLogicalContractId: cnfLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '20000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/Present Earmark-adjusted Available Balance 10000 \(Available Balance 100000 minus 90000 already-outstanding Present Docs earmark/);
  });

  test('EX_DOC_RCV proxy: second presentation exactly at the remaining Present-Earmark-adjusted headroom (10,000) -> 201', async () => {
    const exam = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'E001', ibNumber: 'EB05' },
        parentLogicalContractId: cnfLogicalId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(exam.body.status).toBe('PENDING');
  });

  // Business instruction 2026-08-15 ("Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
  // 來控制 — B3 Summit => Bill Amount + 至 Present Docs Earmark Pending") — before either presentation
  // above (EB03 90,000, EB05 10,000) has been acknowledged, both sit in the Pending bucket.
  test('Confirmation balance snapshot: presentDocsEarmarkPending 100000 (EB03+EB05), presentDocsEarmarkApproved 0', async () => {
    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'E001' }).expect(200);
    const cnfSnapshot = await request(app).get(`/balance-contracts/${cnfContract.body.balanceContractId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkPending).toBe('100000');
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('0');
  });

  // ("B3 Release => Present Docs Earmark Pending - Bill Amount, Present Docs Earmark Approved + Bill
  // Amount") — acknowledging EB03 moves its 90,000 from Pending to Approved; status stays PENDING
  // throughout (B4 must still be able to find and consume it).
  test('POST /balance-movements/:id/acknowledge: EB03 moves Pending -> Approved, status stays PENDING', async () => {
    const ack = await request(app)
      .post(`/balance-movements/${examEb03MovementId}/acknowledge`)
      .send({ acknowledgedBy: 'checker1' })
      .expect(200);
    expect(ack.body.status).toBe('PENDING');
    expect(ack.body.acknowledgedBy).toBe('checker1');
    expect(ack.body.acknowledgedAt).toBeTruthy();

    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'E001' }).expect(200);
    const cnfSnapshot = await request(app).get(`/balance-contracts/${cnfContract.body.balanceContractId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkPending).toBe('10000');
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('90000');
  });

  test('POST /balance-movements/:id/acknowledge: acknowledging the same movement twice -> 409, rejected', async () => {
    const res = await request(app)
      .post(`/balance-movements/${examEb03MovementId}/acknowledge`)
      .send({ acknowledgedBy: 'checker1' })
      .expect(409);
    expect(res.body.message).toMatch(/already acknowledged by checker1/);
  });

  test('POST /balance-movements/:id/acknowledge: rejects a non-EPLC_EXAMINATION movement -> 400', async () => {
    const res = await request(app)
      .post(`/balance-movements/${dfibCreateMovementId}/acknowledge`)
      .send({ acknowledgedBy: 'checker1' })
      .expect(400);
    expect(res.body.message).toMatch(/acknowledge\(\) only applies to an EPLC_EXAMINATION CREATE movement/);
  });
});
