/**
 * zod request-shape validation for `POST /balance-movements` — introduced to close
 * Quality-report-balance.md BAL-116 ("zod is a declared dependency but never used — request
 * validation is manual presence checks only").
 *
 * Deliberately scoped to EXACTLY what `routes/balanceMovements.ts` already hand-checked before this
 * (presence of the 6 always-required fields, the `MONETARY_AMOUNT_PATTERN` shape check, and the
 * currency-decimal-scale check) — every other field on `CreateMovementRequest` (`naturalKey`,
 * `balanceContractId`, `tolerancePct`, `tenorType`, `parentLogicalContractId`, `sourceTransactionRef`,
 * etc.) is passed through untouched via `.passthrough()`, not re-validated here, so this consolidation
 * doesn't silently expand or narrow what's accepted — root-cause fix (a real schema instead of ad-hoc
 * `if` checks), not a scope change. Mirrors
 * `lc-payment-wc/microservices/payment-component/src/validation/requestSchema.ts`'s own file location
 * and "consolidate the hand-rolled checks into one declarative schema" convention (see that file for
 * the sibling project's more extensive example, since this project's own request shape has fewer
 * cross-field rules to enforce).
 */
import { z } from 'zod';
import { MONETARY_AMOUNT_PATTERN, describeAmountScaleViolation } from '../money';

export const createMovementRequestSchema = z
  .object({
    instrumentType: z.string({ required_error: 'instrumentType is required.' }).min(1, 'instrumentType is required.'),
    movementType: z.string({ required_error: 'movementType is required.' }).min(1, 'movementType is required.'),
    eventSeq: z.number({ required_error: 'eventSeq is required.', invalid_type_error: 'eventSeq must be a number.' }),
    amount: z.string({ required_error: 'amount is required.' }).min(1, 'amount is required.'),
    /**
     * OAS-GAP-16 direction (a), 2026-08-22 — CURRENCY DERIVATION (balance-component-api.yaml, documented
     * since v1.0.0, now genuinely enforced): required only for a genuinely root new Logical Contract; the
     * service layer (resolveOrCreateContract()) is what actually enforces "required when there's nothing
     * to derive it from" — this schema can't know at validation time whether a contract/parent will
     * resolve, so it only rejects a present-but-empty string here, never absence itself.
     */
    currency: z.string().min(1, 'currency, if supplied, must not be empty.').optional(),
    createdBy: z.string({ required_error: 'createdBy is required.' }).min(1, 'createdBy is required.'),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    // The pattern check comes first, deliberately — describeAmountScaleViolation()/decimalPlaces()
    // assume an already pattern-valid string (see money.ts's own doc comments), so a malformed amount
    // is reported once, not twice.
    if (!MONETARY_AMOUNT_PATTERN.test(data.amount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: `amount "${data.amount}" is not a valid MonetaryAmount (expected ${MONETARY_AMOUNT_PATTERN}).`,
      });
      return;
    }
    // currency is now optional (OAS-GAP-16 direction (a)) — when omitted, this layer has no contract to
    // derive one from, so the scale check is skipped here and re-run server-side in
    // BalanceService.createMovement() against the resolved contract's own currency instead.
    if (data.currency) {
      const scaleViolation = describeAmountScaleViolation(data.amount, data.currency);
      if (scaleViolation) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: scaleViolation });
      }
    }
  });

/**
 * This route has always surfaced ONE message at a time (the hand-rolled checks it replaced were
 * sequential early-returns) — matches that convention by taking only the first zod issue rather than
 * concatenating all of them, so an existing caller parsing this field for a single sentence still gets
 * one.
 */
export function firstValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request.';
}
