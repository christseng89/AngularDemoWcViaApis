/**
 * End-to-end HTTP integration test — replays Import Case 1 (Sight, no SHGT)
 * through the real Express app + SQLite (:memory:), proving the whole
 * stack (routes -> service -> domain -> store -> db) works together, not
 * just the domain functions in isolation (see caseWalkthroughs.test.ts).
 */
import request from 'supertest';
import { createDb } from '../../src/db';
import { createApp } from '../../src/app';
import { BalanceService } from '../../src/service/balanceService';

describe('HTTP integration — Import Case 1 (Sight, no SHGT)', () => {
  const app = createApp(createDb(':memory:'));
  let lcBalanceContractId: string;

  test('1. LC Issue 100,000, Tolerance 10% -> Ceiling 110,000', async () => {
    const createRes = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tolerancePct: '10',
        tenorType: 'SIGHT',
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
        sourceTransactionRef: 'AMD-001',
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
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(createRes.body.status).toBe('PENDING');
    expect(createRes.body.warnings).toBeNull();
    utilizeMovementId = createRes.body.movementId;
  });

  test('4. Accept Pay 50,000 -> LC settles at 71,000', async () => {
    await request(app).post(`/balance-movements/${utilizeMovementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
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
        sourceTransactionRef: 'IB-001',
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
        sourceTransactionRef: 'AMD-002',
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
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0002' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tolerancePct: '10',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 30,
        createdBy: 'maker1',
      })
      .expect(201);
    lcId = lc.body.balanceContractId;
    expect(lc.body.ceilingAmount).toBe('110000');
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
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
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 3, amount: '50000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds Tight Available Balance 21000/);
  });

  let sgRedeemMovementId: string;
  let matchedUtilizeMovementId: string;

  test('"Document Arrival w/ Shipping Gtee" (full match only): Maker creates the SG\'s own FULL_REDEEM as PENDING FIRST — for 100,000, the SG\'s entire current outstanding, "protected and carried" from the SG record, not typed', async () => {
    const redeem = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '100000',
        currency: 'USD',
        createdBy: 'maker1',
        businessEventId: 'A3-SG-demo-1',
      })
      .expect(201);
    sgRedeemMovementId = redeem.body.movementId;
    expect(redeem.body.status).toBe('PENDING');
  });

  test("Maker then creates the LC's own UTILIZE for the same 100,000 — passes with NO error, because computeOffBalanceExposure() already counts the PENDING FULL_REDEEM above, netting this SG's exposure out of Tight Available before this check ever runs", async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'UTILIZE',
        eventSeq: 4,
        amount: '100000',
        currency: 'USD',
        sourceTransactionRef: 'IB-002',
        createdBy: 'maker1',
        businessEventId: 'A3-SG-demo-1',
      })
      .expect(201);
    matchedUtilizeMovementId = res.body.movementId;
    expect(res.body.status).toBe('PENDING');
  });

  test('Checker approves BOTH with one compound Release action — SG redemption first, then the Document Arrival (component.ts release() ordering) — LC settles at 21,000, SG at 0', async () => {
    await request(app).post(`/balance-movements/${sgRedeemMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    // Widened 2026-08-27 (business-confirmed) — this LC's own UTILIZE is an explicit-tenor (SELLERS_USANCE)
    // IPLC_LC/UTILIZE, so a direct /release now requires makerSubmittedAt first, same gate Sight/A4
    // already had; this test isn't about that gate, just needs the movement genuinely RELEASED.
    await request(app).post(`/balance-movements/${matchedUtilizeMovementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
    await request(app).post(`/balance-movements/${matchedUtilizeMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.confirmedBalance).toBe('21000');

    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.confirmedBalance).toBe('0');
  });
});

describe('HTTP integration — AMEND_DECREASE now checked against Tight Available Balance, not plain Available (business instruction 2026-08-20, "A2 Decrease 輸入金額控制規則 B2, A3 & B3 都適用")', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;

  test('setup: LC0002B Issue 100,000 (no tolerance) + SG 10,000 outstanding -> plain Available 100,000, Tight Available 90,000', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC0002B' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC0002B' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC0002B', sgNumber: 'SG0002B' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.availableBalance).toBe('100000');
    expect(lcSnapshot.body.tightAvailableBalance).toBe('90000');
  });

  test('a Decrease of 95,000 -- within plain Available (100,000) but exceeding Tight Available (90,000) -- is now REJECTED (would leave only 5,000 of real capacity under a 10,000 outstanding SG)', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_DECREASE', eventSeq: 2, amount: '95000', currency: 'USD', sourceTransactionRef: 'AMD-001', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    expect(res.body.message).toMatch(/exceeds Tight Available Balance \(90000/);
  });

  test('a Decrease of 90,000 -- exactly Tight Available -- is accepted', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'AMEND_DECREASE', eventSeq: 3, amount: '90000', currency: 'USD', sourceTransactionRef: 'AMD-002', createdBy: 'maker1' })
      .expect(201);
    expect(res.body.status).toBe('PENDING');
  });
});

describe('HTTP integration — a still-PENDING (not yet Checker-approved) SG redemption must not prematurely release its own off-balance-sheet capacity for an UNRELATED submission (business-reported scenario 2026-08-20, "SG 贖回提早放行" — imported machinery, take-delivery-before-documents)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;
  let sgId: string;

  test('setup: LC S01-shape Issue 1,000,000 (no tolerance) + SG G01 800,000 issued and Released -> Confirmed 1,000,000, Off-Balance Exposure 800,000, Tight Available 200,000', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S01-SHAPE' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '1000000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'S01-SHAPE' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S01-SHAPE', sgNumber: 'G01' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '800000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    sgId = sg.body.balanceContractId;
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.offBalanceExposure).toBe('800000');
    expect(lcSnapshot.body.tightAvailableBalance).toBe('200000');
  });

  let redeemMovementId: string;

  test("Maker Submits G01's own FULL_REDEEM standalone (NOT part of an A3S compound submission -- no businessEventId shared with anything) -- stays PENDING, awaiting Checker", async () => {
    const redeem = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'FULL_REDEEM', eventSeq: 2, amount: '800000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);
    redeemMovementId = redeem.body.movementId;
    expect(redeem.body.status).toBe('PENDING');
  });

  test("BEFORE the Checker approves that redemption, the LC's own Tight Available Balance must NOT already reflect it -- still 200,000, not 1,000,000", async () => {
    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.offBalanceExposure).toBe('800000');
    expect(lcSnapshot.body.tightAvailableBalance).toBe('200000');
  });

  test('a SECOND, unrelated SG Issue for 900,000 under the SAME LC is REJECTED against the still-800,000 exposure -- the unapproved redemption must not have freed capacity for it', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S01-SHAPE', sgNumber: 'G02' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '900000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds parent LC's Tight Available Balance 200000/);
  });

  test('a plain, unmatched Document Arrival for 300,000 (no businessEventId) is ALSO rejected against the still-800,000 exposure, not the prematurely-freed figure', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 2, amount: '300000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds Tight Available Balance 200000/);
  });

  test('once the Checker genuinely Releases the redemption, Off-Balance Exposure and Tight Available Balance update for real -- 0 and 1,000,000', async () => {
    await request(app).post(`/balance-movements/${redeemMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.offBalanceExposure).toBe('0');
    expect(lcSnapshot.body.tightAvailableBalance).toBe('1000000');
  });

  test('the SAME 900,000 SG Issue now succeeds -- capacity was genuinely freed this time', async () => {
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S01-SHAPE', sgNumber: 'G02' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '900000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
  });
});

describe('HTTP integration — A3S\'s OWN matched SG redemption must still net for Tight Available Balance display (both the live GET .../balance query and the movement\'s own persisted eventSnapshot) — the OPPOSITE case from the previous describe block (business-reported live scenario 2026-08-20, "A35 Refer to S02 G02 Tight Available Balance -8000???")', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;
  let sgId: string;

  test('setup: LC S02-shape Issue 10,000 (no tolerance) + SG G02 8,000 issued and Released -> Confirmed 10,000, Off-Balance Exposure 8,000, Tight Available 2,000', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S02-SHAPE' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '10000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'S02-SHAPE' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S02-SHAPE', sgNumber: 'G02' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '8000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    sgId = sg.body.balanceContractId;
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.offBalanceExposure).toBe('8000');
    expect(lcSnapshot.body.tightAvailableBalance).toBe('2000');
  });

  test("A35 (Document Arrival w/ Shipping Gtee), Bill Amount 10,000: Maker creates the SG's own FULL_REDEEM (8,000, MIN of Bill Amount/SG Outstanding) PENDING first, then the LC's own UTILIZE (10,000) PENDING, sharing one businessEventId", async () => {
    const redeem = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '8000',
        currency: 'USD',
        createdBy: 'maker1',
        businessEventId: 'S02-G02-demo',
      })
      .expect(201);
    expect(redeem.body.status).toBe('PENDING');

    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
        businessEventId: 'S02-G02-demo',
      })
      .expect(201);
    expect(utilize.body.status).toBe('PENDING');

    // The movement's OWN persisted eventSnapshot (frozen at this exact Submit) must show the SG's matched
    // 8,000 already netted -- only the incremental 2,000 (Bill Amount 10,000 minus SG's own 8,000) is
    // genuinely NEW LC-side occupancy, not the full 10,000 double-counted against the already-8,000
    // off-balance exposure.
    expect(utilize.body.eventSnapshot.offBalanceExposure).toBe('0');
    expect(utilize.body.eventSnapshot.tightAvailableBalance).toBe('0');
  });

  test('the LIVE GET .../balance query immediately after Submit ALSO shows the netted figures, not the double-counted -8,000 (Pending Earmark Total splits as +8,000 SG-side / -2,000 LC-side net, per the business-confirmed live numbers)', async () => {
    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.confirmedBalance).toBe('10000');
    expect(lcSnapshot.body.availableBalance).toBe('0');
    expect(lcSnapshot.body.offBalanceExposure).toBe('0');
    expect(lcSnapshot.body.tightAvailableBalance).toBe('0');
  });

  test('an UNRELATED, standalone new SG Issue under the SAME LC is still correctly checked against the un-netted 8,000 exposure -- the matched-pair exception never leaks to a genuinely different submission', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S02-SHAPE', sgNumber: 'G03' },
        parentLogicalContractId: lcLogicalId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '5000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    // Confirmed 10,000 minus PendingDecreaseTotal 10,000 (the UTILIZE) minus 8,000 (G02's own still-PENDING,
    // un-netted-for-this-DIFFERENT-request exposure) = -8,000 -- G03 has no businessEventId in common with
    // either leg of the A35 pair above, so it must not benefit from that pair's own netting.
    expect(res.body.message).toMatch(/exceeds parent LC's Tight Available Balance -8000/);
  });
});

describe('HTTP integration — SG Issue capped at parent LC Available Balance (business instruction 2026-08-14, override of Design doc §5/§11)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;

  test('setup: Issue LC0003 for 3,000, no tolerance', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0003' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '3000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
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

  test("v0.11: a SECOND SG Issue for just 1 more -> 409, netted against the first SG's own outstanding exposure, not just the LC's plain Available Balance", async () => {
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
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0004' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
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
    // businessEventId (2026-08-24, A9 Full-Redeem-only server-side guard) — this describe block tests
    // checkRedeemSufficiency()'s own commitment-control logic, which applies identically to A3S's own
    // matched Partial Redeem leg; a standalone (no businessEventId) Partial Redeem is now rejected
    // outright before this logic ever runs, so these fixtures represent an A3S-shaped matched call.
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgId,
        movementType: 'PARTIAL_REDEEM',
        eventSeq: 2,
        amount: '7000',
        currency: 'USD',
        businessEventId: 'LC0004-arrival',
        createdBy: 'maker1',
      })
      .expect(201);

    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.confirmedBalance).toBe('10000');
    expect(sgSnapshot.body.availableBalance).toBe('3000');
  });

  test('second redemption for 5,000 (<= Confirmed 10,000 but > the 3,000 actually still Available) -> 409, rejected', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgId,
        movementType: 'PARTIAL_REDEEM',
        eventSeq: 3,
        amount: '5000',
        currency: 'USD',
        businessEventId: 'LC0004-arrival-2',
        createdBy: 'maker1',
      })
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
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgId,
        movementType: 'PARTIAL_REDEEM',
        eventSeq: 4,
        amount: '3000',
        currency: 'USD',
        businessEventId: 'LC0004-arrival-3',
        createdBy: 'maker1',
      })
      .expect(201);

    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.availableBalance).toBe('0');
    expect(sgSnapshot.body.pendingEarmarkTotal).toBe('-10000');
  });
});

describe('HTTP integration — A9 Full-Redeem-only server-side guard (business-confirmed 2026-08-24, "A9 Full-Redeem-only 目前只在 Angular UI 層鎖定, API MAKER & CHECKER也要")', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;
  let lcLogicalId: string;
  let sgId: string;

  test('setup: Issue LC-A9G for 100,000, then SG-A9G for 10,000, both released', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-A9G' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-A9G' }).expect(200);
    lcLogicalId = lcContract.body.logicalContractId;

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC-A9G', sgNumber: 'SG-A9G' },
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

  test('Maker: a standalone Partial Redeem (no businessEventId) is rejected at Submit -> 409', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'PARTIAL_REDEEM', eventSeq: 2, amount: '4000', currency: 'USD', createdBy: 'maker1' })
      .expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_AVAILABLE_BALANCE');
    expect(res.body.message).toMatch(/A9 \(Shipping Guarantee Redemption\) must be Full Redeem only/);

    // Confirms the rejection actually prevented the DB write.
    const sgSnapshot = await request(app).get(`/balance-contracts/${sgId}/balance`).expect(200);
    expect(sgSnapshot.body.availableBalance).toBe('10000');
  });

  test('Maker: a standalone Full Redeem (no businessEventId) is still accepted -> 201', async () => {
    const full = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'SHGT', balanceContractId: sgId, movementType: 'FULL_REDEEM', eventSeq: 3, amount: '10000', currency: 'USD', createdBy: 'maker1' })
      .expect(201);

    // Clean up so it doesn't linger PENDING and affect the next test's own snapshot assertions.
    await request(app).post(`/balance-movements/${full.body.movementId}/reject`).send({ releasedBy: 'checker1', reasonCode: 'TEST_CLEANUP' }).expect(200);
  });

  test('Maker: a matched Partial Redeem (businessEventId set, A3S-shaped) is still accepted -> 201', async () => {
    const matched = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgId,
        movementType: 'PARTIAL_REDEEM',
        eventSeq: 4,
        amount: '4000',
        currency: 'USD',
        businessEventId: `${lcId}-arrival`,
        createdBy: 'maker1',
      })
      .expect(201);

    // Clean up.
    await request(app).post(`/balance-movements/${matched.body.movementId}/reject`).send({ releasedBy: 'checker1', reasonCode: 'TEST_CLEANUP' }).expect(200);
  });

  test('Checker: release() re-checks the same rule for a standalone Partial Redeem that reached PENDING some other way -> 409', async () => {
    // Directly instantiate a second BalanceService against the SAME db to create a movement bypassing
    // createMovement()'s own Maker-side gate — same "reached PENDING some other way" scenario
    // assertValidAmount()'s own doc comment already establishes a precedent for testing this way.
    const db = createDb(':memory:');
    const service = new BalanceService(db);
    const lc = service.createMovement({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-A9G2' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' });
    if (!lc.created) throw new Error('expected a new movement');
    service.release(lc.movement.movementId, 'checker1');
    const lcContract = service.resolveContract('IPLC_LC', { lcNumber: 'LC-A9G2' });
    if (!lcContract) throw new Error('expected the just-issued LC to resolve');
    const sg = service.createMovement({
      instrumentType: 'SHGT',
      naturalKey: { lcNumber: 'LC-A9G2', sgNumber: 'SG-A9G2' },
      parentLogicalContractId: lcContract.logicalContractId,
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      createdBy: 'maker1',
    });
    if (!sg.created) throw new Error('expected a new movement');
    service.release(sg.movement.movementId, 'checker1');

    // Bypass the Maker-side gate directly via the store, simulating a movement that reached PENDING
    // some other way (a future second caller, a migration, a seeded fixture) rather than through
    // createMovement()'s own guarded path.
    const bypassed = service.createMovement({
      instrumentType: 'SHGT',
      balanceContractId: sg.movement.balanceContractId,
      movementType: 'PARTIAL_REDEEM',
      eventSeq: 2,
      amount: '4000',
      currency: 'USD',
      businessEventId: 'bypass-be',
      createdBy: 'maker1',
    });
    if (!bypassed.created) throw new Error('expected a new movement');
    // Strip the businessEventId directly via the store to simulate a movement that reached PENDING
    // without one, bypassing the Maker-side gate that would otherwise have blocked it.
    db.exec(`UPDATE balance_movements SET business_event_id = NULL WHERE movement_id = '${bypassed.movement.movementId}'`);

    expect(() => service.release(bypassed.movement.movementId, 'checker1')).toThrow(/A9 \(Shipping Guarantee Redemption\) must be Full Redeem only/);
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
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'TIMELINE-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    lcId = issue.body.balanceContractId;
    issueMovementId = issue.body.movementId;
    await request(app).post(`/balance-movements/${issueMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: '20000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    amendMovementId = amend.body.movementId;
    await request(app).post(`/balance-movements/${amendMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    // Confirmed now 80,000.

    const utilize = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 3, amount: '30000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
      .expect(201);
    utilizeMovementId = utilize.body.movementId;
    await request(app).post(`/balance-movements/${utilizeMovementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
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

  // Bug fixed 2026-08-17, user-reported (two concrete A1/A8 snapshot examples: Off-Balance Exposure 0
  // for the LC Issue event, 20000 once a 20000 Shipping Guarantee is issued afterward) — offBalanceExposure/
  // tightAvailableBalance used to always reflect the SHGT side's CURRENT/live state regardless of which
  // event was selected. Issues a Shipping Guarantee AFTER every event above already captured its own
  // movementId, then re-checks those SAME already-captured events still show pre-SG figures.
  test('offBalanceExposure/tightAvailableBalance are ALSO point-in-time: an SHGT issued after this LC\'s own earlier events must not retroactively appear in their own balance-as-of', async () => {
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'TIMELINE-001' }).expect(200);
    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'TIMELINE-001', sgNumber: 'SG-TIMELINE-001' },
        parentLogicalContractId: lcContract.body.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    // The three events captured BEFORE the SG existed must still show 0 exposure — not today's 20000.
    for (const movementId of [issueMovementId, amendMovementId, utilizeMovementId]) {
      const asOf = await request(app).get(`/balance-movements/${movementId}/balance-as-of`).expect(200);
      expect(asOf.body.offBalanceExposure).toBe('0');
      expect(asOf.body.tightAvailableBalance).toBe(asOf.body.availableBalance);
    }

    // The LC's own LIVE snapshot (as of now, after the SG exists) correctly shows the new exposure —
    // offBalanceExposure itself is only ever populated on the IPLC_LC/EPLC_LC side, never on SHGT's own.
    const live = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(live.body.offBalanceExposure).toBe('20000');
    expect(live.body.tightAvailableBalance).toBe('30000');
  });
});

describe('HTTP integration — presentDocsEarmarkPending/Approved are ALSO point-in-time (2026-08-17, same fix as offBalanceExposure above, EPLC_CONFIRMATION/EPLC_EXAMINATION side)', () => {
  const app = createApp(createDb(':memory:'));

  test('an EPLC_EXAMINATION (B3) created after a Confirmation\'s own Issue event does not retroactively appear in that Issue event\'s own balance-as-of', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'PIT-CNF-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const cnfIssueMovementId = cnf.body.movementId;
    await request(app).post(`/balance-movements/${cnfIssueMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const issueAsOfBeforeExam = await request(app).get(`/balance-movements/${cnfIssueMovementId}/balance-as-of`).expect(200);
    expect(issueAsOfBeforeExam.body.presentDocsEarmarkPending).toBe('0');
    expect(issueAsOfBeforeExam.body.presentDocsEarmarkApproved).toBe('0');

    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'PIT-CNF-001' }).expect(200);
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'PIT-CNF-001', ibNumber: 'EB01' },
        parentLogicalContractId: cnfContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '30000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    // Re-checking the SAME already-captured Issue event must still show 0 — not today's 30000.
    const issueAsOfAfterExam = await request(app).get(`/balance-movements/${cnfIssueMovementId}/balance-as-of`).expect(200);
    expect(issueAsOfAfterExam.body.presentDocsEarmarkPending).toBe('0');
    expect(issueAsOfAfterExam.body.presentDocsEarmarkApproved).toBe('0');

    // The live snapshot (as of now, after the presentation exists) correctly shows it.
    const live = await request(app).get(`/balance-contracts/${cnf.body.balanceContractId}/balance`).expect(200);
    expect(live.body.presentDocsEarmarkPending).toBe('30000');
  });
});

describe('HTTP integration — Tenor Type Routing (business instruction 2026-08-14, Design doc §7 v0.7)', () => {
  const app = createApp(createDb(':memory:'));

  test("Seller's Usance and Buyer's Usance Acceptances both persist their own tenorType, with IDENTICAL Balance mechanics", async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'TENOR-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    // Widened 2026-08-27 (business-confirmed) — a direct /release on an explicit-tenor IPLC_LC/UTILIZE
    // now requires makerSubmittedAt first, same gate Sight/A4 already had; this test isn't about that
    // gate, just needs the movement genuinely RELEASED before creating the Acceptances below.
    await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
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

    const contract = await request(app)
      .get('/balance-contracts')
      .query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'TENOR-001', ibNumber: 'IB-SELLERS' })
      .expect(200);
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

    const buyersContract = await request(app)
      .get('/balance-contracts')
      .query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'TENOR-001', ibNumber: 'IB-BUYERS' })
      .expect(200);
    expect(buyersContract.body.tenorType).toBe('BUYERS_USANCE');
    expect(buyersContract.body.tenorDays).toBe(120);
  });
});

describe('HTTP integration — cannot re-ISSUE an already-ACTIVE natural key (business-reported gap 2026-08-14)', () => {
  const app = createApp(createDb(':memory:'));

  test('first ISSUE succeeds; a second ISSUE against the SAME LC Number is rejected, not silently applied on top', async () => {
    const first = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'DUP-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${first.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const second = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'DUP-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 2,
        amount: '999999',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(second.body.code).toBe('NATURAL_KEY_ALREADY_EXISTS');

    // Confirmed Balance must NOT have doubled — still exactly the first Issue's 100,000.
    const snapshot = await request(app).get(`/balance-contracts/${first.body.balanceContractId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('100000');
  });

  test('the same guard applies to CREATE on IPLC_ACCEPTANCE (LC Number + IB Number natural key)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'DUP-002' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const firstAcceptance = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'DUP-002', ibNumber: 'IB-001' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${firstAcceptance.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const secondAcceptance = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'DUP-002', ibNumber: 'IB-001' },
        movementType: 'CREATE',
        eventSeq: 2,
        amount: '77777',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
      .expect(409);
    expect(secondAcceptance.body.code).toBe('NATURAL_KEY_ALREADY_EXISTS');
  });

  test('a DIFFERENT LC Number is unaffected — this guard is per natural key, not global', async () => {
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'DUP-003' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'DUP-004' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '200000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
  });
});

describe('HTTP integration — secondary reference (sourceTransactionRef) must be unique per contract (business-reported gap 2026-08-14)', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;

  test('setup: Issue LC', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'REF-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    lcId = issue.body.balanceContractId;
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('first Amendment with reference "001-01" succeeds', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: '001-01',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(res.body.sourceTransactionRef).toBe('001-01');
    await request(app).post(`/balance-movements/${res.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('a SECOND Amendment reusing the SAME reference "001-01" is rejected — even with a different eventSeq/amount', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 3,
        amount: '5000',
        currency: 'USD',
        sourceTransactionRef: '001-01',
        createdBy: 'maker1',
      })
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
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 4,
        amount: '5000',
        currency: 'USD',
        sourceTransactionRef: '001-02',
        createdBy: 'maker1',
      })
      .expect(201);
  });

  test('the SAME reference "001-01" is fine on a DIFFERENT contract — uniqueness is per contract, not global', async () => {
    const otherLc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'REF-002' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app)
      .post(`/balance-movements/${otherLc.body.movementId}/release`)
      .send({ releasedBy: 'checker1' })
      .expect(200);
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: otherLc.body.balanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '1000',
        currency: 'USD',
        sourceTransactionRef: '001-01',
        createdBy: 'maker1',
      })
      .expect(201);
  });
});

describe('HTTP integration — LC Issue requires Tenor Type, and Acceptance flow-control against it (business instruction 2026-08-14: "開證時必須輸入Tenor Type" / "不然流程控制無法處理")', () => {
  const app = createApp(createDb(':memory:'));

  test('Create Acceptance is REJECTED under a Sight-declared LC', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'FLOW-SIGHT' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
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
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'FLOW-SELLERS' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
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
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'FLOW-BUYERS' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        tenorDays: 120,
        createdBy: 'maker1',
      })
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
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0005' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('Maker cancels their own still-PENDING AMEND_INCREASE -> 200, CANCELLED, LC Confirmed Balance untouched', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);

    const cancelled = await request(app)
      .post(`/balance-movements/${amend.body.movementId}/cancel`)
      .send({ cancelledBy: 'maker1', reasonCode: 'TYPO' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.reasonCode).toBe('TYPO');
    // 2026-08-20: cancel() writes its own cancelledBy/cancelledAt pair, not releasedBy/releasedAt.
    expect(cancelled.body.cancelledBy).toBe('maker1');
    expect(cancelled.body.cancelledAt).toBeTruthy();
    expect(cancelled.body.releasedBy).toBeNull();
    expect(cancelled.body.releasedAt).toBeNull();

    const lcSnapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(lcSnapshot.body.confirmedBalance).toBe('100000');
    expect(lcSnapshot.body.availableBalance).toBe('100000');
  });

  test('cancel without a reasonCode defaults to MAKER_EC', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 3,
        amount: '5000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-002',
        createdBy: 'maker1',
      })
      .expect(201);
    const cancelled = await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
    expect(cancelled.body.reasonCode).toBe('MAKER_EC');
  });

  test('cancel without cancelledBy -> 400', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 4,
        amount: '1000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-003',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({}).expect(400);
    // Clean up so it doesn't linger PENDING and pollute later tests' balance assertions on this same LC.
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
  });

  test('cancel an already-RELEASED movement -> 409, illegal transition (a Maker cannot EC something the Checker already finalized)', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 5,
        amount: '2000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-004',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${amend.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
  });

  test('a CANCELLED movement never counts toward Available Balance, even after the fact', async () => {
    const utilize = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: lcId, movementType: 'UTILIZE', eventSeq: 6, amount: '30000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
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
  let examEb03MovementId: string;

  test('setup: Confirmation LC E001 issued and released', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'E001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
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
    await request(app).post(`/balance-movements/${dfib.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const snapshot = await request(app).get(`/balance-contracts/${dfibId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('40000');
    expect(snapshot.body.availableBalance).toBe('40000');
  });

  test('CNF_REIMB proxy: REIMBURSE more than Available -> 409, rejected', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
        balanceContractId: dfibId,
        movementType: 'REIMBURSE',
        eventSeq: 2,
        amount: '50000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/exceeds this record's Available Balance 40000/);
  });

  test('CNF_REIMB proxy: REIMBURSE exactly 40,000, released -> receivable fully cleared', async () => {
    const reimb = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
        balanceContractId: dfibId,
        movementType: 'REIMBURSE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        createdBy: 'maker1',
      })
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
    expect(res.body.message).toMatch(/exceeds the parent Confirmation's Present Earmark-adjusted Tight Available Balance 100000/);
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
    // 2026-08-18, user-requested — EPLC_CONFIRMATION now also gets a tightAvailableBalance, same
    // purpose as IPLC_LC/EPLC_LC's own SHGT-based figure but netting the Present Docs earmark instead:
    // Confirmed 100000 (no still-PENDING decreases here) minus the 90000 still-PENDING EB03 earmark.
    expect(cnfSnapshot.body.tightAvailableBalance).toBe('10000');
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
    expect(res.body.message).toMatch(
      /Present Earmark-adjusted Tight Available Balance 10000 \(Confirmed Balance 100000 minus 0 still-PENDING decrease\(s\) minus 90000 already-outstanding Present Docs earmark/,
    );
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
    // Both presentations combined (90000 + 10000) now exactly consume the 100000 Available Balance.
    expect(cnfSnapshot.body.tightAvailableBalance).toBe('0');
  });

  // SUPERSEDED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易") — B3's
  // own Checker action is now the standard, real /release call (PENDING -> RELEASED), not the removed
  // /acknowledge acknowledgment-only endpoint. "B3 Release => Present Docs Earmark Pending - Bill Amount,
  // Present Docs Earmark Approved + Bill Amount" now reads: releasing EB03 moves its 90,000 from Pending
  // to Approved, status genuinely becomes RELEASED (EARMARKED) — and, per the SAME date's basis change,
  // it still occupies the SAME 90,000 of capacity in Approved until B4 later consumes it.
  test('POST /balance-movements/:id/release on a Present Docs (EPLC_EXAMINATION) movement: EB03 moves Pending -> Approved, status becomes RELEASED', async () => {
    const released = await request(app).post(`/balance-movements/${examEb03MovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    expect(released.body.status).toBe('RELEASED');
    expect(released.body.releasedBy).toBe('checker1');
    expect(released.body.presentDocsConsumedAt).toBeNull();

    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'E001' }).expect(200);
    const cnfSnapshot = await request(app).get(`/balance-contracts/${cnfContract.body.balanceContractId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkPending).toBe('10000');
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('90000');
    // tightAvailableBalance nets Pending+Approved COMBINED (computePresentDocsEarmark), so shifting
    // 90000 from one bucket to the other leaves the total, and this figure, unchanged at 0.
    expect(cnfSnapshot.body.tightAvailableBalance).toBe('0');
  });

  test('POST /balance-movements/:id/release on the SAME already-RELEASED Present Docs movement -> 409, ILLEGAL_STATE_TRANSITION (B4 must never attempt to re-release it — it consumes it via referencedTransactionId instead, see the dedicated describe block below)', async () => {
    const res = await request(app).post(`/balance-movements/${examEb03MovementId}/release`).send({ releasedBy: 'checker2' }).expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    expect(res.body.message).toMatch(/not a legal transition/);
  });
});

/**
 * 2026-08-18, business instruction ("所有交易要RELEASE過後 才能根據流程走下一個交易") — HTTP-level,
 * end-to-end proof of the full B3->B4 flow: B3's own real /release (a standalone Checker action, no
 * longer acknowledge()), then B4's own compound /release on its linked HONOUR (which no longer
 * re-releases the B3 record — it's already RELEASED — but instead marks it consumed as a side effect,
 * via that HONOUR's own referencedTransactionId). Complements the direct-service tests in
 * balanceService.test.ts (same behavior, proven through the real HTTP request/response cycle here).
 */
describe('HTTP integration — B3 (Present Docs) real Release, then B4 consumes it via referencedTransactionId (2026-08-18)', () => {
  const app = createApp(createDb(':memory:'));

  test('B3 releases on its own (EARMARKED); B4\'s own linked HONOUR release then marks it consumed, dropping it out of Present Docs Earmark', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'B3B4-HTTP-001' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${cnf.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'B3B4-HTTP-001' }).expect(200);

    const exam = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'B3B4-HTTP-001', ibNumber: 'E01' },
        parentLogicalContractId: cnfContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '30000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    // B3's own real, standalone Checker Release — the ONLY way this ever reaches RELEASED now.
    const examReleased = await request(app).post(`/balance-movements/${exam.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    expect(examReleased.body.status).toBe('RELEASED');
    expect(examReleased.body.presentDocsConsumedAt).toBeNull();

    let cnfSnapshot = await request(app).get(`/balance-contracts/${cnfContract.body.balanceContractId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('30000');

    // B4: Maker submits the linked Honour, referencing the (already-RELEASED) B3 record.
    const honour = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: cnfContract.body.balanceContractId,
        movementType: 'HONOUR',
        eventSeq: 2,
        amount: '30000',
        currency: 'USD',
        sourceTransactionRef: 'E01',
        referencedTransactionId: exam.body.movementId,
        createdBy: 'maker1',
      })
      .expect(201);

    // B4's Checker Release — releases ONLY the Honour itself (never re-releases the B3 record, which
    // would 409) — and, as a side effect, marks the B3 record consumed.
    await request(app).post(`/balance-movements/${honour.body.movementId}/release`).send({ releasedBy: 'checker2' }).expect(200);

    const examMovements = await request(app).get(`/balance-contracts/${exam.body.balanceContractId}/movements`).expect(200);
    const consumedExam = examMovements.body.find((m: { movementId: string }) => m.movementId === exam.body.movementId);
    expect(consumedExam.status).toBe('RELEASED');
    expect(consumedExam.presentDocsConsumedAt).toBeTruthy();
    expect(consumedExam.presentDocsConsumedBy).toBe('checker2');

    cnfSnapshot = await request(app).get(`/balance-contracts/${cnfContract.body.balanceContractId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('0');
    expect(cnfSnapshot.body.confirmedBalance).toBe('70000');
  });
});

describe('HTTP integration — B4\'s OWN still-PENDING Accept (Maker Submit, before Checker Release) must ALSO provisionally net the B3 record it references, not just at Release (business-reported scenario 2026-08-20, "B4 U02 也有類似問題 Tight Available Balance -10000" — Export-side twin of the SG one above)', () => {
  const app = createApp(createDb(':memory:'));
  let cnfId: string;
  let examMovementId: string;

  test('setup: B1 Confirm LC 10,000 Usance (Approved) -> B3 Present Docs 10,000 (Approved) -> Present Docs Earmark Approved 10,000, Tight Available 0', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'U02-SHAPE' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      })
      .expect(201);
    cnfId = cnf.body.balanceContractId;
    await request(app).post(`/balance-movements/${cnf.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'U02-SHAPE' }).expect(200);

    const exam = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'U02-SHAPE', ibNumber: 'E01' },
        parentLogicalContractId: cnfContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    examMovementId = exam.body.movementId;
    await request(app).post(`/balance-movements/${exam.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const cnfSnapshot = await request(app).get(`/balance-contracts/${cnfId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('10000');
    expect(cnfSnapshot.body.tightAvailableBalance).toBe('0');
  });

  test("B4 Maker Submits Acceptance 10,000 referencing the B3 record -- still PENDING (not yet Checker Release) -- Present Docs Earmark Approved must already read 0, and Tight Available Balance 0, not -10,000", async () => {
    const accept = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: cnfId,
        movementType: 'ACCEPT',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'E01',
        referencedTransactionId: examMovementId,
        createdBy: 'maker1',
      })
      .expect(201);
    expect(accept.body.status).toBe('PENDING');

    // The movement's own persisted eventSnapshot (frozen at this exact Submit) must show the netted figures.
    expect(accept.body.eventSnapshot.presentDocsEarmarkApproved).toBe('0');
    expect(accept.body.eventSnapshot.tightAvailableBalance).toBe('0');

    // The LIVE GET .../balance query immediately after Submit must ALSO show the netted figures.
    const cnfSnapshot = await request(app).get(`/balance-contracts/${cnfId}/balance`).expect(200);
    expect(cnfSnapshot.body.presentDocsEarmarkApproved).toBe('0');
    expect(cnfSnapshot.body.tightAvailableBalance).toBe('0');
    expect(cnfSnapshot.body.pendingEarmarkTotal).toBe('-10000');
  });

  test('an UNRELATED new Present Docs (B3) submission under the SAME Confirmation is still correctly checked against the un-netted 10,000 earmark -- the provisional-consumption exception never leaks to a genuinely different presentation', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'U02-SHAPE', ibNumber: 'E02' },
        parentLogicalContractId: (await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'U02-SHAPE' }).expect(200))
          .body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 2,
        amount: '5000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(409);
    // Confirmed 10,000 minus PendingDecreaseTotal 10,000 (the ACCEPT) minus 10,000 (E01's own still-PENDING
    // Accept notwithstanding, still un-netted for this DIFFERENT presentation's own check) = -10,000.
    expect(res.body.message).toMatch(/Present Earmark-adjusted Tight Available Balance -10000/);
  });
});

describe('POST /admin/reset-database — dev-only Business Case Runner "Cleanup Database Tables" button', () => {
  test('wipes every balance_movements/balance_contracts row', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);

    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'RESET-001' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '1000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);

    const res = await request(app).post('/admin/reset-database').expect(200);
    expect(res.body).toEqual({ status: 'ok' });

    expect((db.prepare('SELECT COUNT(*) AS n FROM balance_contracts').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM balance_movements').get() as { n: number }).n).toBe(0);

    // Confirms the same natural key can be re-ISSUEd afterward — a genuinely clean slate, not just an empty count.
    await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'RESET-001' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '1000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
  });

  // Regression test for a real bug: delete_pending_audit (added for the Fix Pending/Delete Pending
  // Phase, analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §10) has FK REFERENCES to
  // both balance_movements and balance_contracts with no ON DELETE CASCADE, and PRAGMA foreign_keys is
  // ON — once any Delete Pending had ever happened, this route 500'd with a foreign key constraint
  // failure instead of wiping the DB, because it never cleared delete_pending_audit first.
  test('also wipes delete_pending_audit — a prior Delete Pending must not 500 this route (FK constraint regression)', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);

    const created = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'RESET-002' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '1000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);

    await request(app)
      .post(`/balance-movements/${created.body.movementId}/cancel`)
      .send({ cancelledBy: 'maker1', reasonCode: 'MAKER_EC' })
      .expect(200);

    expect((db.prepare('SELECT COUNT(*) AS n FROM delete_pending_audit').get() as { n: number }).n).toBe(1);

    const res = await request(app).post('/admin/reset-database').expect(200);
    expect(res.body).toEqual({ status: 'ok' });

    expect((db.prepare('SELECT COUNT(*) AS n FROM delete_pending_audit').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM balance_contracts').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM balance_movements').get() as { n: number }).n).toBe(0);
  });

  // Same class of regression as delete_pending_audit above, found live 2026-08-29 (real dev DB, real
  // "Cleanup Database Tables" click, 500 FK constraint failure) — fix_pending_audit (added for the Fix
  // Pending §19 redesign) has the exact same FK shape and was missed when this route was first written,
  // since it postdates delete_pending_audit's own fix here.
  test('also wipes fix_pending_audit — a prior Fix Pending Save must not 500 this route (FK constraint regression)', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);

    const created = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'RESET-003' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '1000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);

    await request(app)
      .post(`/balance-movements/${created.body.movementId}/edit`)
      .send({ amount: '2000', editedBy: 'maker2' })
      .expect(200);

    expect((db.prepare('SELECT COUNT(*) AS n FROM fix_pending_audit').get() as { n: number }).n).toBe(1);

    const res = await request(app).post('/admin/reset-database').expect(200);
    expect(res.body).toEqual({ status: 'ok' });

    expect((db.prepare('SELECT COUNT(*) AS n FROM fix_pending_audit').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM balance_contracts').get() as { n: number }).n).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM balance_movements').get() as { n: number }).n).toBe(0);
  });
});

describe('HTTP integration — app.ts bootstrap: /healthz and request-layer amount validation', () => {
  const app = createApp(createDb(':memory:'));

  test('GET /healthz -> 200 {status: "ok"}', async () => {
    const res = await request(app).get('/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('a malformed (but non-empty) amount now -> 400 REQUEST_VALIDATION_FAILED at the route layer, not a 500 (Quality-report-balance.md BAL-115/BAL-117-adjacent gap, closed as part of the 2026-08-16 currency-decimal-place fix below: routes/balanceMovements.ts now pattern-checks `amount` before it ever reaches computeCeilingAmount()/parseMonetaryAmount() deep in the service layer, so an unparseable string can no longer fall through to the generic (non-ApiError) 500 handler)', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BAD-AMOUNT-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: 'not-a-number', // truthy, so passes the route's own !body.amount check, but now caught by the pattern check right after it
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/is not a valid MonetaryAmount/);
  });

  // Business requirement 2026-08-16 ("JPY 10000 without cents" -> "must be enforced server-side based
  // on the currency code and its configured currency decimal place"). See src/money.ts's
  // CURRENCY_MINOR_UNITS/describeAmountScaleViolation for the table and the pure-function unit tests
  // (test/unit/errorsAndMoney.test.ts) — these are the HTTP-layer wiring tests only.
  test('POST /balance-movements with a JPY amount carrying decimals -> 400 REQUEST_VALIDATION_FAILED (JPY allows 0 decimal places)', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'JPY-DP-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000.50',
        currency: 'JPY',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/has 2 decimal place\(s\) but currency JPY allows at most 0/);
  });

  test("POST /balance-movements with a whole-number JPY amount -> 201 (0 decimal places is exactly JPY's own configured scale)", async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'JPY-DP-002' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'JPY',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(res.body.amount).toBe('10000');
  });

  test('POST /balance-movements with a KWD amount carrying its allowed 3rd decimal place -> 201 (KWD is a configured 3dp currency)', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'KWD-DP-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000.125',
        currency: 'KWD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(res.body.amount).toBe('1000.125');
  });

  test("POST /balance-movements with an unrecognized currency defaults to 2 decimal places allowed, same as the Angular UI's own fallback", async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'XYZ-DP-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000.999',
        currency: 'XYZ',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.message).toMatch(/has 3 decimal place\(s\) but currency XYZ allows at most 2/);
  });
});

describe('HTTP integration — route-layer request validation gaps not otherwise exercised (routes/balanceContracts.ts, routes/balanceMovements.ts)', () => {
  const app = createApp(createDb(':memory:'));

  test('GET /balance-contracts without lcNumber -> 400', async () => {
    const res = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC' }).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/instrumentType and lcNumber are required/);
  });

  test('GET /balance-contracts without instrumentType -> 400', async () => {
    const res = await request(app).get('/balance-contracts').query({ lcNumber: 'LC0001' }).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  test('GET /balance-contracts/catalog with an invalid tenorFamily -> 400', async () => {
    const res = await request(app).get('/balance-contracts/catalog').query({ instrumentType: 'IPLC_LC', tenorFamily: 'BOGUS' }).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/tenorFamily must be SIGHT or USANCE/);
  });

  test('POST /balance-movements missing a required field (currency) -> 400', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'VALID-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        createdBy: 'maker1',
        // currency deliberately omitted
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });
});

describe('HTTP integration — REJECT flow (Checker 4-eyes decline), business.reject() previously had zero test coverage', () => {
  const app = createApp(createDb(':memory:'));
  let lcId: string;

  test('setup: Issue LC0006 for 100,000', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC0006' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    lcId = lc.body.balanceContractId;
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  });

  test('POST /balance-movements/:id/reject without releasedBy -> 400', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${amend.body.movementId}/reject`).send({ reasonCode: 'DOC_MISMATCH' }).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/releasedBy and reasonCode are required/);

    // Clean up so it doesn't linger PENDING and pollute later tests' balance assertions on this same LC.
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
  });

  test('POST /balance-movements/:id/reject without reasonCode -> 400', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 3,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-002',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${amend.body.movementId}/reject`).send({ releasedBy: 'checker1' }).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');

    // Clean up so it doesn't linger PENDING and pollute later tests' balance assertions on this same LC.
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
  });

  test('POST /balance-movements/:id/reject with releasedBy === the movement\'s own createdBy -> 409 MAKER_CHECKER_CONFLICT (business-confirmed 2026-08-24, genuine 4-eyes separation)', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 100,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-100',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${amend.body.movementId}/reject`).send({ releasedBy: 'maker1', reasonCode: 'DOC_MISMATCH' }).expect(409);
    expect(res.body.code).toBe('MAKER_CHECKER_CONFLICT');

    // Clean up so it doesn't linger PENDING and pollute later tests' balance assertions on this same LC.
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
  });

  test('POST /balance-movements/:id/release with releasedBy === the movement\'s own createdBy -> 409 MAKER_CHECKER_CONFLICT (business-confirmed 2026-08-24, genuine 4-eyes separation — CANCEL by the same Maker is unaffected, see the standalone cancel() describe block)', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 101,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-101',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${amend.body.movementId}/release`).send({ releasedBy: 'maker1' }).expect(409);
    expect(res.body.code).toBe('MAKER_CHECKER_CONFLICT');
    expect(res.body.message).toMatch(/Maker \(maker1\) and Checker cannot be the same user/);

    // Clean up so it doesn't linger PENDING and pollute later tests' balance assertions on this same LC.
    await request(app).post(`/balance-movements/${amend.body.movementId}/cancel`).send({ cancelledBy: 'maker1' }).expect(200);
  });

  test('POST /balance-movements/:id/reject with both fields -> 200, REJECTED, and the rejected movement never contributes to Confirmed/Available Balance', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 4,
        amount: '25000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-004',
        createdBy: 'maker1',
      })
      .expect(201);

    const res = await request(app)
      .post(`/balance-movements/${amend.body.movementId}/reject`)
      .send({ releasedBy: 'checker1', reasonCode: 'DOC_MISMATCH', remarks: 'Amount does not match the amendment advice' })
      .expect(200);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.releasedBy).toBe('checker1');
    expect(res.body.reasonCode).toBe('DOC_MISMATCH');
    expect(res.body.remarks).toBe('Amount does not match the amendment advice');

    const snapshot = await request(app).get(`/balance-contracts/${lcId}/balance`).expect(200);
    expect(snapshot.body.confirmedBalance).toBe('100000');
    expect(snapshot.body.availableBalance).toBe('100000');
  });

  test('rejecting an already-RELEASED movement -> 409, illegal transition', async () => {
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lcId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 5,
        amount: '1000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-005',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${amend.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app)
      .post(`/balance-movements/${amend.body.movementId}/reject`)
      .send({ releasedBy: 'checker1', reasonCode: 'TOO_LATE' })
      .expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
  });
});

describe('HTTP integration — balanceService.ts createMovement() error branches not otherwise exercised', () => {
  const app = createApp(createDb(':memory:'));

  test('a non-creating movementType (e.g. UTILIZE) against a naturalKey that resolves to NO contract yet -> 404, "only ISSUE/CREATE may implicitly create one"', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'NEVER-ISSUED-001' },
        movementType: 'UTILIZE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.message).toMatch(/only ISSUE\/CREATE may implicitly create one/);
  });

  test('SHGT ISSUE without parentLogicalContractId -> 400', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC-NOPARENT', sgNumber: 'SG-NOPARENT' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/parentLogicalContractId is required to check SG Issue/);
  });

  test('SHGT ISSUE with a parentLogicalContractId that does not resolve to any ACTIVE contract -> 400', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC-BADPARENT', sgNumber: 'SG-BADPARENT' },
        parentLogicalContractId: 'does-not-exist',
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/not found or not ACTIVE/);
  });

  test('EPLC_EXAMINATION CREATE without parentLogicalContractId -> 400', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'E-NOPARENT', ibNumber: 'EB-NOPARENT' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/parentLogicalContractId is required to check a Present Docs amount/);
  });

  test('EPLC_EXAMINATION CREATE with a parentLogicalContractId that does not resolve to any ACTIVE Confirmation -> 400', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_EXAMINATION',
        naturalKey: { lcNumber: 'E-BADPARENT', ibNumber: 'EB-BADPARENT' },
        parentLogicalContractId: 'does-not-exist',
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/not found or not ACTIVE/);
  });

  test('an unrecognized movementType against an EXISTING contract -> 400, "Unrecognized movementType" (falls through every NO_CHECK/AMEND_DECREASE/UTILIZE_SHAPED/OUTSTANDING_CAPPED bucket)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-BOGUSTYPE' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'BOGUS_TYPE',
        eventSeq: 2,
        amount: '1000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/Unrecognized movementType "BOGUS_TYPE"/);
  });
});

describe('HTTP integration — coverage-closing pass (raising the branch floor from 90% to 95%)', () => {
  const app = createApp(createDb(':memory:'));

  test("GET /balance-contracts/:balanceContractId/balance with an unknown id -> 404 (getBalanceSnapshot's own NotFoundError, not otherwise exercised — every other test in this suite always uses a real id)", async () => {
    const res = await request(app).get('/balance-contracts/does-not-exist/balance').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test("GET /balance-contracts/:balanceContractId/movements with an unknown id -> 404 (listMovements' own NotFoundError)", async () => {
    const res = await request(app).get('/balance-contracts/does-not-exist/movements').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test("GET /balance-movements/:movementId/balance-as-of with an unknown movementId -> 404 (getBalanceSnapshotAsOfMovement's own NotFoundError)", async () => {
    const res = await request(app).get('/balance-movements/does-not-exist/balance-as-of').expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('POST /balance-movements with neither naturalKey nor balanceContractId -> 400 ("naturalKey or balanceContractId is required")', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '1000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/naturalKey or balanceContractId is required/);
  });

  test('re-ISSUE guard on EPLC_CONFIRMATION mentions the AMEND alternative (the re-ISSUE describe block above only exercised IPLC_LC/IPLC_ACCEPTANCE, whose error message omits "/AMEND")', async () => {
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CNF-REISSUE' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CNF-REISSUE' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(409);
    expect(res.body.message).toMatch(/AMEND_INCREASE\/AMEND_DECREASE\/AMEND to change it instead/);
  });

  test('POST /balance-movements/:movementId/release with an unknown movementId -> 404', async () => {
    const res = await request(app).post('/balance-movements/does-not-exist/release').send({ releasedBy: 'checker1' }).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('POST /balance-movements/:movementId/reject with an unknown movementId -> 404', async () => {
    const res = await request(app).post('/balance-movements/does-not-exist/reject').send({ releasedBy: 'checker1', reasonCode: 'BAD' }).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('POST /balance-movements/:movementId/cancel with an unknown movementId -> 404', async () => {
    const res = await request(app).post('/balance-movements/does-not-exist/cancel').send({ cancelledBy: 'maker1' }).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('POST /balance-movements/:movementId/maker-submit with an unknown movementId -> 404', async () => {
    const res = await request(app).post('/balance-movements/does-not-exist/maker-submit').send({ makerSubmittedBy: 'maker1' }).expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  test('a movement created with an explicit accountEntries array round-trips through storage (JSON.stringify on insert, JSON.parse on read) — every other test in this suite omits accountEntries entirely', async () => {
    const createRes = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-ACCTENTRIES' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
        accountEntries: [{ accountRef: 'CUST-ACC', drCr: 'D', amount: '1000' }],
      })
      .expect(201);
    expect(createRes.body.accountEntries).toEqual([{ accountRef: 'CUST-ACC', drCr: 'D', amount: '1000' }]);

    const movements = await request(app).get(`/balance-contracts/${createRes.body.balanceContractId}/movements`).expect(200);
    expect(movements.body[0].accountEntries).toEqual([{ accountRef: 'CUST-ACC', drCr: 'D', amount: '1000' }]);
  });

  test("GET /balance-contracts/catalog without instrumentType -> 400 (the catalog route's own check, distinct from GET /balance-contracts' — that one is already covered above)", async () => {
    const res = await request(app).get('/balance-contracts/catalog').expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/instrumentType is required/);
  });

  test("GET /balance-contracts/catalog with explicit page and pageSize query params converts both to Number (every other catalog test in this suite omits them, relying on the service's own defaults)", async () => {
    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-PAGETEST' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).get('/balance-contracts/catalog').query({ instrumentType: 'IPLC_LC', page: '1', pageSize: '5' }).expect(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(5);
  });

  test('GET /balance-contracts/catalog?requireIssueReleased=true excludes a contract whose own ISSUE is still PENDING, but includes it once Released (business-reported gap 2026-08-18, "S10 still shown in A4 function which is wrong")', async () => {
    const pending = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-ISSUEPENDING' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);

    const beforeRelease = await request(app)
      .get('/balance-contracts/catalog')
      .query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-ISSUEPENDING', requireIssueReleased: 'true' })
      .expect(200);
    expect(beforeRelease.body.items).toHaveLength(0);
    expect(beforeRelease.body.total).toBe(0);

    // The SAME query without requireIssueReleased still finds it — confirms the exclusion is opt-in,
    // not a change to the default catalog behavior every other caller (and every existing picker not
    // yet updated) relies on.
    const withoutFlag = await request(app).get('/balance-contracts/catalog').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-ISSUEPENDING' }).expect(200);
    expect(withoutFlag.body.items).toHaveLength(1);

    await request(app).post(`/balance-movements/${pending.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const afterRelease = await request(app)
      .get('/balance-contracts/catalog')
      .query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-ISSUEPENDING', requireIssueReleased: 'true' })
      .expect(200);
    expect(afterRelease.body.items).toHaveLength(1);
    expect(afterRelease.body.items[0].naturalKey.lcNumber).toBe('LC-ISSUEPENDING');
  });

  test('GET /balance-contracts/close-eligible without instrumentType -> 400', async () => {
    const res = await request(app).get('/balance-contracts/close-eligible').expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/instrumentType is required/);
  });

  test('GET /balance-contracts/close-eligible (A10/B6 Step-1 picker hint) returns a Closeable LC and excludes one with a non-zero SG Balance', async () => {
    const eligible = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-CLOSEHINT-OK' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${eligible.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const ineligible = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-CLOSEHINT-SG' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${ineligible.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const ineligibleLc = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-CLOSEHINT-SG' }).expect(200);
    const sgIssue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'LC-CLOSEHINT-SG', sgNumber: 'SG01' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '2000',
        currency: 'USD',
        parentLogicalContractId: ineligibleLc.body.logicalContractId,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${sgIssue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app).get('/balance-contracts/close-eligible').query({ instrumentType: 'IPLC_LC' }).expect(200);
    const lcNumbers = (res.body.items as Array<{ naturalKey: { lcNumber: string } }>).map((c) => c.naturalKey.lcNumber);
    expect(lcNumbers).toContain('LC-CLOSEHINT-OK');
    expect(lcNumbers).not.toContain('LC-CLOSEHINT-SG');
  });

  test('GET /balance-contracts/reopen-eligible without instrumentType -> 400', async () => {
    const res = await request(app).get('/balance-contracts/reopen-eligible').expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/instrumentType is required/);
  });

  test('GET /balance-contracts/reopen-eligible (F1, A11/B7 Step-1 picker hint) returns a CLOSED LC with no open Events and excludes an ACTIVE one', async () => {
    const closedOk = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-REOPENHINT-OK' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '10000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${closedOk.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const close = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId: closedOk.body.balanceContractId, movementType: 'CLOSE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: 'maker1', reasonCode: 'TEST_CLOSE_REASON' })
      .expect(201);
    await request(app).post(`/balance-movements/${close.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const stillActive = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-REOPENHINT-ACTIVE' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '5000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${stillActive.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app).get('/balance-contracts/reopen-eligible').query({ instrumentType: 'IPLC_LC' }).expect(200);
    const lcNumbers = (res.body.items as Array<{ naturalKey: { lcNumber: string } }>).map((c) => c.naturalKey.lcNumber);
    expect(lcNumbers).toContain('LC-REOPENHINT-OK');
    expect(lcNumbers).not.toContain('LC-REOPENHINT-ACTIVE');
  });

  test('GET /balance-contracts?includeAnyStatus=true still resolves a CLOSED (A10) LC by natural key — user-reported gap 2026-08-21 ("LOOKUP也應該看到此LC 項下所有的交易包括CLOSE EVENT"); the default (no flag) stays 404, matching every existing ACTIVE-only caller', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-CLOSED-LOOKUP' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lc = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-CLOSED-LOOKUP' }).expect(200);

    const close = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_CLOSE_REASON',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${close.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-CLOSED-LOOKUP' }).expect(404);

    const anyStatus = await request(app)
      .get('/balance-contracts')
      .query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-CLOSED-LOOKUP', includeAnyStatus: 'true' })
      .expect(200);
    expect(anyStatus.body.status).toBe('CLOSED');
    expect(anyStatus.body.balanceContractId).toBe(lc.body.balanceContractId);

    // The Events Timeline (Inquire Events/Look Up) must still show the CLOSE event itself.
    const movements = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
    expect(movements.body.map((m: any) => m.movementType)).toEqual(['ISSUE', 'CLOSE']);
  });

  test('POST /balance-movements with movementType CLOSE and no reasonCode -> 400 (F1 proposal §13.1 item 4, BA-ratified 2026-08-25)', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-CLOSE-REASONCODE-HTTP-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.body.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
        // reasonCode deliberately omitted.
      })
      .expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/reasonCode is required for CLOSE/);
  });

  test('POST /balance-movements with amount "0" or a negative amount -> 400 (user-reported gap 2026-08-21, "SUBMIT & RELEASE API 也要有交易金額控制檢查" — live-reproduced before this fix: both were silently accepted)', async () => {
    const zero = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'AMT-HTTP-ZERO-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(zero.body.code).toBe('REQUEST_VALIDATION_FAILED');

    const negative = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'AMT-HTTP-NEG-001' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '-5000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);
    expect(negative.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  test('POST /balance-movements/:movementId/release without releasedBy -> 400', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-NORELEASEDBY' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({}).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/releasedBy is required/);
  });

  // Business instruction 2026-08-16 ("Add real Maker Submit, then have Checker to Release it.
  // Exactly the same as A1.") — A4's own real Maker action. See service.submitByMaker()'s own doc
  // comment for why this never touches status.
  test('POST /balance-movements/:id/maker-submit: sets makerSubmittedBy/makerSubmittedAt, status stays PENDING (A4 real Maker Submit)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-MAKERSUBMIT' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);

    const submitted = await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
    expect(submitted.body.status).toBe('PENDING');
    expect(submitted.body.makerSubmittedBy).toBe('maker1');
    expect(submitted.body.makerSubmittedAt).toBeTruthy();
  });

  test('POST /balance-movements/:id/maker-submit: submitting the same movement twice -> 409, rejected', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-MAKERSUBMIT2' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);

    const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    expect(res.body.message).toMatch(/already submitted by maker1/);
  });

  test('POST /balance-movements/:id/maker-submit: rejects a non-IPLC_LC/UTILIZE movement -> 400', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CNF-MAKERSUBMIT' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${cnf.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(400);
    expect(res.body.message).toMatch(/submitByMaker\(\) only applies to an IPLC_LC UTILIZE movement/);
  });

  test('POST /balance-movements/:id/maker-submit: rejects an already-RELEASED movement -> 409, ILLEGAL_STATE_TRANSITION', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-MAKERSUBMIT3' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    // Widened 2026-08-27 (business-confirmed, A6 finalizing a Usance UTILIZE) — a direct /release call on
    // an explicit-tenor IPLC_LC/UTILIZE now requires makerSubmittedAt first, same gate Sight/A4 already
    // had; this test only needs the movement genuinely RELEASED to exercise the actual assertion below.
    await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
    await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    expect(res.body.message).toMatch(/not PENDING/);
  });

  test('POST /balance-movements/:movementId/maker-submit without makerSubmittedBy -> 400', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-NOMAKERSUBMITBY' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '500',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({}).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/makerSubmittedBy is required/);
  });

  // Restored 2026-08-20 ("A3 A3S 交易 Approve 過後 不要再顯示") — A3/A3S's own Checker acknowledgment on
  // the LC's own UTILIZE, mirroring submitByMaker() above but on the Checker side. See
  // service.acknowledgeArrival()'s own doc comment.
  test('POST /balance-movements/:id/acknowledge: sets acknowledgedBy/acknowledgedAt, status stays PENDING (A3 Checker acknowledgment)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-ACK' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);

    const acknowledged = await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(200);
    expect(acknowledged.body.status).toBe('PENDING');
    expect(acknowledged.body.acknowledgedBy).toBe('checker1');
    expect(acknowledged.body.acknowledgedAt).toBeTruthy();
  });

  test('POST /balance-movements/:id/acknowledge: acknowledging the same movement twice -> 409, rejected', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-ACK2' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(200);

    const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(409);
    expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    expect(res.body.message).toMatch(/already acknowledged by checker1/);
  });

  test('POST /balance-movements/:id/acknowledge: rejects a non-IPLC_LC/UTILIZE movement -> 400', async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CNF-ACK' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${cnf.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(400);
    expect(res.body.message).toMatch(/acknowledgeArrival\(\) only applies to an IPLC_LC UTILIZE movement/);
  });

  test('POST /balance-movements/:id/acknowledge with acknowledgedBy === the movement\'s own createdBy -> 409 MAKER_CHECKER_CONFLICT (business-confirmed 2026-08-24)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-ACK-MC' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);

    const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'maker1' }).expect(409);
    expect(res.body.code).toBe('MAKER_CHECKER_CONFLICT');
    expect(res.body.message).toMatch(/Maker \(maker1\) and Checker cannot be the same user/);
  });

  test('POST /balance-movements/:movementId/acknowledge without acknowledgedBy -> 400', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-NOACKBY' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '500',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      })
      .expect(201);
    const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({}).expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
    expect(res.body.message).toMatch(/acknowledgedBy is required/);
  });

  // Business-confirmed 2026-08-27 ("做 A4 或 A6 DELETE PENDING 後 交易退回到 A4 或 A6 SUBMIT 前即可") — A4's
  // own Delete Pending: see service.withdrawMakerSubmit()'s own doc comment.
  describe('POST /balance-movements/:movementId/withdraw-maker-submit', () => {
    async function issueSightLcAcknowledgedAndSubmitted(lcNumber: string) {
      const lc = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(200);
      await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
      return { lc, utilize };
    }

    test('from still-PENDING (A4 awaiting Checker): clears makerSubmittedAt, keeps status PENDING and acknowledgedAt intact', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-1');
      const withdrawn = await request(app)
        .post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`)
        .send({ withdrawnBy: 'maker1' })
        .expect(200);
      expect(withdrawn.body.status).toBe('PENDING');
      expect(withdrawn.body.makerSubmittedAt).toBeNull();
      expect(withdrawn.body.makerSubmittedBy).toBeNull();
      expect(withdrawn.body.acknowledgedAt).toBeTruthy();
      expect(withdrawn.body.acknowledgedBy).toBe('checker1');
    });

    test('business-confirmed 2026-08-27 ("DELETE 後要記錄在 Inquire Delete Pending 內") — visible via GET /delete-pending-audit', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-AUDIT');
      await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(200);

      const audit = await request(app).get('/delete-pending-audit').query({ lcNumber: 'LC-WD-AUDIT' }).expect(200);
      const row = audit.body.items.find((r: { movementId: string }) => r.movementId === utilize.body.movementId);
      expect(row).toMatchObject({ statusBefore: 'PENDING', cancelledBy: 'maker1', reasonCode: 'MAKER_EC' });
    });

    test('the SAME record becomes eligible for A4 picking again — status PENDING + acknowledgedAt set + makerSubmittedAt null is exactly the client-side eligibility filter (document-arrival-hints.service.ts)', async () => {
      const { lc, utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-QP');
      await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(200);

      const movements = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
      const eligible = (movements.body as { movementId: string; status: string; movementType: string; acknowledgedAt: string | null; makerSubmittedAt: string | null }[]).filter(
        (m) => m.status === 'PENDING' && m.movementType === 'UTILIZE' && !!m.acknowledgedAt && !m.makerSubmittedAt,
      );
      expect(eligible.map((m) => m.movementId)).toContain(utilize.body.movementId);
    });

    test('"A4回A4" — after withdrawing from PENDING, the Maker can submitByMaker() (attempt A4) again', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-2');
      await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(200);
      const resubmitted = await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
      expect(resubmitted.body.makerSubmittedAt).toBeTruthy();
    });

    test('unified logic — from REJECTED (A4\'s own Checker already rejected it): clears makerSubmittedAt AND reverts status back to PENDING', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-3');
      const rejected = await request(app).post(`/balance-movements/${utilize.body.movementId}/reject`).send({ releasedBy: 'checker1', reasonCode: 'SETTLEMENT_DECLINED' }).expect(200);
      expect(rejected.body.status).toBe('REJECTED');

      const withdrawn = await request(app)
        .post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`)
        .send({ withdrawnBy: 'maker1' })
        .expect(200);
      expect(withdrawn.body.status).toBe('PENDING');
      expect(withdrawn.body.makerSubmittedAt).toBeNull();
      expect(withdrawn.body.acknowledgedAt).toBeTruthy();
    });

    test('"A4回A4" — after withdrawing from REJECTED, the Maker can submitByMaker() (attempt A4) again — was stuck forever before this ruling', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-4');
      await request(app).post(`/balance-movements/${utilize.body.movementId}/reject`).send({ releasedBy: 'checker1', reasonCode: 'SETTLEMENT_DECLINED' }).expect(200);
      await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(200);
      const resubmitted = await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
      expect(resubmitted.body.makerSubmittedAt).toBeTruthy();
      const released = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      expect(released.body.status).toBe('RELEASED');
    });

    test('rejects a movement that was never Maker-Submitted -> 409, nothing to withdraw', async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-WD-5' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(200);

      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(409);
      expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    });

    test('rejects a RELEASED movement -> 409', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-6');
      await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(409);
      expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    });

    test('rejects a non-IPLC_LC/UTILIZE movement -> 400', async () => {
      const cnf = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: 'LC-WD-7' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '50000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      const res = await request(app).post(`/balance-movements/${cnf.body.movementId}/withdraw-maker-submit`).send({ withdrawnBy: 'maker1' }).expect(400);
      expect(res.body.message).toMatch(/withdrawMakerSubmit\(\) only applies to an IPLC_LC UTILIZE movement/);
    });

    test('without withdrawnBy -> 400', async () => {
      const { utilize } = await issueSightLcAcknowledgedAndSubmitted('LC-WD-8');
      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/withdraw-maker-submit`).send({}).expect(400);
      expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
      expect(res.body.message).toMatch(/withdrawnBy is required/);
    });
  });

  // Quality-report-balance.md BAL-123 (2026-08-17, reviewer-found): A4's own Maker/Checker 4-eyes gate
  // used to be enforced ONLY by the reference Transaction Builder client, never here — any other caller
  // (curl, a future second UI) could release a Sight LC's own UTILIZE without ever calling
  // /maker-submit first, defeating the point of the gate. release() now requires makerSubmittedAt for
  // Sight-tenor IPLC_LC/UTILIZE specifically — scoped narrowly so it can never affect a Usance LC's own
  // UTILIZE (released via A6's compound flow, which never calls /maker-submit by design).
  describe('release(): A4 (Sight Settlement) 4-eyes gate — Sight-tenor IPLC_LC/UTILIZE only', () => {
    test('blocks release of a Sight LC UTILIZE that was never Maker-submitted -> 409, ILLEGAL_STATE_TRANSITION', async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-BAL123-SIGHT' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);

      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(409);
      expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
      expect(res.body.message).toMatch(/requires a Maker Submit/);

      const stillPending = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
      expect(stillPending.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId).status).toBe('PENDING');
    });

    test('allows release of a Sight LC UTILIZE once Maker-submitted', async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-BAL123-SIGHT-OK' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);

      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      expect(res.body.status).toBe('RELEASED');
    });

    // Widened 2026-08-27 (business-confirmed, "A6 必須... 承接並正式轉換 A3/A3S 的 EARMARKED exposure") —
    // the gate now covers any explicit tenorType, not just Sight; A6's own createMovement() sets
    // makerSubmittedAt on the referenced UTILIZE (applyCreateSideEffects()), so a Usance LC UTILIZE is
    // now ALSO blocked until that has happened, same as Sight/A4.
    test('DOES block a Usance LC UTILIZE that was never Maker-submitted -> 409, ILLEGAL_STATE_TRANSITION', async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: 'LC-BAL123-USANCE' },
          movementType: 'ISSUE', expiryDate: '2099-12-31',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          createdBy: 'maker1',
        })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);

      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(409);
      expect(res.body.code).toBe('ILLEGAL_STATE_TRANSITION');
    });

    test('allows release of a Usance LC UTILIZE once A6 has been created against it (referencedTransactionId sets makerSubmittedAt via applyCreateSideEffects)', async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: 'LC-BAL123-USANCE-OK' },
          movementType: 'ISSUE', expiryDate: '2099-12-31',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          createdBy: 'maker1',
        })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(200);
      await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'IPLC_ACCEPTANCE',
          naturalKey: { lcNumber: 'LC-BAL123-USANCE-OK', ibNumber: 'IB-001' },
          movementType: 'CREATE',
          eventSeq: 3,
          amount: '40000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          parentLogicalContractId: lc.body.logicalContractId,
          referencedTransactionId: utilize.body.movementId,
          createdBy: 'maker1',
        })
        .expect(201);

      const res = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      expect(res.body.status).toBe('RELEASED');
      expect(res.body.makerSubmittedAt).toBeTruthy();
    });

    test('does NOT block an IPLC_LC UTILIZE whose parent contract never declared an explicit tenorType (null) — backward compatible with the Business Case Runner\'s own older Import Case #1/#3/#4/#5', async () => {
      // tenorType is now mandatory at ISSUE (user-directed 2026-08-26) — a null-tenorType root contract
      // can no longer be constructed via a real ISSUE call, so this legacy state is simulated via a
      // direct DB write instead, same "bypass the Maker-side gate directly via the store" convention
      // already used elsewhere in this file for a now-unconstructible legacy state.
      const bypassDb = createDb(':memory:');
      const bypassService = new BalanceService(bypassDb);
      const lc = bypassService.createMovement({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LC-BAL123-NOTENOR' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      });
      if (!lc.created) throw new Error('expected a new movement');
      bypassService.release(lc.movement.movementId, 'checker1');
      bypassDb.exec(`UPDATE balance_contracts SET tenor_type = NULL WHERE balance_contract_id = '${lc.movement.balanceContractId}'`);

      const utilize = bypassService.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.movement.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '40000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        createdBy: 'maker1',
      });
      if (!utilize.created) throw new Error('expected a new movement');

      const released = bypassService.release(utilize.movement.movementId, 'checker1');
      expect(released.status).toBe('RELEASED');
    });

    // 2026-08-18, business instruction ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變" —
    // once A4 finalizes, A3's own Event Snapshot must stay exactly as it was at A3's own transaction
    // time, unchanged) — reproduces LC S01's own live scenario: A3's Document Arrival earmark
    // (eventSnapshot captured PENDING, Confirmed Balance still 0) later finalized by A4 (Maker-Submit +
    // Release). eventSnapshot must be byte-for-byte unchanged by the release; the release-time figures
    // land in the NEW finalizeEventSnapshot field instead.
    test("A4's own Release does NOT overwrite the UTILIZE's own eventSnapshot (A3's Create-time view) — the release-time figures go into finalizeEventSnapshot instead", async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-S01-SNAPSHOT' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'B01', createdBy: 'maker1' })
        .expect(201);

      // A3's own Create-time snapshot: still PENDING, Confirmed Balance hasn't moved yet.
      const createTimeSnapshot = utilize.body.eventSnapshot;
      expect(createTimeSnapshot).not.toBeNull();
      expect(createTimeSnapshot.confirmedBalance).toBe('100000');
      expect(utilize.body.finalizeEventSnapshot).toBeNull();

      await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
      const released = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

      // eventSnapshot is byte-for-byte unchanged from Create — release() did NOT overwrite it.
      expect(released.body.eventSnapshot).toEqual(createTimeSnapshot);
      // finalizeEventSnapshot instead holds the RELEASED-state figures (Confirmed Balance now moved).
      expect(released.body.finalizeEventSnapshot).not.toBeNull();
      expect(released.body.finalizeEventSnapshot.confirmedBalance).toBe('60000');

      // Re-fetched via the Event Timeline (not just the immediate response) — same guarantee holds.
      const movements = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
      const utilizeRow = movements.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId);
      expect(utilizeRow.eventSnapshot).toEqual(createTimeSnapshot);
      expect(utilizeRow.finalizeEventSnapshot.confirmedBalance).toBe('60000');
    });

    // Widened 2026-08-27 (business-confirmed) — A6 finalizing a Usance UTILIZE now gets the EXACT SAME
    // eventSnapshot-preservation treatment A4/Sight already had: A3's own Create-time view stays frozen,
    // the release-time figures land in finalizeEventSnapshot. No longer Sight-only.
    test('a Usance LC UTILIZE finalized via A6 (referencedTransactionId cascade) ALSO gets eventSnapshot preserved — finalizeEventSnapshot holds the release-time figures, same as Sight/A4', async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: 'LC-USANCE-SNAPSHOT' },
          movementType: 'ISSUE', expiryDate: '2099-12-31',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          createdBy: 'maker1',
        })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '40000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
        .expect(201);
      const createTimeSnapshot = utilize.body.eventSnapshot;
      expect(createTimeSnapshot.confirmedBalance).toBe('100000');
      await request(app).post(`/balance-movements/${utilize.body.movementId}/acknowledge`).send({ acknowledgedBy: 'checker1' }).expect(200);
      const acceptance = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'IPLC_ACCEPTANCE',
          naturalKey: { lcNumber: 'LC-USANCE-SNAPSHOT', ibNumber: 'IB-001' },
          movementType: 'CREATE',
          eventSeq: 3,
          amount: '40000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          parentLogicalContractId: lc.body.logicalContractId,
          referencedTransactionId: utilize.body.movementId,
          createdBy: 'maker1',
        })
        .expect(201);

      await request(app).post(`/balance-movements/${acceptance.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

      const movements = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
      const utilizeRow = movements.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId);
      expect(utilizeRow.status).toBe('RELEASED');
      expect(utilizeRow.eventSnapshot).toEqual(createTimeSnapshot);
      expect(utilizeRow.finalizeEventSnapshot).not.toBeNull();
      expect(utilizeRow.finalizeEventSnapshot.confirmedBalance).toBe('60000');
    });

    // 2026-08-18, business instruction ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易
    //改變" — a snapshot must preserve the LC/SG/Acceptance figures AS THEY WERE, never changed by a
    // later transaction), reproducing LC S01's own real sequence exactly: A1 Issue → A3 Document Arrival
    // (submitted BEFORE any Shipping Guarantee exists under this LC) → A8 Shipping Guarantee Issue → A4
    // Sight Payment. At A3's own transaction time there was genuinely NO Shipping Guarantee yet — its
    // own sgEventSnapshot must correctly show "none" then, and must STILL show "none" after A4 finalizes
    // hours later, even though a real SG exists by then.
    test("A4's own Release does NOT overwrite the UTILIZE's own acceptanceEventSnapshot/sgEventSnapshot either — reproduces LC S01: A3 submitted before SG G01 existed, so its own sgEventSnapshot must stay null even after A4 finalizes", async () => {
      const lc = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'LC-S01-SG-SNAPSHOT' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
        .expect(201);
      await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'LC-S01-SG-SNAPSHOT' }).expect(200);

      // A3: Document Arrival — submitted BEFORE any SG exists under this LC.
      const utilize = await request(app)
        .post('/balance-movements')
        .send({ instrumentType: 'IPLC_LC', balanceContractId: lc.body.balanceContractId, movementType: 'UTILIZE', eventSeq: 2, amount: '22345', currency: 'USD', sourceTransactionRef: 'B01', createdBy: 'maker1' })
        .expect(201);
      expect(utilize.body.sgEventSnapshot).toBeNull();
      expect(utilize.body.finalizeSgEventSnapshot).toBeNull();

      // A8: Shipping Guarantee Issue — now a real SG exists under this LC.
      const sgIssue = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: 'LC-S01-SG-SNAPSHOT', sgNumber: 'G01' },
          parentLogicalContractId: lcContract.body.logicalContractId,
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '12345',
          currency: 'USD',
          createdBy: 'maker1',
        })
        .expect(201);
      await request(app).post(`/balance-movements/${sgIssue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

      // A4: Sight Payment — finalizes A3's own UTILIZE, hours after SG G01 now exists.
      await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);
      const released = await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

      // A3's own sgEventSnapshot is STILL null — correctly reflecting "no SG existed" at A3's own
      // transaction time, unaffected by A8/A4 happening later.
      expect(released.body.sgEventSnapshot).toBeNull();
      // finalizeSgEventSnapshot instead captures the real, by-then-existing SG balance as of A4's own
      // Release — the two are genuinely different moments in time, now correctly kept separate.
      expect(released.body.finalizeSgEventSnapshot).not.toBeNull();
      expect(released.body.finalizeSgEventSnapshot.confirmedBalance).toBe('12345');

      // Re-fetched via the Event Timeline (not just the immediate response) — same guarantee holds.
      const movements = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
      const utilizeRow = movements.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId);
      expect(utilizeRow.sgEventSnapshot).toBeNull();
      expect(utilizeRow.finalizeSgEventSnapshot.confirmedBalance).toBe('12345');
    });
  });
});

describe('HTTP integration — contingent-liability account entries (analysis/contingent-liability-ledger.html, business-requested 2026-08-16)', () => {
  const app = createApp(createDb(':memory:'));

  test('IPLC_LC ISSUE (Sight) — create response carries the correct Dr/Cr pair', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'CAE-LC1' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(res.body.contingentAccountEntry).toEqual({
      drAccount: "Customers' Liability under DC — Sight",
      crAccount: 'Documentary Credits Outstanding — Sight',
      currency: 'USD',
      amount: '100000',
    });
  });

  test('IPLC_LC AMEND_DECREASE reverses the pair; UTILIZE (Honour) reverses it again — both persisted, both retrievable unmodified via the Event Timeline', async () => {
    const issueContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAE-LC1' }).expect(200);
    const balanceContractId = issueContract.body.balanceContractId;

    // Bug fixed 2026-08-18 (assertRootIssueReleased) — AMEND_DECREASE/UTILIZE below now require the
    // root LC's own ISSUE (from the previous test) to be Checker-Released first; the previous test
    // deliberately leaves it PENDING (its own scope is just the ISSUE response shape), so release it
    // here instead of there.
    const issueMovements = await request(app).get(`/balance-contracts/${balanceContractId}/movements`).expect(200);
    const issueMovementId = issueMovements.body.find((m: { movementType: string }) => m.movementType === 'ISSUE').movementId;
    await request(app).post(`/balance-movements/${issueMovementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const decrease = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(decrease.body.contingentAccountEntry).toEqual({
      drAccount: 'Documentary Credits Outstanding — Sight',
      crAccount: "Customers' Liability under DC — Sight",
      currency: 'USD',
      amount: '10000',
    });
    await request(app).post(`/balance-movements/${decrease.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const utilize = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', balanceContractId, movementType: 'UTILIZE', eventSeq: 3, amount: '30000', currency: 'USD', sourceTransactionRef: 'IB-001', createdBy: 'maker1' })
      .expect(201);
    expect(utilize.body.contingentAccountEntry).toEqual({
      drAccount: 'Documentary Credits Outstanding — Sight',
      crAccount: "Customers' Liability under DC — Sight",
      currency: 'USD',
      amount: '30000',
    });

    // Event-Level Relationship requirement: the Event Timeline's own copy of each movement carries the
    // exact same entry it was created with — not recalculated from the (by-now-different) live balance.
    const timeline = await request(app).get(`/balance-contracts/${balanceContractId}/movements`).expect(200);
    const decreaseInTimeline = timeline.body.find((m: { movementId: string }) => m.movementId === decrease.body.movementId);
    const utilizeInTimeline = timeline.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId);
    expect(decreaseInTimeline.contingentAccountEntry).toEqual(decrease.body.contingentAccountEntry);
    expect(utilizeInTimeline.contingentAccountEntry).toEqual(utilize.body.contingentAccountEntry);

    // BAL-123 fix (2026-08-17): CAE-LC1 is a genuine Sight-tenor IPLC_LC (declared `tenorType: 'SIGHT'`
    // at ISSUE, above) — release() now requires a real Maker Submit before releasing its own UTILIZE.
    await request(app).post(`/balance-movements/${utilize.body.movementId}/maker-submit`).send({ makerSubmittedBy: 'maker1' }).expect(200);

    // Releasing a movement does not regenerate or touch its stored entry.
    await request(app).post(`/balance-movements/${utilize.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const afterRelease = await request(app).get(`/balance-contracts/${balanceContractId}/movements`).expect(200);
    const utilizeAfterRelease = afterRelease.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId);
    expect(utilizeAfterRelease.contingentAccountEntry).toEqual(utilize.body.contingentAccountEntry);
  });

  test('EPLC_CONFIRMATION ISSUE (Usance) then AMEND with a negative amount — Sight/Usance label and Increase/Decrease direction both correct', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CAE-CNF1' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '80000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(issue.body.contingentAccountEntry).toEqual({
      drAccount: 'Issuing Bank Confirmation Exposure — Usance',
      crAccount: 'Confirmation Undertakings Outstanding — Usance',
      currency: 'USD',
      amount: '80000',
    });
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const decrease = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: issue.body.balanceContractId,
        movementType: 'AMEND',
        eventSeq: 2,
        amount: '-5000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(decrease.body.contingentAccountEntry).toEqual({
      drAccount: 'Confirmation Undertakings Outstanding — Usance',
      crAccount: 'Issuing Bank Confirmation Exposure — Usance',
      currency: 'USD',
      amount: '5000',
    });
  });

  test('SHGT ISSUE then FULL_REDEEM — no tenor suffix on either leg', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'CAE-LC1', sgNumber: 'CAE-SG1' },
        parentLogicalContractId: (await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAE-LC1' })).body
          .logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(issue.body.contingentAccountEntry).toEqual({
      drAccount: "Customers' Liability under Shipping Guarantees",
      crAccount: 'Shipping Guarantees Outstanding',
      currency: 'USD',
      amount: '20000',
    });
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const redeem = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: issue.body.balanceContractId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '20000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(redeem.body.contingentAccountEntry).toEqual({
      drAccount: 'Shipping Guarantees Outstanding',
      crAccount: "Customers' Liability under Shipping Guarantees",
      currency: 'USD',
      amount: '20000',
    });
  });

  // User-directed 2026-08-28 ("A1 B1 A2 B2, LC Balance = Amount * (1 + Tolerance%) 帳務是用LC Balance
  // 出帳") — the booked Dr/Cr voucher amount must be the Ceiling-level figure (movement.ceilingAmount),
  // not the face-level amount a Maker typed. Every test above this point used no tolerancePct, so
  // ceilingAmount === amount there and those assertions are unaffected by this rule; these tests are the
  // ones that actually exercise a non-trivial conversion.
  test('A1 (ISSUE) with tolerancePct — contingentAccountEntry books the Ceiling amount (LC Balance), not the face amount', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'CAE-LC2' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tolerancePct: '10',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(issue.body.ceilingAmount).toBe('110000');
    expect(issue.body.contingentAccountEntry).toEqual({
      drAccount: "Customers' Liability under DC — Sight",
      crAccount: 'Documentary Credits Outstanding — Sight',
      currency: 'USD',
      amount: '110000', // LC Balance = 100000 × 1.10, not the face amount 100000
    });
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const increase = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.body.balanceContractId,
        movementType: 'AMEND_INCREASE',
        eventSeq: 2,
        amount: '5000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(increase.body.ceilingAmount).toBe('5500');
    expect(increase.body.contingentAccountEntry).toEqual({
      drAccount: "Customers' Liability under DC — Sight",
      crAccount: 'Documentary Credits Outstanding — Sight',
      currency: 'USD',
      amount: '5500', // A2 (AMEND_INCREASE) — LC Balance = 5000 × 1.10
    });

    // SHGT never applies Tolerance (domain/tolerance.ts's own TOLERANCE_APPLICABLE_INSTRUMENT_TYPES) even
    // against a parent LC that itself carries one — locks in that this fix is a genuine no-op outside
    // A1/B1/A2/B2, not an accidental blanket switch to ceilingAmount everywhere.
    const parentLc = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAE-LC2' }).expect(200);
    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'CAE-LC2', sgNumber: 'CAE-SG2' },
        parentLogicalContractId: parentLc.body.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '15000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(sg.body.ceilingAmount).toBe('15000');
    expect(sg.body.contingentAccountEntry.amount).toBe('15000'); // unconverted — SG's own face amount, not the parent LC's own Tolerance
  });

  test('B2 (EPLC_CONFIRMATION AMEND, negative amount = Decrease) with tolerancePct — contingentAccountEntry books the Ceiling-converted magnitude, direction still correct', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CAE-CNF3' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '80000',
        currency: 'USD',
        tolerancePct: '10',
        tenorType: 'SELLERS_USANCE',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(issue.body.ceilingAmount).toBe('88000');
    expect(issue.body.contingentAccountEntry.amount).toBe('88000'); // B1 (ISSUE)
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const decrease = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        balanceContractId: issue.body.balanceContractId,
        movementType: 'AMEND',
        eventSeq: 2,
        amount: '-5000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(decrease.body.ceilingAmount).toBe('-5500'); // sign preserved through computeCeilingAmount()
    expect(decrease.body.contingentAccountEntry).toEqual({
      drAccount: 'Confirmation Undertakings Outstanding — Usance', // Decrease direction — same as the no-tolerance B2 test above, unaffected by this fix
      crAccount: 'Issuing Bank Confirmation Exposure — Usance',
      currency: 'USD',
      amount: '5500', // magnitude only — B2 (AMEND, Decrease) — LC Balance = 5000 × 1.10, not the face amount 5000
    });
  });

  test("EPLC_DUE_FROM_ISSUING_BANK (on-balance-sheet asset) — contingentAccountEntry is null, both at creation and via the Event Timeline, per the ledger's own Scope boundary", async () => {
    const cnf = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'CAE-CNF2' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${cnf.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const cnfContract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'CAE-CNF2' }).expect(200);

    const dfib = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
        naturalKey: { lcNumber: 'CAE-CNF2', ibNumber: 'EB01' },
        parentLogicalContractId: cnfContract.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '30000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(dfib.body.contingentAccountEntry).toBeNull();

    const timeline = await request(app).get(`/balance-contracts/${dfib.body.balanceContractId}/movements`).expect(200);
    expect(timeline.body[0].contingentAccountEntry).toBeNull();
  });
});

describe('HTTP integration — GET /balance-movements?businessEventId= (bug fixed 2026-08-16, reviewer-reported — "A1 -> A8 -> A3S -> A4, the related SG entries was not shown")', () => {
  const app = createApp(createDb(':memory:'));

  test('400 REQUEST_VALIDATION_FAILED when businessEventId is missing', async () => {
    const res = await request(app).get('/balance-movements').expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  test('returns every movement sharing a businessEventId, across different contracts (LC + SHGT), oldest first', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BEID-LC1' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'BEID-LC1' }).expect(200);
    const sgIssue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'BEID-LC1', sgNumber: 'BEID-SG1' },
        parentLogicalContractId: lcContract.body.logicalContractId,
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '20000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${sgIssue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const businessEventId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const redeem = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        balanceContractId: sgIssue.body.balanceContractId,
        movementType: 'FULL_REDEEM',
        eventSeq: 2,
        amount: '20000',
        currency: 'USD',
        businessEventId,
        createdBy: 'maker1',
      })
      .expect(201);
    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '20000',
        currency: 'USD',
        sourceTransactionRef: 'IB-001',
        businessEventId,
        createdBy: 'maker1',
      })
      .expect(201);

    const linked = await request(app).get('/balance-movements').query({ businessEventId }).expect(200);
    expect(linked.body.map((m: { movementId: string }) => m.movementId)).toEqual([redeem.body.movementId, utilize.body.movementId]);
    expect(linked.body.map((m: { movementType: string }) => m.movementType)).toEqual(['FULL_REDEEM', 'UTILIZE']);
  });

  test('returns an empty array for a businessEventId no movement carries', async () => {
    const res = await request(app).get('/balance-movements').query({ businessEventId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }).expect(200);
    expect(res.body).toEqual([]);
  });
});

describe('HTTP integration — GET /balance-movements?createdBy= (Fix Pending/Delete Pending Phase 2 — Maker Queue worklist)', () => {
  const app = createApp(createDb(':memory:'));

  test('400 REQUEST_VALIDATION_FAILED when neither businessEventId nor createdBy is supplied', async () => {
    const res = await request(app).get('/balance-movements').expect(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  test('defaults to PENDING+REJECTED, paired with each movement\'s own contract, scoped to the given createdBy', async () => {
    const pending = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'MYMV-HTTP-001' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    const rejectedSource = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'MYMV-HTTP-002' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${rejectedSource.body.movementId}/reject`).send({ releasedBy: 'checker1', reasonCode: 'MANUAL_TEST_REJECT' }).expect(200);

    const res = await request(app).get('/balance-movements').query({ createdBy: 'maker1' }).expect(200);

    expect(res.body.items).toHaveLength(2);
    const movementIds = res.body.items.map((r: { movement: { movementId: string } }) => r.movement.movementId);
    expect(movementIds).toContain(pending.body.movementId);
    expect(movementIds).toContain(rejectedSource.body.movementId);
    const rejectedRow = res.body.items.find((r: { movement: { movementId: string } }) => r.movement.movementId === rejectedSource.body.movementId);
    expect(rejectedRow.movement.status).toBe('REJECTED');
    expect(rejectedRow.contract.naturalKey.lcNumber).toBe('MYMV-HTTP-002');
  });

  // User-directed 2026-08-28 ("page"/"pageSize" removed from this query shape — see
  // BalanceMovementStore.listByCreatedByAndStatus()'s own doc comment for why pagination moved
  // client-side; this now only covers status= and q=.
  test('status= filters to a single status; q= narrows by a substring LIKE match on LC Number', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: `MYMV-HTTP-PAGE-${i}` },
          movementType: 'ISSUE',
          expiryDate: '2099-12-31',
          eventSeq: 1,
          amount: '1000',
          currency: 'USD',
          tenorType: 'SIGHT',
          createdBy: 'maker-http-paging',
        })
        .expect(201);
    }

    const filtered = await request(app).get('/balance-movements').query({ createdBy: 'maker-http-paging', status: 'REJECTED' }).expect(200);
    expect(filtered.body.items).toEqual([]);

    const all = await request(app).get('/balance-movements').query({ createdBy: 'maker-http-paging', status: 'PENDING' }).expect(200);
    expect(all.body.items).toHaveLength(3);

    const narrowed = await request(app).get('/balance-movements').query({ createdBy: 'maker-http-paging', status: 'PENDING', q: 'PAGE-1' }).expect(200);
    expect(narrowed.body.items).toHaveLength(1);
    expect(narrowed.body.items[0].contract.naturalKey.lcNumber).toBe('MYMV-HTTP-PAGE-1');
  });
});

describe('HTTP integration — GET /delete-pending-audit (Inquire Delete Pending, analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11)', () => {
  const app = createApp(createDb(':memory:'));

  async function issueAndCancel(lcNumber: string, createdBy: string, cancelledBy: string) {
    const created = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy,
      })
      .expect(201);
    await request(app).post(`/balance-movements/${created.body.movementId}/cancel`).send({ cancelledBy, reasonCode: 'MAKER_EC' }).expect(200);
    return created.body.movementId as string;
  }

  test('with no filters, returns every Delete Pending audit row paired with its own contract natural key', async () => {
    const movementId = await issueAndCancel('DPA-HTTP-001', 'maker1', 'maker1');

    const res = await request(app).get('/delete-pending-audit').expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const row = res.body.items.find((r: { movementId: string }) => r.movementId === movementId);
    expect(row).toMatchObject({
      movementId,
      instrumentType: 'IPLC_LC',
      lcNumber: 'DPA-HTTP-001',
      ibNumber: null,
      sgNumber: null,
      deleteSeq: 1,
      statusBefore: 'PENDING',
      cancelledBy: 'maker1',
      reasonCode: 'MAKER_EC',
    });
    expect(row.auditId).toEqual(expect.any(String));
  });

  test('lcNumber= narrows to exactly that LC Number', async () => {
    await issueAndCancel('DPA-HTTP-LCA', 'maker1', 'maker1');
    await issueAndCancel('DPA-HTTP-LCB', 'maker1', 'maker1');

    const res = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-LCA' }).expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].lcNumber).toBe('DPA-HTTP-LCA');
  });

  test('deletedBy= narrows to that Maker only', async () => {
    await issueAndCancel('DPA-HTTP-BY-001', 'maker-alpha', 'maker-alpha');
    await issueAndCancel('DPA-HTTP-BY-002', 'maker-beta', 'maker-beta');

    const res = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-BY-001', deletedBy: 'maker-alpha' }).expect(200);
    expect(res.body.total).toBe(1);

    const none = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-BY-001', deletedBy: 'maker-beta' }).expect(200);
    expect(none.body.total).toBe(0);
    expect(none.body.items).toEqual([]);
  });

  test('from=/to= filters by cancelled_at range', async () => {
    await issueAndCancel('DPA-HTTP-RANGE-001', 'maker1', 'maker1');
    const farFuture = '2099-01-01T00:00:00.000Z';

    const tooLate = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-RANGE-001', from: farFuture }).expect(200);
    expect(tooLate.body.total).toBe(0);

    const includesIt = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-RANGE-001', to: farFuture }).expect(200);
    expect(includesIt.body.total).toBe(1);
  });

  test('page=/pageSize= paginate, and delete_seq increments across repeated Delete Pending cycles on the same LC Number', async () => {
    const first = await issueAndCancel('DPA-HTTP-PAGE-001', 'maker1', 'maker1');
    const resubmitted = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'DPA-HTTP-PAGE-001' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 2,
        amount: '20000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${resubmitted.body.movementId}/cancel`).send({ cancelledBy: 'maker1', reasonCode: 'MAKER_EC' }).expect(200);

    const page1 = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-PAGE-001', page: 1, pageSize: 1 }).expect(200);
    expect(page1.body.total).toBe(2);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0].movementId).toBe(first);
    expect(page1.body.items[0].deleteSeq).toBe(1);

    const page2 = await request(app).get('/delete-pending-audit').query({ lcNumber: 'DPA-HTTP-PAGE-001', page: 2, pageSize: 1 }).expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].movementId).toBe(resubmitted.body.movementId);
    expect(page2.body.items[0].deleteSeq).toBe(2);
  });
});

describe('HTTP integration — GET /delete-pending-audit/lc-catalog (Inquire Delete Pending LC Catalog, §11, "只有被 DELETE PENDING 過的才顯示")', () => {
  const app = createApp(createDb(':memory:'));

  async function issueAndCancel(lcNumber: string, instrumentType: string = 'IPLC_LC') {
    const created = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType,
        naturalKey: { lcNumber },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${created.body.movementId}/cancel`).send({ cancelledBy: 'maker1', reasonCode: 'MAKER_EC' }).expect(200);
    return created.body;
  }

  test('400 when instrumentType is missing', async () => {
    const res = await request(app).get('/delete-pending-audit/lc-catalog').expect(400);
    expect(res.body.code).toBeDefined();
  });

  test('an LC that was Issued and RELEASED (never Delete Pending) does NOT appear', async () => {
    const created = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'LCCAT-NEVER-DELETED' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${created.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC' }).expect(200);
    expect(res.body.items.some((row: { naturalKey: { lcNumber: string } }) => row.naturalKey.lcNumber === 'LCCAT-NEVER-DELETED')).toBe(false);
  });

  test('an LC Delete-Pending\'d exactly once appears exactly once', async () => {
    await issueAndCancel('LCCAT-ONE-001');

    const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-ONE-001' }).expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].naturalKey.lcNumber).toBe('LCCAT-ONE-001');
  });

  test('an LC Delete-Pending\'d multiple times (each cycle its own balanceContractId, §9.3 LC-reuse) appears exactly ONCE — DISTINCT by LC Number', async () => {
    const first = await issueAndCancel('LCCAT-MULTI-001');
    const second = await issueAndCancel('LCCAT-MULTI-001');
    expect(second.balanceContractId).not.toBe(first.balanceContractId);

    const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-MULTI-001' }).expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    // Representative row is the LATEST Delete Pending cycle's own contract.
    expect(res.body.items[0].balanceContractId).toBe(second.balanceContractId);
  });

  test('instrumentType filters correctly — an EPLC_CONFIRMATION Delete Pending never appears under IPLC_LC', async () => {
    await issueAndCancel('LCCAT-EXPORT-001', 'EPLC_CONFIRMATION');

    const importRes = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-EXPORT-001' }).expect(200);
    expect(importRes.body.total).toBe(0);

    const exportRes = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'EPLC_CONFIRMATION', q: 'LCCAT-EXPORT-001' }).expect(200);
    expect(exportRes.body.total).toBe(1);
  });

  test('page/pageSize paginate, ordered by LC Number ascending', async () => {
    await issueAndCancel('LCCAT-PAGE-A');
    await issueAndCancel('LCCAT-PAGE-B');
    await issueAndCancel('LCCAT-PAGE-C');

    const page1 = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-PAGE-', page: 1, pageSize: 2 }).expect(200);
    expect(page1.body.total).toBe(3);
    expect(page1.body.items.map((r: { naturalKey: { lcNumber: string } }) => r.naturalKey.lcNumber)).toEqual(['LCCAT-PAGE-A', 'LCCAT-PAGE-B']);

    const page2 = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-PAGE-', page: 2, pageSize: 2 }).expect(200);
    expect(page2.body.items.map((r: { naturalKey: { lcNumber: string } }) => r.naturalKey.lcNumber)).toEqual(['LCCAT-PAGE-C']);
  });

  /**
   * Bug fixed 2026-08-28, business-reported live ("A8 SG Issue Submit 後 Delete Pending =>
   * Inquire Delete Pending沒顯示"): a Delete Pending on a CHILD contract (SHGT/IPLC_ACCEPTANCE for
   * Import, EPLC_EXAMINATION/EPLC_ACCEPTANCE for Export) was invisible from its own ROOT LC's catalog
   * row, since the original query only matched a delete_pending_audit record whose OWN contract's
   * instrumentType equalled the root being Browse-d. See listWithDeletePendingHistory()'s own doc
   * comment for the fix.
   */
  describe('child-contract Delete Pending (A6/A8/A9/A3S-SG-leg for Import; B3/B4-own-Acceptance-leg/B5 for Export) surfaces under the ROOT LC', () => {
    async function issueRootAndCancelChild(lcNumber: string, rootInstrumentType: 'IPLC_LC' | 'EPLC_CONFIRMATION', childInstrumentType: string, naturalKey: Record<string, unknown>, childMovementType: string = 'ISSUE', extraChildFields: Record<string, unknown> = {}, rootTenorType: string = 'SIGHT') {
      const root = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: rootInstrumentType,
          naturalKey: { lcNumber },
          movementType: 'ISSUE',
          expiryDate: '2099-12-31',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          tenorType: rootTenorType,
          ...(rootTenorType !== 'SIGHT' ? { tenorDays: 90 } : {}),
          createdBy: 'maker1',
        })
        .expect(201);
      await request(app).post(`/balance-movements/${root.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
      const child = await request(app)
        .post('/balance-movements')
        .send({
          instrumentType: childInstrumentType,
          naturalKey: { lcNumber, ...naturalKey },
          parentLogicalContractId: root.body.eventSnapshot.logicalContractId,
          movementType: childMovementType,
          eventSeq: 1,
          amount: '1000',
          currency: 'USD',
          createdBy: 'maker1',
          ...extraChildFields,
        })
        .expect(201);
      await request(app).post(`/balance-movements/${child.body.movementId}/cancel`).send({ cancelledBy: 'maker1', reasonCode: 'MAKER_EC' }).expect(200);
      return { root: root.body, child: child.body };
    }

    test('A8 (SHGT) Delete Pending surfaces under the IPLC_LC catalog — the exact reported repro', async () => {
      await issueRootAndCancelChild('LCCAT-CHILD-SHGT', 'IPLC_LC', 'SHGT', { sgNumber: 'G01' });

      const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-CHILD-SHGT' }).expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].naturalKey.lcNumber).toBe('LCCAT-CHILD-SHGT');
      expect(res.body.items[0].instrumentType).toBe('IPLC_LC'); // representative row is the ROOT contract, not the child.
    });

    test('B3 (EPLC_EXAMINATION) Delete Pending surfaces under the EPLC_CONFIRMATION catalog', async () => {
      await issueRootAndCancelChild('LCCAT-CHILD-EXAM', 'EPLC_CONFIRMATION', 'EPLC_EXAMINATION', { ibNumber: 'E01' }, 'CREATE');

      const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'EPLC_CONFIRMATION', q: 'LCCAT-CHILD-EXAM' }).expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].naturalKey.lcNumber).toBe('LCCAT-CHILD-EXAM');
    });

    test('A6 (IPLC_ACCEPTANCE) Delete Pending surfaces under the IPLC_LC catalog', async () => {
      await issueRootAndCancelChild('LCCAT-CHILD-ACC', 'IPLC_LC', 'IPLC_ACCEPTANCE', { ibNumber: 'B01' }, 'CREATE', { tenorType: 'SELLERS_USANCE', tenorDays: 90 }, 'SELLERS_USANCE');

      const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-CHILD-ACC' }).expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].naturalKey.lcNumber).toBe('LCCAT-CHILD-ACC');
    });

    test('B4/B5 (EPLC_ACCEPTANCE) Delete Pending surfaces under the EPLC_CONFIRMATION catalog', async () => {
      await issueRootAndCancelChild('LCCAT-CHILD-EACC', 'EPLC_CONFIRMATION', 'EPLC_ACCEPTANCE', { ibNumber: 'B01' }, 'CREATE', { tenorType: 'SELLERS_USANCE' }, 'SELLERS_USANCE');

      const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'EPLC_CONFIRMATION', q: 'LCCAT-CHILD-EACC' }).expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.items[0].naturalKey.lcNumber).toBe('LCCAT-CHILD-EACC');
    });

    test('a child Delete Pending under one root incarnation does NOT leak into an UNRELATED contract that merely shares the same LC Number on a different root instrumentType', async () => {
      // Same LC Number string, deliberately reused across Import and Export — the fix must scope by the
      // real parent_logical_contract_id relationship, not a bare lc_number string match.
      await issueRootAndCancelChild('LCCAT-CHILD-CROSS', 'IPLC_LC', 'SHGT', { sgNumber: 'G01' });

      const exportRes = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'EPLC_CONFIRMATION', q: 'LCCAT-CHILD-CROSS' }).expect(200);

      expect(exportRes.body.total).toBe(0);
    });

    test('the representative row is the MOST RECENT root incarnation even when only a CHILD contract was ever Delete-Pending\'d (never the root itself)', async () => {
      const { root } = await issueRootAndCancelChild('LCCAT-CHILD-RECENT', 'IPLC_LC', 'SHGT', { sgNumber: 'G01' });

      const res = await request(app).get('/delete-pending-audit/lc-catalog').query({ instrumentType: 'IPLC_LC', q: 'LCCAT-CHILD-RECENT' }).expect(200);

      expect(res.body.items[0].balanceContractId).toBe(root.balanceContractId);
    });
  });
});

describe('HTTP integration — GET /balance-contracts/:balanceContractId (Inquire Delete Pending View action, §11)', () => {
  const app = createApp(createDb(':memory:'));

  test('resolves a contract directly by ID, no natural key needed', async () => {
    const created = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'BCID-001' },
        movementType: 'ISSUE',
        expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '1000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);

    const res = await request(app).get(`/balance-contracts/${created.body.balanceContractId}`).expect(200);
    expect(res.body).toMatchObject({ balanceContractId: created.body.balanceContractId, naturalKey: { lcNumber: 'BCID-001' } });
  });

  test('404 for an unknown balanceContractId', async () => {
    const res = await request(app).get('/balance-contracts/no-such-contract').expect(404);
    expect(res.body.code).toBeDefined();
  });

  // Regression: this catch-all single-segment route is registered AFTER /catalog, /close-eligible,
  // /reopen-eligible specifically so it can never shadow them (Express matches route registration order).
  test('does not shadow the more specific /balance-contracts/catalog|close-eligible|reopen-eligible routes', async () => {
    await request(app).get('/balance-contracts/catalog').query({ instrumentType: 'IPLC_LC' }).expect(200);
    await request(app).get('/balance-contracts/close-eligible').query({ instrumentType: 'IPLC_LC' }).expect(200);
    await request(app).get('/balance-contracts/reopen-eligible').query({ instrumentType: 'IPLC_LC' }).expect(200);
  });
});

describe('HTTP integration — referencedTransactionId passthrough (bug fixed 2026-08-16, "A6/B4 也修一下" — extending the businessEventId fix to A6/B4)', () => {
  const app = createApp(createDb(':memory:'));

  test('accepted on create, persisted, and still present when the movement is later re-fetched via the Event Timeline', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'RTID-LC1' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        tenorDays: 120,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const arrival = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '30000',
        currency: 'USD',
        sourceTransactionRef: 'IB-RTID-1',
        createdBy: 'maker1',
      })
      .expect(201);

    const acceptance = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'RTID-LC1', ibNumber: 'IB-RTID-1' },
        parentLogicalContractId: lc.body.balanceContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '30000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        referencedTransactionId: arrival.body.movementId,
        createdBy: 'maker1',
      })
      .expect(201);
    expect(acceptance.body.referencedTransactionId).toBe(arrival.body.movementId);

    const timeline = await request(app).get(`/balance-contracts/${acceptance.body.balanceContractId}/movements`).expect(200);
    expect(timeline.body[0].referencedTransactionId).toBe(arrival.body.movementId);
  });

  test('null (not required) when omitted', async () => {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'RTID-LC2' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '50000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(res.body.referencedTransactionId).toBeNull();
  });
});

describe('HTTP integration — persisted Event Snapshot (business instruction 2026-08-17, "PENDING XOR APPROVED... 只存PENDING 或 APPROVED 其中一個")', () => {
  const app = createApp(createDb(':memory:'));

  test('POST create response carries a non-null eventSnapshot reflecting PENDING state; POST release response overwrites it with RELEASED figures', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'EVSNAP-HTTP-1' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(issue.body.status).toBe('PENDING');
    expect(issue.body.eventSnapshot).not.toBeNull();
    expect(issue.body.eventSnapshot.confirmedBalance).toBe('0');
    expect(issue.body.eventSnapshot.availableBalance).toBe('100000');

    const released = await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    expect(released.body.status).toBe('RELEASED');
    expect(released.body.eventSnapshot.confirmedBalance).toBe('100000');
    expect(released.body.eventSnapshot.availableBalance).toBe('100000');

    // The Event Timeline's own copy carries the same RELEASED snapshot — this is exactly the field
    // Inquire Events reads directly, with no separate /balance-as-of call.
    const timeline = await request(app).get(`/balance-contracts/${issue.body.balanceContractId}/movements`).expect(200);
    expect(timeline.body[0].eventSnapshot).toEqual(released.body.eventSnapshot);
  });

  test('a later PENDING movement\'s eventSnapshot includes its own earmark contribution, and matches GET .../balance-as-of computed independently for the same movement', async () => {
    const issue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'EVSNAP-HTTP-2' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${issue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const decrease = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: issue.body.balanceContractId,
        movementType: 'AMEND_DECREASE',
        eventSeq: 2,
        amount: '15000',
        currency: 'USD',
        sourceTransactionRef: 'AMD-001',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(decrease.body.status).toBe('PENDING');
    expect(decrease.body.eventSnapshot.availableBalance).toBe('85000');

    const asOf = await request(app).get(`/balance-movements/${decrease.body.movementId}/balance-as-of`).expect(200);
    expect(decrease.body.eventSnapshot).toEqual(asOf.body);
  });
});

describe('HTTP integration — rootEventSnapshot, Inquire Events Balance Tabs (2026-08-17, "REFER TO DB S01" then "不複雜 就是...SAVED TO DB == EVENT BALANCE SNAPSHOT")', () => {
  const app = createApp(createDb(':memory:'));

  test('an SHGT ISSUE carries BOTH its own eventSnapshot (own ledger) AND a rootEventSnapshot (parent LC, plain, no decoration)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'ROOTSNAP-1' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'ROOTSNAP-1' }).expect(200);

    const sgIssue = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'ROOTSNAP-1', sgNumber: 'G01' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '32000',
        currency: 'USD',
        parentLogicalContractId: lcContract.body.logicalContractId,
        createdBy: 'maker1',
      })
      .expect(201);
    expect(sgIssue.body.eventSnapshot.confirmedBalance).toBe('0');
    expect(sgIssue.body.eventSnapshot.availableBalance).toBe('32000');
    expect(sgIssue.body.rootEventSnapshot.balanceContractId).toBe(lc.body.balanceContractId);
    expect(sgIssue.body.rootEventSnapshot.confirmedBalance).toBe('100000');
    expect(sgIssue.body.rootEventSnapshot.offBalanceExposure).toBe('32000');
    expect(sgIssue.body.rootEventSnapshot.tightAvailableBalance).toBe('68000');

    const sgReleased = await request(app).post(`/balance-movements/${sgIssue.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    expect(sgReleased.body.eventSnapshot.confirmedBalance).toBe('32000');
    expect(sgReleased.body.rootEventSnapshot.confirmedBalance).toBe('100000');
    expect(sgReleased.body.rootEventSnapshot.offBalanceExposure).toBe('32000');

    // The Event Timeline's own copy carries the same rootEventSnapshot — Inquire Events' Balance Tabs
    // read it directly with no separate cross-contract query.
    const timeline = await request(app).get(`/balance-contracts/${sgIssue.body.balanceContractId}/movements`).expect(200);
    expect(timeline.body[0].rootEventSnapshot).toEqual(sgReleased.body.rootEventSnapshot);
  });

  test('the root LC\'s own ISSUE movement carries a null rootEventSnapshot — nothing to redirect to', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'ROOTSNAP-2' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '50000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    expect(lc.body.rootEventSnapshot).toBeNull();
  });

  test('an Acceptance CREATE also carries a rootEventSnapshot (parent LC\'s own balance, unaffected by the Acceptance itself)', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'ROOTSNAP-3' },
        movementType: 'ISSUE', expiryDate: '2099-12-31',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        tenorDays: 120,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'ROOTSNAP-3' }).expect(200);

    const acceptance = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'ROOTSNAP-3', ibNumber: 'IB01' },
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '30000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
        parentLogicalContractId: lcContract.body.logicalContractId,
        createdBy: 'maker1',
      })
      .expect(201);
    expect(acceptance.body.eventSnapshot.balanceContractId).not.toBe(lc.body.balanceContractId);
    expect(acceptance.body.rootEventSnapshot.balanceContractId).toBe(lc.body.balanceContractId);
    expect(acceptance.body.rootEventSnapshot.confirmedBalance).toBe('100000');
  });
});

describe('HTTP integration — sibling Acceptance/SG snapshots (2026-08-17, "就是交易當時LC所有的BALANCE的拍照存檔"), reproducing LC S02\'s 3rd event exactly', () => {
  const app = createApp(createDb(':memory:'));

  test('a plain A3 (LC UTILIZE, no direct SG movement) carries sgEventSnapshot = the one existing SG\'s own CURRENT balance', async () => {
    const lc = await request(app)
      .post('/balance-movements')
      .send({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S02' }, movementType: 'ISSUE', expiryDate: '2099-12-31', eventSeq: 1, amount: '100000', currency: 'USD', tenorType: 'SIGHT', createdBy: 'maker1' })
      .expect(201);
    await request(app).post(`/balance-movements/${lc.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const lcContract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'S02' }).expect(200);

    const sg = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'SHGT',
        naturalKey: { lcNumber: 'S02', sgNumber: 'G01' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '12345',
        currency: 'USD',
        parentLogicalContractId: lcContract.body.logicalContractId,
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${sg.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const utilize = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.body.balanceContractId,
        movementType: 'UTILIZE',
        eventSeq: 2,
        amount: '22345',
        currency: 'USD',
        sourceTransactionRef: 'B01',
        createdBy: 'maker1',
      })
      .expect(201);

    expect(utilize.body.eventSnapshot.offBalanceExposure).toBe('12345');
    expect(utilize.body.rootEventSnapshot).toBeNull();
    expect(utilize.body.sgEventSnapshot.balanceContractId).toBe(sg.body.balanceContractId);
    expect(utilize.body.sgEventSnapshot.confirmedBalance).toBe('12345');
    expect(utilize.body.sgEventSnapshot.availableBalance).toBe('12345');
    expect(utilize.body.acceptanceEventSnapshot).toBeNull();

    // The Event Timeline's own copy carries the same sgEventSnapshot — zero extra request when viewed.
    const timeline = await request(app).get(`/balance-contracts/${lc.body.balanceContractId}/movements`).expect(200);
    const utilizeInTimeline = timeline.body.find((m: { movementId: string }) => m.movementId === utilize.body.movementId);
    expect(utilizeInTimeline.sgEventSnapshot).toEqual(utilize.body.sgEventSnapshot);
  });
});

describe('Generic 500 handler (Quality-report-balance.md BAL-117/BAL-129) — a plain, non-ApiError throw never leaks its own message to the caller', () => {
  // Every other error-path test in this file throws a typed ApiError subclass, which takes the adjacent
  // `if (err instanceof ApiError)` branch in app.ts's own error-handling middleware instead — this is the
  // one test exercising the plain-Error fallback branch itself (BAL-129: previously completely untested,
  // so a regression re-opening BAL-117's own information-disclosure fix would not have been caught).
  test('a plain Error thrown deep in the service layer -> 500 INTERNAL_ERROR with the fixed generic message, never the thrown message text; the real detail is still logged server-side', async () => {
    const service = new BalanceService(createDb(':memory:'));
    const distinctiveDetail = 'BAL-129-DISTINCTIVE-INTERNAL-DETAIL-a1b2c3';
    jest.spyOn(service, 'resolveContract').mockImplementation(() => {
      throw new Error(distinctiveDetail);
    });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp(createDb(':memory:'), service);

    const res = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'ANY' });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
    expect(JSON.stringify(res.body)).not.toContain(distinctiveDetail);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: distinctiveDetail }));

    consoleErrorSpy.mockRestore();
  });
});

// Fix Pending POST /balance-movements/:movementId/edit (analysis/Balance-Component-FixPending-
// DeletePending-Proposal-zh.md §2.2/§15/§19, 2026-08-27) — HTTP-level coverage for
// editMovementRequestSchema's own `.strict()` field-protection behavior and the route itself; the
// service-layer mechanics (in-place correction/eventSeq reuse/transaction consistency/ownership) already
// have dedicated coverage in balanceService.test.ts's own `editPending` describe block.
describe('POST /balance-movements/:movementId/edit — Fix Pending', () => {
  async function issueSightLc(app: import('express').Express, lcNumber: string) {
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        tenorType: 'SIGHT',
        expiryDate: '2099-12-31',
        createdBy: 'maker1',
      })
      .expect(201);
    return res.body;
  }

  test('happy path — 200/201 with the corrected amount, PENDING, same eventSeq, same movementId (in-place correction)', async () => {
    const app = createApp(createDb(':memory:'));
    const issue = await issueSightLc(app, 'FIXP-HTTP-001');

    const editRes = await request(app)
      .post(`/balance-movements/${issue.movementId}/edit`)
      .send({ amount: '130000', editedBy: 'maker2' });

    expect(editRes.status).toBe(200);
    expect(editRes.body.amount).toBe('130000');
    expect(editRes.body.status).toBe('PENDING');
    expect(editRes.body.eventSeq).toBe(issue.eventSeq);
    expect(editRes.body.movementId).toBe(issue.movementId);

    const movements = await request(app).get(`/balance-contracts/${issue.balanceContractId}/movements`).expect(200);
    expect(movements.body).toHaveLength(1); // exactly one row for this event — no second row left behind
    expect(movements.body[0].status).toBe('PENDING');
    expect(movements.body[0].amount).toBe('130000');
  });

  test('a locked field (e.g. currency) in the request body -> 400, rejected by the .strict() schema itself, never reaches the service', async () => {
    const app = createApp(createDb(':memory:'));
    const issue = await issueSightLc(app, 'FIXP-HTTP-002');

    const res = await request(app)
      .post(`/balance-movements/${issue.movementId}/edit`)
      .send({ amount: '130000', editedBy: 'maker2', currency: 'EUR' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');

    const movements = await request(app).get(`/balance-contracts/${issue.balanceContractId}/movements`).expect(200);
    expect(movements.body).toHaveLength(1); // rejected at the schema layer — no row was ever touched
    expect(movements.body[0].status).toBe('PENDING');
  });

  test('naturalKey/sourceTransactionRef/movementType/instrumentType are likewise rejected by the same .strict() schema', async () => {
    const app = createApp(createDb(':memory:'));
    const issue = await issueSightLc(app, 'FIXP-HTTP-003');

    for (const lockedField of [{ naturalKey: { lcNumber: 'SNEAKY' } }, { sourceTransactionRef: 'SNEAKY' }, { movementType: 'AMEND_INCREASE' }, { instrumentType: 'EPLC_LC' }]) {
      const res = await request(app)
        .post(`/balance-movements/${issue.movementId}/edit`)
        .send({ amount: '130000', editedBy: 'maker2', ...lockedField });
      expect(res.status).toBe(400);
    }
  });

  test('missing amount/editedBy -> 400', async () => {
    const app = createApp(createDb(':memory:'));
    const issue = await issueSightLc(app, 'FIXP-HTTP-004');

    await request(app).post(`/balance-movements/${issue.movementId}/edit`).send({ editedBy: 'maker2' }).expect(400);
    await request(app).post(`/balance-movements/${issue.movementId}/edit`).send({ amount: '130000' }).expect(400);
  });

  test('a malformed amount (fails MONETARY_AMOUNT_PATTERN) -> 400 at the schema layer', async () => {
    const app = createApp(createDb(':memory:'));
    const issue = await issueSightLc(app, 'FIXP-HTTP-005');

    const res = await request(app)
      .post(`/balance-movements/${issue.movementId}/edit`)
      .send({ amount: 'not-a-number', editedBy: 'maker2' });

    expect(res.status).toBe(400);
  });

  test('editing an already-RELEASED movement -> 409', async () => {
    const app = createApp(createDb(':memory:'));
    const issue = await issueSightLc(app, 'FIXP-HTTP-006');
    await request(app).post(`/balance-movements/${issue.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const res = await request(app)
      .post(`/balance-movements/${issue.movementId}/edit`)
      .send({ amount: '130000', editedBy: 'maker2' });

    expect(res.status).toBe(409);
  });

  test('editing a non-existent movementId -> 404', async () => {
    const app = createApp(createDb(':memory:'));

    const res = await request(app)
      .post('/balance-movements/00000000-0000-0000-0000-000000000000/edit')
      .send({ amount: '1', editedBy: 'maker2' });

    expect(res.status).toBe(404);
  });
});
