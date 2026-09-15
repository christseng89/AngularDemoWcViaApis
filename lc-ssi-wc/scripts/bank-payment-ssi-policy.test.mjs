import assert from 'node:assert/strict';
import test from 'node:test';
import { withBankPaymentSsi } from './bank-payment-ssi-policy.mjs';

const seed = (route = {}) => ({
  counterpartyId: 'CP-CITIUS33',
  route: {
    counterpartyBic: 'CITIUS33',
    messageTypes: 'pacs.008.001.12',
    validFrom: '2026-01-01',
    validTo: '2027-12-31',
    ...route,
  },
  applicability: [],
});

test('adds bank Payment applicability and pacs.009 Core without mutating input', () => {
  const input = seed();
  const result = withBankPaymentSsi(input);

  assert.notEqual(result, input);
  assert.equal(input.applicability.length, 0);
  assert.deepEqual(result.route.messageTypes.split(','), [
    'pacs.008.001.12',
    'pacs.009.001.08',
  ]);
  assert.equal(result.route.businessService, 'swift.cbprplus.04');
  assert.equal(result.route.sourceMessageTypes, 'MT202,MT205');
  assert.deepEqual(result.applicability, [
    {
      consumer: 'CENTRAL_PAYMENT',
      product: 'CENTRAL_PAYMENT',
      businessFunction: 'INTERBANK_TRANSFER',
      paymentLeg: 'INTERBANK_SETTLEMENT',
      direction: 'OUTBOUND',
      status: 'ACTIVE',
      validFrom: '2026-01-01',
      validTo: '2027-12-31',
    },
  ]);
});

test('adds COV only for the approved v15.1 SSI allow-list', () => {
  const approved = withBankPaymentSsi(
    seed({ ssiCode: 'SSI-DEMO-003' }),
  );
  assert.equal(
    approved.route.businessService,
    'swift.cbprplus.04,swift.cbprplus.cov.04',
  );
  assert.equal(
    approved.route.sourceMessageTypes,
    'MT202,MT205,MT202COV,MT205COV',
  );

  const excluded = withBankPaymentSsi(
    seed({ ssiCode: 'SSI-DEMO-041' }),
  );
  assert.equal(excluded.route.businessService, 'swift.cbprplus.04');
  assert.equal(excluded.route.sourceMessageTypes, 'MT202,MT205');
});

test('is idempotent', () => {
  const once = withBankPaymentSsi(seed());
  const twice = withBankPaymentSsi(once);

  assert.equal(twice.applicability.length, 1);
  assert.equal(
    twice.route.messageTypes.split(',').filter((value) => value === 'pacs.009.001.08').length,
    1,
  );
});

test('does not convert Customer SSI', () => {
  const input = seed({ counterpartyType: 'CUSTOMER', counterpartyBic: undefined });
  assert.equal(withBankPaymentSsi(input), input);
});

test('does not convert generic fallback SSI', () => {
  const input = seed({ counterpartyBic: 'ANY' });
  assert.equal(withBankPaymentSsi(input), input);
});
