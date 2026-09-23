import type { Db } from '../db';
import type { CurrencyExchangeQuote } from '../integration/currencyExchange';

export class FxRateSnapshotStore {
  constructor(private readonly db: Db) {}

  insert(input: {
    fxSnapshotId: string;
    movementId: string;
    decisionPoint: 'MAKER_SUBMIT' | 'CHECKER_RELEASE' | 'FIX_PENDING';
    quote: CurrencyExchangeQuote;
    createdAt: string;
  }): void {
    const { quote } = input;
    const attemptId = quote.requestAttemptId ?? (quote.rateOrigin === 'USD_PAR' ? 'USD_PAR' : null);
    if (!attemptId) throw new Error('Provider FX snapshot requires requestAttemptId.');
    this.db
      .prepare(
        `INSERT INTO fx_rate_snapshots (
          fx_snapshot_id, movement_id, decision_point, from_currency, to_currency, requested_amount_usd,
          rate_purpose, booking_rate, converted_amount_owner, rate_source, provider_rate_id,
          provider_rate_version, request_attempt_id, rate_timestamp, approval_status, effective_from,
          effective_to, freshness_status, rate_origin, correlation_id, policy_version, fallback_reason,
          rate_date, fallback_policy_id, fallback_policy_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'FRESH', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.fxSnapshotId,
        input.movementId,
        input.decisionPoint,
        quote.fromCurrency,
        quote.toCurrency,
        quote.requestedAmount,
        quote.ratePurpose,
        quote.bookingRate,
        quote.convertedAmount,
        quote.rateSource,
        quote.providerRateId,
        quote.providerRateVersion,
        attemptId,
        quote.rateTimestamp,
        quote.approvalStatus,
        quote.effectiveFrom,
        quote.effectiveTo,
        quote.rateOrigin,
        quote.correlationId,
        quote.policyVersion,
        quote.fallbackReason ?? null,
        quote.rateDate ?? null,
        quote.fallbackPolicyId ?? null,
        quote.fallbackPolicyVersion ?? null,
        input.createdAt,
      );
  }
}
