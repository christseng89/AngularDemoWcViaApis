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

function buildVirtualBookingQuote({
  quote,
  fromCurrency,
  toCurrency,
  expectedTargetMinorUnits,
  amount,
  decisionTime,
  correlationId,
  requestAttemptId,
  policyVersion,
  maxStalenessSeconds,
}) {
  const decisionAt = Date.parse(decisionTime);
  const maxStaleness = Number(maxStalenessSeconds);
  if (
    !Number.isFinite(decisionAt) ||
    typeof correlationId !== 'string' ||
    correlationId.trim() === '' ||
    typeof requestAttemptId !== 'string' ||
    requestAttemptId.trim() === '' ||
    typeof policyVersion !== 'string' ||
    policyVersion.trim() === '' ||
    !Number.isInteger(maxStaleness) ||
    maxStaleness <= 0 ||
    typeof amount !== 'string' ||
    !USD_AMOUNT_PATTERN.test(amount) ||
    fromCurrency !== 'USD' ||
    typeof toCurrency !== 'string' ||
    toCurrency.trim() === ''
  ) {
    return { error: 'INVALID_FX_REQUEST' };
  }
  if (!isPositiveDecimal(amount, 2, USD_AMOUNT_PATTERN)) return { error: 'INVALID_FX_REQUEST' };
  const pair = `${fromCurrency}/${toCurrency}`;
  if (!quote) return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is unavailable for ${pair}.` };
  if (quote.simulatedFailure) {
    return {
      error: 'FX_RATE_UNAVAILABLE',
      reason: quote.simulatedFailure,
      message: `Virtual BOOKING quote failed for ${pair}.`,
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
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is not Approved/Effective for ${pair}.` };
  }
  const rateAt = Date.parse(quote.rateTimestamp);
  if (!Number.isFinite(rateAt) || rateAt > decisionAt)
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote timestamp is invalid for ${pair}.` };
  if (decisionAt - rateAt > maxStaleness * 1000) {
    return { error: 'FX_RATE_STALE', message: `Virtual BOOKING quote is stale for ${pair}.` };
  }

  const rateScale = quote.rateScale;
  const targetMinorUnits = quote.targetMinorUnits;
  if (
    !Number.isInteger(rateScale) ||
    rateScale < 2 ||
    rateScale > 10 ||
    !Number.isInteger(targetMinorUnits) ||
    targetMinorUnits < 0 ||
    targetMinorUnits > rateScale ||
    !Number.isInteger(expectedTargetMinorUnits) ||
    targetMinorUnits !== expectedTargetMinorUnits ||
    quote.roundingMode !== 'ROUND_HALF_UP'
  ) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote precision metadata is invalid for ${pair}.` };
  }
  if (!isNonBlank(quote.rateSource) || !isNonBlank(quote.providerRateId) || !isNonBlank(quote.providerRateVersion)) {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote audit metadata is invalid for ${pair}.` };
  }
  try {
    if (
      (quote.bookingRate !== undefined && !isPositiveDecimal(quote.bookingRate, rateScale)) ||
      (quote.buyRate !== undefined && !isPositiveDecimal(quote.buyRate, rateScale)) ||
      (quote.sellRate !== undefined && !isPositiveDecimal(quote.sellRate, rateScale))
    ) {
      throw new Error('virtual FX rate must be positive');
    }
    let bookingRate;
    let rateOrigin;
    if (quote.bookingRate !== undefined) {
      bookingRate = normalizeRate(quote.bookingRate, rateScale);
      rateOrigin = 'VIRTUAL_EXPLICIT';
    } else if (quote.buyRate !== undefined && quote.sellRate !== undefined) {
      bookingRate = deriveMidpoint(quote.buyRate, quote.sellRate, rateScale);
      rateOrigin = 'DERIVED_MID';
    } else {
      return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote is incomplete for ${pair}.` };
    }
    return {
      fromCurrency,
      toCurrency,
      requestedAmount: amount,
      ratePurpose: 'BOOKING',
      buyRate: quote.buyRate === undefined ? undefined : normalizeRate(quote.buyRate, rateScale),
      sellRate: quote.sellRate === undefined ? undefined : normalizeRate(quote.sellRate, rateScale),
      bookingRate,
      convertedAmount: convertToOwnerCurrency(amount, bookingRate, targetMinorUnits, rateScale),
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
      requestAttemptId,
      policyVersion,
    };
  } catch {
    return { error: 'FX_RATE_UNAVAILABLE', message: `Virtual BOOKING quote contains an invalid rate for ${pair}.` };
  }
}

module.exports = { buildVirtualBookingQuote, convertToOwnerCurrency, deriveMidpoint };
