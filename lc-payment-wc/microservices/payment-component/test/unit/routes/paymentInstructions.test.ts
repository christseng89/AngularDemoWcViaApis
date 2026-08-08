import request from 'supertest';
import { createApp, API_BASE_PATH } from '../../../src/app';

const validBody = {
  originModule: 'IPLC',
  mainRef: 'REF-ROUTE-1',
  sequence: 1,
  unitCode: 'HQ',
  debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
  creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }],
  sourceFunctionCode: 'PayAccept',
};

describe('POST /payment-instructions', () => {
  it('returns 201 for a new natural key', async () => {
    const app = createApp();
    const res = await request(app).post(`${API_BASE_PATH}/payment-instructions`).send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.instructionId).toBeDefined();
    expect(res.body.classification.paymentComponentRelated).toBe(true);
  });

  it('returns 200 on idempotent replay of the same natural key', async () => {
    const app = createApp();
    const first = await request(app).post(`${API_BASE_PATH}/payment-instructions`).send(validBody);
    const second = await request(app).post(`${API_BASE_PATH}/payment-instructions`).send(validBody);
    expect(second.status).toBe(200);
    expect(second.body.instructionId).toBe(first.body.instructionId);
  });

  it('dryRun:true always returns 200, even for a brand-new natural key', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({ ...validBody, mainRef: 'REF-DRY-RUN', dryRun: true });
    expect(res.status).toBe(200);
  });

  it('returns 400 for a malformed request body', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({ ...validBody, debitLegs: [] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  it('returns 409 for unbalanced legs', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({ ...validBody, mainRef: 'REF-UNBALANCED', creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '1' }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LEGS_UNBALANCED');
  });

  it('expands suspenseBridge into a Suspense - Debit leg and returns 201 when the caller pre-adjusted its own debit total', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({
        ...validBody,
        mainRef: 'REF-ROUTE-SB',
        debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '110' }],
        suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD' }] },
      });
    expect(res.status).toBe(201);
    expect(res.body.creditLegs.some((l: { accountNo: string }) => l.accountNo === 'Suspense - Debit')).toBe(true);
  });

  it('returns 409 when a suspenseBridge entry is submitted without the caller pre-adjusting its own leg totals', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({
        ...validBody,
        mainRef: 'REF-ROUTE-SB-UNBAL',
        suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD' }] },
      });
    expect(res.status).toBe(409);
  });

  it('a sourceComponent-tagged suspenseBridge entry (no chargeContext/liabilityContext exist to conflict with) produces only a SETTLEMENT entry', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({
        ...validBody,
        mainRef: 'REF-ROUTE-SB-TAGGED',
        debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '110' }],
        suspenseBridge: {
          debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'IBL' }],
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.accountEntries.every((e: { voucherType: string }) => e.voucherType === 'SETTLEMENT')).toBe(true);
  });
});

describe('POST /payment-instructions/classify', () => {
  it('returns 200 with classification and balance for a valid body', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions/classify`)
      .send({
        debitLegs: [{ accountNo: 'A', accountType: 'NOSTRO', currency: 'IDR', amountTxCcy: '500' }],
        creditLegs: [{ accountNo: 'B', accountType: 'CUSTOMER', currency: 'IDR', amountTxCcy: '500' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.classification.paymentComponentRelated).toBe(true);
    expect(res.body.balance.balanced).toBe(true);
  });

  it('includes SETTLEMENT accountEntries for both legs', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions/classify`)
      .send({
        debitLegs: [{ accountNo: 'A', accountType: 'NOSTRO', currency: 'IDR', amountTxCcy: '500' }],
        creditLegs: [{ accountNo: 'B', accountType: 'CUSTOMER', currency: 'IDR', amountTxCcy: '500' }],
      });
    expect(res.body.accountEntries).toHaveLength(2);
    expect(res.body.accountEntries.every((e: { voucherType: string }) => e.voucherType === 'SETTLEMENT')).toBe(true);
    expect(res.body.accountEntries[0].description).toContain('no Payment Component voucher code prefix');
  });

  it('returns 400 for a malformed classify request', async () => {
    const app = createApp();
    const res = await request(app).post(`${API_BASE_PATH}/payment-instructions/classify`).send({ debitLegs: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /payment-instructions', () => {
  async function seeded() {
    const app = createApp();
    const a = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({ ...validBody, originModule: 'IPLC', mainRef: 'REF-A' });
    const b = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({ ...validBody, originModule: 'EPLC', mainRef: 'REF-B', sourceFunctionCode: 'PayAtMaturity' });
    return { app, a: a.body, b: b.body };
  }

  it('with no query returns every instruction', async () => {
    const { app } = await seeded();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions`);
    expect(res.body).toHaveLength(2);
  });

  it('filters by originModule query param', async () => {
    const { app, a } = await seeded();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions?originModule=IPLC`);
    expect(res.body).toEqual([a]);
  });

  it('filters by mainRef query param', async () => {
    const { app, b } = await seeded();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions?mainRef=REF-B`);
    expect(res.body).toEqual([b]);
  });

  it('ignores an originModule query value outside the enum (treated as no filter)', async () => {
    const { app } = await seeded();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions?originModule=NOT_REAL`);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /payment-instructions/:instructionId and sub-resources', () => {
  async function seededOne() {
    const app = createApp();
    const created = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({ ...validBody, mainRef: 'REF-ONE' });
    return { app, instructionId: created.body.instructionId as string };
  }

  it('GET by id returns 200 with the full instruction', async () => {
    const { app, instructionId } = await seededOne();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions/${instructionId}`);
    expect(res.status).toBe(200);
    expect(res.body.instructionId).toBe(instructionId);
  });

  it('GET by id returns 404 for an unknown id', async () => {
    const app = createApp();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('GET account-entries returns 200 with the entries array', async () => {
    const { app, instructionId } = await seededOne();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions/${instructionId}/account-entries`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET account-entries returns 404 for an unknown id', async () => {
    const app = createApp();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions/does-not-exist/account-entries`);
    expect(res.status).toBe(404);
  });

  it('GET swift-messages returns 200 with the messages array', async () => {
    const app = createApp();
    const created = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({
        ...validBody,
        mainRef: 'REF-SWIFT',
        creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100', payAdviceMsgType: 'MT103' }],
      });
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions/${created.body.instructionId}/swift-messages`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('GET swift-messages returns 404 for an unknown id', async () => {
    const app = createApp();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions/does-not-exist/swift-messages`);
    expect(res.status).toBe(404);
  });
});
