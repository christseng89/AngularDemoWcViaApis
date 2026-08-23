/**
 * HTTP-integration test for the A6/B4 Calculated Maturity Date feature. Two layers, kept separate:
 *
 * (1) The Clearing Bank Calendar Profile config (`maturityDateCalendars`/`_combinationRule`/`_convention`)
 *     — captured ONCE on the LC/Confirmation (A1/B1 root ISSUE, amendable via A2/B2's own
 *     AMEND_MATURITY_CALENDARS), never re-typed per Acceptance. Unaffected by the Risk Containment Gate
 *     below — this describe block is unchanged from before that gate landed.
 *
 * (2) The Risk Containment Gate (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §8, P0) — REPLACES the
 *     former "unconditionally use today as Base Date" auto-calc, a confirmed bug (silently produced a
 *     wrong Contractual Maturity Date for any tenorBasis whose Base Date isn't coincidentally "today").
 *     A caller-supplied `maturityDate` on an Acceptance CREATE is now always rejected (no way to verify
 *     it). The ONLY verified Base Date source today is tenorBasis='FIXED_MATURITY_DATE' — every other
 *     tenorBasis (or none at all) leaves the new Acceptance at maturityDateStatus='PENDING_BASE_DATE',
 *     no Contractual/Operational Maturity Date computed, no Standing call. See app.acceptanceSettlement
 *     tests for A7/B5's own new maturityDateStatus==='APPROVED' precondition.
 *
 * Mocks `clients/standingClient` entirely (its own dedicated unit test covers the real HTTP call).
 */
import request from 'supertest';
import { createDb } from '../../src/db';
import { createApp } from '../../src/app';
import { BalanceContractStore } from '../../src/store/balanceContractStore';
import * as standingClient from '../../src/clients/standingClient';
import { CalendarServiceError } from '../../src/errors';

jest.mock('../../src/clients/standingClient');
const adjustBusinessDayMock = standingClient.adjustBusinessDay as jest.MockedFunction<typeof standingClient.adjustBusinessDay>;

const CALENDARS = [{ calendarType: 'CURRENCY_CLEARING', code: 'USD_FEDWIRE', role: 'CURRENCY_CLEARING', required: true }];
const FIXED_MATURITY_DATE = '2026-12-25';

function standingResponse(adjustedDate: string) {
  return {
    calculationId: 'calc-mock-1',
    adjustedDate,
    wasAdjusted: true,
    adjustmentDays: 3,
    contractualDateChanged: false as const,
    calendarSnapshotId: 'snap-mock-1',
    calendarVersions: [],
    calendarAssessments: [],
    adjustedDateAssessments: [],
    skippedDates: [],
  };
}

/** Issues (and releases) a root IPLC_LC, optionally with maturityDateCalendars/tenorBasis set, returning its logicalContractId. */
async function issueAndReleaseLc(app: import('express').Express, lcNumber: string, extra: Record<string, unknown> = {}): Promise<string> {
  const issued = await request(app)
    .post('/balance-movements')
    .send({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '100000',
      currency: 'USD',
      expiryDate: '2030-12-31',
      tenorType: 'SELLERS_USANCE',
      tenorDays: 90,
      createdBy: 'maker1',
      ...extra,
    })
    .expect(201);
  await request(app).post(`/balance-movements/${issued.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
  const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber }).expect(200);
  return contract.body.logicalContractId;
}

describe('A1/B1 root ISSUE — maturityDateCalendars captured once on the LC/Confirmation', () => {
  afterEach(() => jest.clearAllMocks());

  test('A1 ISSUE with maturityDateCalendars: persisted on the new contract, no Standing call at ISSUE time itself', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'CAL-001', { maturityDateCalendars: CALENDARS, maturityDateCombinationRule: 'ALL_REQUIRED_OPEN', maturityDateConvention: 'FOLLOWING' });

    expect(adjustBusinessDayMock).not.toHaveBeenCalled();
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAL-001' }).expect(200);
    expect(contract.body.maturityDateCalendars).toEqual(CALENDARS);
    expect(contract.body.maturityDateCombinationRule).toBe('ALL_REQUIRED_OPEN');
    expect(contract.body.maturityDateConvention).toBe('FOLLOWING');
  });

  test('A1 ISSUE without maturityDateCalendars on a SIGHT LC: allowed, all three fields stay null (Sight never produces an Acceptance, so nothing would ever read this back)', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'CAL-002', { tenorType: 'SIGHT', tenorDays: 0 });

    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAL-002' }).expect(200);
    expect(contract.body.maturityDateCalendars).toBeNull();
    expect(contract.body.maturityDateCombinationRule).toBeNull();
    expect(contract.body.maturityDateConvention).toBeNull();
  });

  // "Required for Usance, not for Sight" is a Angular form-validation rule (see builder-fields.ts), not
  // a server-side rejection here — see resolveOrCreateContract()'s own doc comment for why a hard 400
  // would also break the large pre-existing corpus of Usance-tenor test fixtures unrelated to this
  // feature. A Usance LC issued without it (like this one) stays a perfectly valid, if unusual, state —
  // see the "LEGACY Usance parent" test below for what happens when its own Acceptance is later created.
  test('A1 ISSUE on a Usance LC WITHOUT maturityDateCalendars is still accepted server-side (UI-only requirement, not an API one)', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'CAL-003'); // SELLERS_USANCE by default, no calendars

    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAL-003' }).expect(200);
    expect(contract.body.maturityDateCalendars).toBeNull();
  });

  test('tenorBasis is optional server-side — omitting it (the large pre-existing Usance test corpus) is still accepted', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'CAL-004');

    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAL-004' }).expect(200);
    expect(contract.body.tenorBasis).toBeNull();
  });

  test('AFTER_SIGHT + SELLERS_USANCE is rejected at A1 ISSUE (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §1/§3.1, business-confirmed policy)', async () => {
    const app = createApp(createDb(':memory:'));
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'CAL-005' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        expiryDate: '2030-12-31',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        tenorBasis: 'AFTER_SIGHT',
        createdBy: 'maker1',
      })
      .expect(400);

    expect(res.body.message).toMatch(/AFTER_SIGHT cannot be combined with SELLERS_USANCE/);
  });

  test('tenorBasis on a SIGHT-tenor contract is rejected — it has no meaning there', async () => {
    const app = createApp(createDb(':memory:'));
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'CAL-006' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        expiryDate: '2030-12-31',
        tenorType: 'SIGHT',
        tenorDays: 0,
        tenorBasis: 'AFTER_SIGHT',
        createdBy: 'maker1',
      })
      .expect(400);

    expect(res.body.message).toMatch(/tenorBasis has no meaning for a SIGHT-tenor contract/);
  });

  test('tenorBasis=FIXED_MATURITY_DATE without fixedMaturityDate is rejected', async () => {
    const app = createApp(createDb(':memory:'));
    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        naturalKey: { lcNumber: 'CAL-007' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '100000',
        currency: 'USD',
        expiryDate: '2030-12-31',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        tenorBasis: 'FIXED_MATURITY_DATE',
        createdBy: 'maker1',
      })
      .expect(400);

    expect(res.body.message).toMatch(/fixedMaturityDate is required/);
  });

  test('tenorBasis=FIXED_MATURITY_DATE with fixedMaturityDate: both persisted on the new contract', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'CAL-008', { maturityDateCalendars: CALENDARS, tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: FIXED_MATURITY_DATE });

    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'CAL-008' }).expect(200);
    expect(contract.body.tenorBasis).toBe('FIXED_MATURITY_DATE');
    expect(contract.body.fixedMaturityDate).toBe(FIXED_MATURITY_DATE);
  });
});

describe('A6/B4 Acceptance CREATE — Risk Containment Gate (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §8, P0)', () => {
  afterEach(() => jest.clearAllMocks());

  test('a caller-supplied maturityDate on an Acceptance CREATE is always rejected — no way to verify it against a tenorBasis/Base Date', async () => {
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-000', { maturityDateCalendars: CALENDARS, tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: FIXED_MATURITY_DATE });

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-000', ibNumber: 'IB-000' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        maturityDate: '2026-11-01',
        createdBy: 'maker1',
      })
      .expect(400);

    expect(res.body.message).toMatch(/no longer accepted on an Acceptance CREATE/);
    expect(adjustBusinessDayMock).not.toHaveBeenCalled();
  });

  test('parent has maturityDateCalendars but NO tenorBasis on file: safe default — maturityDateStatus PENDING_BASE_DATE, no Standing call, no wrong date silently produced', async () => {
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-001', { maturityDateCalendars: CALENDARS });

    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-001', ibNumber: 'IB-001' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '40000',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        createdBy: 'maker1',
      })
      .expect(201);

    expect(adjustBusinessDayMock).not.toHaveBeenCalled();
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'MAT-001', ibNumber: 'IB-001' }).expect(200);
    expect(contract.body.maturityDateStatus).toBe('PENDING_BASE_DATE');
    expect(contract.body.contractualMaturityDate).toBeNull();
    expect(contract.body.operationalPaymentDate).toBeNull();
  });

  test('parent has tenorBasis=AFTER_SIGHT (no verified sightDate source wired yet): same safe PENDING_BASE_DATE default, no Standing call', async () => {
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-001B', { maturityDateCalendars: CALENDARS, tenorBasis: 'AFTER_SIGHT', tenorType: 'BUYERS_USANCE' });

    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-001B', ibNumber: 'IB-001B' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '40000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    expect(adjustBusinessDayMock).not.toHaveBeenCalled();
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'MAT-001B', ibNumber: 'IB-001B' }).expect(200);
    expect(contract.body.maturityDateStatus).toBe('PENDING_BASE_DATE');
  });

  test('parent has tenorBasis=FIXED_MATURITY_DATE: Standing called automatically with fixedMaturityDate as sourceDate, Contractual/Operational Maturity Date + calendarSnapshotId persisted, maturityDateStatus PENDING_APPROVAL until Release', async () => {
    adjustBusinessDayMock.mockResolvedValue(standingResponse('2026-12-28'));
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-002', { maturityDateCalendars: CALENDARS, tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: FIXED_MATURITY_DATE });

    const created = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-002', ibNumber: 'IB-002' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '40000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    expect(adjustBusinessDayMock).toHaveBeenCalledTimes(1);
    expect(adjustBusinessDayMock).toHaveBeenCalledWith(expect.objectContaining({ sourceDate: FIXED_MATURITY_DATE, currency: 'USD', calendars: CALENDARS }));
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'MAT-002', ibNumber: 'IB-002' }).expect(200);
    expect(contract.body.contractualMaturityDate).toBe(FIXED_MATURITY_DATE);
    expect(contract.body.operationalPaymentDate).toBe('2026-12-28');
    expect(contract.body.standingCalculationId).toBe('calc-mock-1');
    expect(contract.body.calendarSnapshotId).toBe('snap-mock-1');
    expect(contract.body.maturityDateStatus).toBe('PENDING_APPROVAL');
    expect(created.body.maturityDate).toBeUndefined(); // BalanceMovement carries no maturityDate field at all — it lives on BalanceContract only

    await request(app).post(`/balance-movements/${created.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const afterRelease = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'MAT-002', ibNumber: 'IB-002' }).expect(200);
    expect(afterRelease.body.maturityDateStatus).toBe('APPROVED');
  });

  test('EPLC_ACCEPTANCE CREATE (B4\'s own Usance-branch shape) is covered by the same FIXED_MATURITY_DATE path', async () => {
    adjustBusinessDayMock.mockResolvedValue(standingResponse('2027-02-01'));
    const app = createApp(createDb(':memory:'));
    const confirmed = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_CONFIRMATION',
        naturalKey: { lcNumber: 'MAT-003' },
        movementType: 'ISSUE',
        eventSeq: 1,
        amount: '25000',
        currency: 'EUR',
        expiryDate: '2030-12-31',
        tenorType: 'BUYERS_USANCE',
        tenorDays: 60,
        maturityDateCalendars: [{ calendarType: 'COUNTRY', code: 'GB', role: 'SETTLEMENT', required: true }],
        tenorBasis: 'FIXED_MATURITY_DATE',
        fixedMaturityDate: '2027-01-15',
        createdBy: 'maker1',
      })
      .expect(201);
    await request(app).post(`/balance-movements/${confirmed.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);
    const parent = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_CONFIRMATION', lcNumber: 'MAT-003' }).expect(200);

    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'EPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-003', ibNumber: 'EB-003' },
        parentLogicalContractId: parent.body.logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '25000',
        currency: 'EUR',
        createdBy: 'maker1',
      })
      .expect(201);

    expect(adjustBusinessDayMock).toHaveBeenCalledTimes(1);
    expect(adjustBusinessDayMock).toHaveBeenCalledWith(expect.objectContaining({ sourceDate: '2027-01-15' }));
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'EPLC_ACCEPTANCE', lcNumber: 'MAT-003', ibNumber: 'EB-003' }).expect(200);
    expect(contract.body.operationalPaymentDate).toBe('2027-02-01');
  });

  test('a Usance parent with NO maturityDateCalendars on file at all: Acceptance CREATE completely unaffected, no Standing call, no crash', async () => {
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-004'); // SELLERS_USANCE by default, no calendars, no tenorBasis

    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-004', ibNumber: 'IB-004' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    expect(adjustBusinessDayMock).not.toHaveBeenCalled();
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'MAT-004', ibNumber: 'IB-004' }).expect(200);
    expect(contract.body.maturityDateStatus).toBe('PENDING_BASE_DATE');
  });

  test('Standing failure surfaces as 503 CALENDAR_SERVICE_UNAVAILABLE, not a generic 500 — and no contract is left orphaned behind it', async () => {
    adjustBusinessDayMock.mockRejectedValue(new CalendarServiceError('Standing service unreachable at http://localhost:4400: connect ECONNREFUSED'));
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-006', { maturityDateCalendars: CALENDARS, tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: FIXED_MATURITY_DATE });

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-006', ibNumber: 'IB-006' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(503);

    expect(res.body.code).toBe('CALENDAR_SERVICE_UNAVAILABLE');
    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_ACCEPTANCE', lcNumber: 'MAT-006', ibNumber: 'IB-006' });
    expect(contract.status).toBe(404); // never created — the failed Standing call happens BEFORE createMovement()
  });

  // A genuinely unexpected (non-ApiError) failure anywhere in this new async pre-step must still fall
  // through to app.ts's own generic 500 handler, same as any other route — proving the try/catch +
  // next(err) wiring in routes/balanceMovements.ts (added for this async handler specifically) doesn't
  // accidentally swallow or mis-map an error class it wasn't written to expect.
  test('a genuinely unexpected error (not a CalendarServiceError) surfaces as a generic 500, not a mis-mapped status', async () => {
    adjustBusinessDayMock.mockRejectedValue(new Error('unexpected internal failure, not from standingClient itself'));
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'MAT-007', { maturityDateCalendars: CALENDARS, tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: FIXED_MATURITY_DATE });

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'MAT-007', ibNumber: 'IB-007' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(500);

    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});

describe('A2 AMEND_MATURITY_CALENDARS — Update Maturity Date Calendars on an already-Issued LC', () => {
  afterEach(() => jest.clearAllMocks());

  test('Submit + Release updates the contract\'s own calendars; a subsequent Acceptance CREATE (FIXED_MATURITY_DATE path) picks up the AMENDED config, not the original', async () => {
    adjustBusinessDayMock.mockResolvedValue(standingResponse('2026-06-01'));
    const app = createApp(createDb(':memory:'));
    const logicalContractId = await issueAndReleaseLc(app, 'AMD-001', { maturityDateCalendars: CALENDARS, tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: FIXED_MATURITY_DATE });

    const NEW_CALENDARS = [{ calendarType: 'COUNTRY', code: 'TW', role: 'SETTLEMENT', required: true }];
    const amend = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId: (await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-001' })).body.balanceContractId,
        movementType: 'AMEND_MATURITY_CALENDARS',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        maturityDateCalendars: NEW_CALENDARS,
        maturityDateCombinationRule: 'ANY_ELIGIBLE_OPEN',
        maturityDateConvention: 'NEAREST',
        createdBy: 'maker1',
      })
      .expect(201);
    expect(amend.body.status).toBe('PENDING');

    // Not yet applied to the contract — only takes effect at Release (mirrors AMEND_EXPIRY's own posture).
    let contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-001' }).expect(200);
    expect(contract.body.maturityDateCalendars).toEqual(CALENDARS);

    await request(app).post(`/balance-movements/${amend.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-001' }).expect(200);
    expect(contract.body.maturityDateCalendars).toEqual(NEW_CALENDARS);
    expect(contract.body.maturityDateCombinationRule).toBe('ANY_ELIGIBLE_OPEN');
    expect(contract.body.maturityDateConvention).toBe('NEAREST');

    await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_ACCEPTANCE',
        naturalKey: { lcNumber: 'AMD-001', ibNumber: 'IB-AMD-001' },
        parentLogicalContractId: logicalContractId,
        movementType: 'CREATE',
        eventSeq: 1,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(201);

    expect(adjustBusinessDayMock).toHaveBeenCalledWith(expect.objectContaining({ calendars: NEW_CALENDARS, combinationRule: 'ANY_ELIGIBLE_OPEN', convention: 'NEAREST' }));
  });

  test('amount must be exactly 0 for AMEND_MATURITY_CALENDARS', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'AMD-002', { maturityDateCalendars: CALENDARS });
    const { balanceContractId } = (await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-002' })).body;

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId,
        movementType: 'AMEND_MATURITY_CALENDARS',
        eventSeq: 2,
        amount: '5',
        currency: 'USD',
        maturityDateCalendars: CALENDARS,
        createdBy: 'maker1',
      })
      .expect(400);

    expect(res.body.message).toMatch(/must be exactly 0 for AMEND_MATURITY_CALENDARS/);
  });

  test('maturityDateCalendars is required for AMEND_MATURITY_CALENDARS', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'AMD-003', { maturityDateCalendars: CALENDARS });
    const { balanceContractId } = (await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-003' })).body;

    const res = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId,
        movementType: 'AMEND_MATURITY_CALENDARS',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        createdBy: 'maker1',
      })
      .expect(400);

    expect(res.body.message).toMatch(/maturityDateCalendars is required/);
  });

  test('AMEND_MATURITY_CALENDARS is accepted against a Sight-tenor LC too (2026-08-23, widened — a Sight LC still settles through a paying/collecting bank, same Clearing Bank Calendar config)', async () => {
    const app = createApp(createDb(':memory:'));
    await issueAndReleaseLc(app, 'AMD-004', { tenorType: 'SIGHT', tenorDays: 0 });
    const { balanceContractId } = (await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-004' })).body;

    const submitRes = await request(app)
      .post('/balance-movements')
      .send({
        instrumentType: 'IPLC_LC',
        balanceContractId,
        movementType: 'AMEND_MATURITY_CALENDARS',
        eventSeq: 2,
        amount: '0',
        currency: 'USD',
        maturityDateCalendars: CALENDARS,
        createdBy: 'maker1',
      })
      .expect(201);

    await request(app).post(`/balance-movements/${submitRes.body.movementId}/release`).send({ releasedBy: 'checker1' }).expect(200);

    const contract = await request(app).get('/balance-contracts').query({ instrumentType: 'IPLC_LC', lcNumber: 'AMD-004' }).expect(200);
    expect(contract.body.maturityDateCalendars).toEqual(CALENDARS);
  });
});

describe('BalanceContractStore.updateMaturityDateCalendars', () => {
  test('a null calendars argument clears all three columns back to null (not just an empty array)', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const contracts = new BalanceContractStore(db);
    const logicalContractId = await issueAndReleaseLc(app, 'STORE-001', { maturityDateCalendars: CALENDARS, maturityDateCombinationRule: 'ALL_REQUIRED_OPEN', maturityDateConvention: 'FOLLOWING' });
    const before = contracts.findActiveByLogicalContractId(logicalContractId)!;
    expect(before.maturityDateCalendars).toEqual(CALENDARS);

    contracts.updateMaturityDateCalendars(before.balanceContractId, null, null, null);

    const after = contracts.findActiveByLogicalContractId(logicalContractId)!;
    expect(after.maturityDateCalendars).toBeNull();
    expect(after.maturityDateCombinationRule).toBeNull();
    expect(after.maturityDateConvention).toBeNull();
  });
});
