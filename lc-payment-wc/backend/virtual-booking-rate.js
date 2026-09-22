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

function normalizeRate(value, scale) {
  return fromScaledInteger(toScaledInteger(value, scale), scale);
}

function deriveMidpoint(buyRate, sellRate, scale = RATE_SCALE) {
  const total = toScaledInteger(buyRate, scale) + toScaledInteger(sellRate, scale);
  return fromScaledInteger((total + 1n) / 2n, scale);
}

function convertToUsd(amount, bookingRate, rateScale = RATE_SCALE) {
  const product = toScaledInteger(amount, rateScale) * toScaledInteger(bookingRate, rateScale);
  const divisor = 10n ** BigInt(rateScale * 2 - 2);
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
    maxStaleness <= 0 ||
    typeof amount !== 'string' ||
    !RATE_PATTERN.test(amount)
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
  const effectiveFrom = Date.parse(quote.effectiveFrom);
  const effectiveTo = quote.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(quote.effectiveTo);
  if (
    quote.approvalStatus !== 'APPROVED' ||
    !Number.isFinite(effectiveFrom) ||
    (quote.effectiveTo !== null && !Number.isFinite(effectiveTo)) ||
    effectiveFrom >= effectiveTo ||
    decisionAt < effectiveFrom ||
    decisionAt >= effectiveTo
  ) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is not Approved/Effective for ${baseCurrency}/${quoteCurrency}.` };
  }
  const rateAt = Date.parse(quote.rateTimestamp);
  if (!Number.isFinite(rateAt) || rateAt > decisionAt)
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote timestamp is invalid for ${baseCurrency}/${quoteCurrency}.` };
  if (decisionAt - rateAt > maxStaleness * 1000) {
    return { error: 'FX_RATE_STALE', message: `Virtual BOOKING quote is stale for ${baseCurrency}/${quoteCurrency}.` };
  }

  const rateScale = quote.rateScale;
  if (!Number.isInteger(rateScale) || rateScale < 2 || rateScale > 10 || quote.roundingMode !== 'ROUND_HALF_UP') {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote precision metadata is invalid for ${baseCurrency}/${quoteCurrency}.` };
  }
  try {
    toScaledInteger(amount, rateScale);
  } catch {
    return { error: 'INVALID_FX_REQUEST', message: `Virtual BOOKING request amount is invalid for ${baseCurrency}/${quoteCurrency}.` };
  }

  try {
    let bookingRate;
    let rateOrigin;
    if (quote.bookingRate !== undefined) {
      bookingRate = normalizeRate(quote.bookingRate, rateScale);
      rateOrigin = 'VIRTUAL_EXPLICIT';
    } else if (quote.buyRate !== undefined && quote.sellRate !== undefined) {
      bookingRate = deriveMidpoint(quote.buyRate, quote.sellRate, rateScale);
      rateOrigin = 'VIRTUAL_DERIVED_MID';
    } else {
      return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is incomplete for ${baseCurrency}/${quoteCurrency}.` };
    }
    return {
      baseCurrency,
      quoteCurrency,
      ratePurpose: 'BOOKING',
      buyRate: quote.buyRate === undefined ? undefined : normalizeRate(quote.buyRate, rateScale),
      sellRate: quote.sellRate === undefined ? undefined : normalizeRate(quote.sellRate, rateScale),
      bookingRate,
      convertedAmount: convertToUsd(amount, bookingRate, rateScale),
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
  } catch {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote contains an invalid rate for ${baseCurrency}/${quoteCurrency}.` };
  }
}

module.exports = { buildVirtualBookingQuote, convertToUsd, deriveMidpoint };
