import { readFileSync } from 'node:fs';

const BANK_PAYMENT_MESSAGE = 'pacs.009.001.08';
const CORE_BUSINESS_SERVICE = 'swift.cbprplus.04';
const COV_BUSINESS_SERVICE = 'swift.cbprplus.cov.04';
const CORE_SOURCE_MESSAGES = ['MT202', 'MT205'];
const COV_SOURCE_MESSAGES = ['MT202COV', 'MT205COV'];

const covProfile = JSON.parse(
  readFileSync(
    new URL('../parameters/cov-profile-allow-list.v15.1.json', import.meta.url),
    'utf8',
  ),
);

export const COV_ENABLED_SSI_CODES = new Set(
  covProfile.pairs.flatMap(({ ssiCodes }) => ssiCodes),
);

export const BANK_PAYMENT_APPLICABILITY = Object.freeze({
  consumer: 'CENTRAL_PAYMENT',
  product: 'CENTRAL_PAYMENT',
  businessFunction: 'INTERBANK_TRANSFER',
  paymentLeg: 'INTERBANK_SETTLEMENT',
  direction: 'OUTBOUND',
  status: 'ACTIVE',
});

const messageTypes = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const isExactBankSsi = (seed) =>
  (seed.route.counterpartyType ?? 'BANK') === 'BANK' &&
  seed.route.counterpartyBic &&
  seed.route.counterpartyBic !== 'ANY';

const isBankPaymentApplicability = (row) =>
  row.consumer === BANK_PAYMENT_APPLICABILITY.consumer &&
  row.product === BANK_PAYMENT_APPLICABILITY.product &&
  row.businessFunction === BANK_PAYMENT_APPLICABILITY.businessFunction &&
  row.paymentLeg === BANK_PAYMENT_APPLICABILITY.paymentLeg &&
  row.direction === BANK_PAYMENT_APPLICABILITY.direction;

export function withBankPaymentSsi(seed) {
  if (!isExactBankSsi(seed)) return seed;

  const supportedMessages = new Set(messageTypes(seed.route.messageTypes));
  supportedMessages.add(BANK_PAYMENT_MESSAGE);
  const covEnabled = COV_ENABLED_SSI_CODES.has(seed.route.ssiCode);
  const businessServices = [
    CORE_BUSINESS_SERVICE,
    ...(covEnabled ? [COV_BUSINESS_SERVICE] : []),
  ];
  const sourceMessageTypes = [
    ...CORE_SOURCE_MESSAGES,
    ...(covEnabled ? COV_SOURCE_MESSAGES : []),
  ];
  const applicability = seed.applicability.some(isBankPaymentApplicability)
    ? seed.applicability
    : [
        ...seed.applicability,
        {
          ...BANK_PAYMENT_APPLICABILITY,
          validFrom: seed.route.validFrom,
          validTo: seed.route.validTo,
        },
      ];

  return {
    ...seed,
    route: {
      ...seed.route,
      messageTypes: [...supportedMessages].join(','),
      businessService: businessServices.join(','),
      sourceMessageTypes: sourceMessageTypes.join(','),
    },
    applicability,
  };
}
