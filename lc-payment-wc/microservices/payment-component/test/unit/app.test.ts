import request from 'supertest';
import { createApp, API_BASE_PATH } from '../../src/app';
import { createInMemoryPaymentInstructionStore, type PaymentInstructionStore } from '../../src/store/paymentInstructionStore';

describe('createApp', () => {
  it('GET /healthz returns 200 { status: "ok" }', async () => {
    const app = createApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('maps a known ApiError subclass onto its declared HTTP status and OAS error body', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({}); // missing every required field -> RequestValidationError (400)
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  it('maps an unexpected non-ApiError thrown deep in the stack to a 500 with a generic body', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const brokenStore: PaymentInstructionStore = {
      ...createInMemoryPaymentInstructionStore(),
      find: () => {
        throw new Error('unexpected database outage');
      },
    };
    const app = createApp(brokenStore);

    const res = await request(app)
      .post(`${API_BASE_PATH}/payment-instructions`)
      .send({
        originModule: 'IPLC',
        mainRef: 'REF-1',
        sequence: 1,
        unitCode: 'HQ',
        debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }],
        sourceFunctionCode: 'PayAccept',
      });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('defaults to a fresh in-memory store when none is supplied', async () => {
    const app = createApp();
    const res = await request(app).get(`${API_BASE_PATH}/payment-instructions`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
