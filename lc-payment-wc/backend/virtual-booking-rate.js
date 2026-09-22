const RATE_PATTERN = /^\d{1,12}(\.\d{1,10})?$/;
const RATE_SCALE = 6;

function toScaledInteger(value, scale = RATE_SCALE) {
  if (typeof value !== 'string' || !RATE_PATTERN.test(value)) throw new Error('invalid virtual FX rate');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new Error(`virtual FX rate exceeds ${scale} decimal places`);
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function fromScaledInteger(value, scale = RATE_SCALE) {
  const digits = value.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function normalizeRate(value) {
  return fromScaledInteger(toScaledInteger(value));
}

function deriveMidpoint(buyRate, sellRate) {
  const total = toScaledInteger(buyRate) + toScaledInteger(sellRate);
  return fromScaledInteger((total + 1n) / 2n);
}

function convertToUsd(amount, bookingRate) {
  const product = toScaledInteger(amount) * toScaledInteger(bookingRate);
  const divisor = 10n ** BigInt(RATE_SCALE * 2 - 2);
  const cents = (product + divisor / 2n) / divisor;
  return fromScaledInteger(cents, 2);
}

function buildVirtualBookingQuote({ quote, baseCurrency, quoteCurrency, amount, decisionTime, correlationId, policyVersion, maxStalenessSeconds }) {
  const decisionAt = Date.parse(decisionTime);
  const maxStaleness = Number(maxStalenessSeconds);
  if (
    !Number.isFinite(decisionAt) ||
    typeof correlationId !== 'string' ||
    correlationId.trim() === '' ||
    typeof policyVersion !== 'string' ||
    policyVersion.trim() === '' ||
    !Number.isInteger(maxStaleness) ||
    maxStaleness <= 0
  ) {
    return { error: 'INVALID_FX_REQUEST' };
  }
  if (!quote) return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is unavailable for ${baseCurrency}/${quoteCurrency}.` };
  if (quote.simulatedFailure) {
    return {
      error: 'FX_RATE_UNAVAILABLE',
      reason: quote.simulatedFailure,
      message: `Virtual BOOKING quote failed for ${baseCurrency}/${quoteCurrency}.`,
    };
  }
  if (quote.approvalStatus !== 'APPROVED' || decisionAt < Date.parse(quote.effectiveFrom) || decisionAt >= Date.parse(quote.effectiveTo)) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is not Approved/Effective for ${baseCurrency}/${quoteCurrency}.` };
  }
  const rateAt = Date.parse(quote.rateTimestamp);
  if (!Number.isFinite(rateAt)) return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote timestamp is invalid for ${baseCurrency}/${quoteCurrency}.` };
  if (decisionAt - rateAt > maxStaleness * 1000) {
    return { error: 'FX_RATE_STALE', message: `Virtual BOOKING quote is stale for ${baseCurrency}/${quoteCurrency}.` };
  }

  let bookingRate;
  let rateOrigin;
  if (quote.bookingRate !== undefined) {
    bookingRate = normalizeRate(quote.bookingRate);
    rateOrigin = 'VIRTUAL_EXPLICIT';
  } else if (quote.buyRate !== undefined && quote.sellRate !== undefined) {
    bookingRate = deriveMidpoint(quote.buyRate, quote.sellRate);
    rateOrigin = 'VIRTUAL_DERIVED_MID';
  } else {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is incomplete for ${baseCurrency}/${quoteCurrency}.` };
  }

  return {
    baseCurrency,
    quoteCurrency,
    ratePurpose: 'BOOKING',
    buyRate: quote.buyRate === undefined ? undefined : normalizeRate(quote.buyRate),
    sellRate: quote.sellRate === undefined ? undefined : normalizeRate(quote.sellRate),
    bookingRate,
    convertedAmount: convertToUsd(amount, bookingRate),
    rateOrigin,
    rateSource: quote.rateSource,
    providerRateId: quote.providerRateId,
    providerRateVersion: quote.providerRateVersion,
    rateTimestamp: quote.rateTimestamp,
    approvalStatus: 'APPROVED',
    effectiveFrom: quote.effectiveFrom,
    effectiveTo: quote.effectiveTo,
    freshnessStatus: 'FRESH',
    correlationId,
    policyVersion,
  };
}

module.exports = { buildVirtualBookingQuote, convertToUsd, deriveMidpoint };
