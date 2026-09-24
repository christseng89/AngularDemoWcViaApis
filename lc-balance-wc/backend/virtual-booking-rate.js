const RATE_PATTERN = /^\d{1,12}(\.\d{1,10})?$/;
const USD_AMOUNT_PATTERN = /^\d{1,18}(\.\d{1,2})?$/;
const RATE_SCALE = 6;

function toScaledInteger(value, scale = RATE_SCALE, pattern = RATE_PATTERN) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error('invalid virtual FX decimal');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new Error(`virtual FX rate exceeds ${scale} decimal places`);
  return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
}

function fromScaledInteger(value, scale = RATE_SCALE) {
  if (scale === 0) return value.toString();
  const digits = value.toString().padStart(scale + 1, '0');
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function normalizeRate(value, scale) {
  return fromScaledInteger(toScaledInteger(value, scale), scale);
}

function isNonBlank(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveDecimal(value, scale, pattern = RATE_PATTERN) {
  try {
    return toScaledInteger(value, scale, pattern) > 0n;
  } catch {
    return false;
  }
}

function deriveMidpoint(buyRate, sellRate, scale = RATE_SCALE) {
  const total = toScaledInteger(buyRate, scale) + toScaledInteger(sellRate, scale);
  return fromScaledInteger((total + 1n) / 2n, scale);
}

function convertToOwnerCurrency(amount, bookingRate, targetMinorUnits, rateScale = RATE_SCALE) {
  const product = toScaledInteger(amount, rateScale, USD_AMOUNT_PATTERN) * toScaledInteger(bookingRate, rateScale);
  const divisor = 10n ** BigInt(rateScale * 2 - targetMinorUnits);
  const roundedMinorUnits = (product + divisor / 2n) / divisor;
  return fromScaledInteger(roundedMinorUnits, targetMinorUnits);
}

function requestIsInvalid(input, decisionAt, maxStaleness) {
  return (
    !Number.isFinite(decisionAt) ||
    !isNonBlank(input.correlationId) ||
    !isNonBlank(input.requestAttemptId) ||
    !isNonBlank(input.policyVersion) ||
    !Number.isInteger(maxStaleness) ||
    maxStaleness <= 0 ||
    typeof input.amount !== 'string' ||
    !USD_AMOUNT_PATTERN.test(input.amount) ||
    input.fromCurrency !== 'USD' ||
    !isNonBlank(input.toCurrency)
  );
}

function quoteIsNotEffective(quote, decisionAt) {
  const effectiveFrom = Date.parse(quote.effectiveFrom);
  const effectiveTo = quote.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(quote.effectiveTo);
  return (
    quote.approvalStatus !== 'APPROVED' ||
    !Number.isFinite(effectiveFrom) ||
    (quote.effectiveTo !== null && !Number.isFinite(effectiveTo)) ||
    effectiveFrom >= effectiveTo ||
    decisionAt < effectiveFrom ||
    decisionAt >= effectiveTo
  );
}

function precisionIsInvalid(quote, expectedTargetMinorUnits) {
  return (
    !Number.isInteger(quote.rateScale) ||
    quote.rateScale < 2 ||
    quote.rateScale > 10 ||
    !Number.isInteger(quote.targetMinorUnits) ||
    quote.targetMinorUnits < 0 ||
    quote.targetMinorUnits > quote.rateScale ||
    !Number.isInteger(expectedTargetMinorUnits) ||
    quote.targetMinorUnits !== expectedTargetMinorUnits ||
    quote.roundingMode !== 'ROUND_HALF_UP'
  );
}

function resolveBookingRate(quote) {
  if (quote.bookingRate !== undefined) {
    return { bookingRate: normalizeRate(quote.bookingRate, quote.rateScale), rateOrigin: 'VIRTUAL_EXPLICIT' };
  }
  if (quote.buyRate !== undefined && quote.sellRate !== undefined) {
    return { bookingRate: deriveMidpoint(quote.buyRate, quote.sellRate, quote.rateScale), rateOrigin: 'DERIVED_MID' };
  }
  return null;
}

function ratesAreInvalid(quote) {
  return (
    (quote.bookingRate !== undefined && !isPositiveDecimal(quote.bookingRate, quote.rateScale)) ||
    (quote.buyRate !== undefined && !isPositiveDecimal(quote.buyRate, quote.rateScale)) ||
    (quote.sellRate !== undefined && !isPositiveDecimal(quote.sellRate, quote.rateScale))
  );
}

function buildVirtualBookingQuote(input) {
  const decisionAt = Date.parse(input.decisionTime);
  const maxStaleness = Number(input.maxStalenessSeconds);
  if (requestIsInvalid(input, decisionAt, maxStaleness) || !isPositiveDecimal(input.amount, 2, USD_AMOUNT_PATTERN)) {
    return { error: 'INVALID_FX_REQUEST' };
  }

  const pair = `${input.fromCurrency}/${input.toCurrency}`;
  const quote = input.quote;
  if (!quote) return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is unavailable for ${pair}.` };
  if (quote.simulatedFailure) {
    return {
      error: 'FX_RATE_UNAVAILABLE',
      reason: quote.simulatedFailure,
      message: `Virtual BOOKING quote failed for ${pair}.`,
    };
  }
  if (quoteIsNotEffective(quote, decisionAt)) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is not Approved/Effective for ${pair}.` };
  }

  const rateAt = Date.parse(quote.rateTimestamp);
  if (!Number.isFinite(rateAt) || rateAt > decisionAt) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote timestamp is invalid for ${pair}.` };
  }
  if (decisionAt - rateAt > maxStaleness * 1000) {
    return { error: 'FX_RATE_STALE', message: `Virtual BOOKING quote is stale for ${pair}.` };
  }
  if (precisionIsInvalid(quote, input.expectedTargetMinorUnits)) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote precision metadata is invalid for ${pair}.` };
  }
  if (!isNonBlank(quote.rateSource) || !isNonBlank(quote.providerRateId) || !isNonBlank(quote.providerRateVersion)) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote audit metadata is invalid for ${pair}.` };
  }

  try {
    if (ratesAreInvalid(quote)) throw new Error('virtual FX rate must be positive');
    const resolved = resolveBookingRate(quote);
    if (!resolved) {
      return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is incomplete for ${pair}.` };
    }
    return {
      fromCurrency: input.fromCurrency,
      toCurrency: input.toCurrency,
      requestedAmount: input.amount,
      ratePurpose: 'BOOKING',
      buyRate: quote.buyRate === undefined ? undefined : normalizeRate(quote.buyRate, quote.rateScale),
      sellRate: quote.sellRate === undefined ? undefined : normalizeRate(quote.sellRate, quote.rateScale),
      bookingRate: resolved.bookingRate,
      convertedAmount: convertToOwnerCurrency(
        input.amount,
        resolved.bookingRate,
        quote.targetMinorUnits,
        quote.rateScale,
      ),
      rateOrigin: resolved.rateOrigin,
      rateSource: quote.rateSource,
      providerRateId: quote.providerRateId,
      providerRateVersion: quote.providerRateVersion,
      rateTimestamp: quote.rateTimestamp,
      approvalStatus: 'APPROVED',
      effectiveFrom: quote.effectiveFrom,
      effectiveTo: quote.effectiveTo,
      freshnessStatus: 'FRESH',
      correlationId: input.correlationId,
      requestAttemptId: input.requestAttemptId,
      policyVersion: input.policyVersion,
    };
  } catch {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote contains an invalid rate for ${pair}.` };
  }
}

module.exports = { buildVirtualBookingQuote, convertToOwnerCurrency, deriveMidpoint };
