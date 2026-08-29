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
    currency: z.string({ required_error: 'currency is required.' }).min(1, 'currency is required.'),
    createdBy: z.string({ required_error: 'createdBy is required.' }).min(1, 'createdBy is required.'),
    // F1 proposal §13.1 item 2 (BA-ratified 2026-08-25) — AMEND_EXPIRY_DATE/REOPEN's own upstream
    // consent passthrough. Optional/nullable for every OTHER movementType (never required — this
    // service accepts and shape-validates, it never judges whether consent was actually obtained).
    // `consentStatus` is the one field with a real bounded value set; `amendmentApproved`/
    // `amendmentEffective` are only type-checked (boolean / non-empty string), not enum-restricted.
    amendmentApproved: z.boolean().nullable().optional(),
    amendmentEffective: z.string().min(1).nullable().optional(),
    consentStatus: z.enum(['NOT_REQUIRED', 'OBTAINED']).nullable().optional(),
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
    const scaleViolation = describeAmountScaleViolation(data.amount, data.currency);
    if (scaleViolation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: scaleViolation });
    }
  });

/**
 * Fix Pending `POST /balance-movements/:movementId/edit` (analysis/Balance-Component-FixPending-
 * DeletePending-Proposal-zh.md §2.2/§15/§19, 2026-08-27) — `service/balanceService.ts`'s own
 * `EditMovementRequest` doc comment explains why this is an ALLOWLIST, not a `.partial()` of
 * `createMovementRequestSchema` above: `.strict()` here means any locked field (`naturalKey`,
 * `balanceContractId`, `instrumentType`, `movementType`, `currency`, `eventSeq`, `createdBy`,
 * `sourceTransactionRef` — the movement's own business "2ndary Key", excluded for the same reason
 * §15 excludes LC Number/IB-SG Number) is rejected by zod itself as an unrecognized key, rather than
 * needing a hand-written "did the caller try to change this" check that could drift out of sync with
 * `EditMovementRequest`'s own field list.
 */
export const editMovementRequestSchema = z
  .object({
    amount: z.string({ required_error: 'amount is required.' }).min(1, 'amount is required.'),
    editedBy: z.string({ required_error: 'editedBy is required.' }).min(1, 'editedBy is required.'),
    editMode: z.enum(['STANDARD', 'REMARKS_ONLY']).optional(),
    remarks: z.string().max(500, 'remarks must not exceed 500 characters.').nullable().optional(),
    legRef: z.string().nullable().optional(),
    accountEntries: z.array(z.record(z.unknown())).nullable().optional(),
    businessEventId: z.string().nullable().optional(),
    exposureNature: z.enum(['CONTINGENT', 'ACTUAL', 'MEMO']).optional(),
    newExpiryDate: z.string().nullable().optional(),
    transactionDate: z.string().nullable().optional(),
    businessDate: z.string().nullable().optional(),
    valueDate: z.string().nullable().optional(),
    sourceModule: z.string().nullable().optional(),
    sourceFunction: z.string().nullable().optional(),
    referencedTransactionId: z.string().nullable().optional(),
    reasonCode: z.string().nullable().optional(),
    amendmentApproved: z.boolean().nullable().optional(),
    amendmentEffective: z.string().min(1).nullable().optional(),
    consentStatus: z.enum(['NOT_REQUIRED', 'OBTAINED']).nullable().optional(),
    // Contract-level fields (2026-08-28, per direct user feedback — "為什麼只有amount可以改...
    // Expiry Date, Tenor Type etc.?") — accepted here regardless of movementType (this schema has no
    // access to what the target movement's own movementType is); `BalanceService.editPending()`'s own
    // `isCreatingEdit` gate is what actually decides whether they take effect (silently ignored for a
    // non-creating edit, same posture other passthrough-only fields already have).
    tolerancePct: z.string().nullable().optional(),
    tenorType: z.enum(['SIGHT', 'SELLERS_USANCE', 'BUYERS_USANCE']).nullable().optional(),
    tenorDays: z.number().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    mailFloatGraceDays: z.number().nullable().optional(),
  })
  .strict('Unrecognized or locked field in Fix Pending request — naturalKey/balanceContractId/instrumentType/movementType/currency/eventSeq/createdBy/sourceTransactionRef cannot be changed via Fix Pending.')
  .superRefine((data, ctx) => {
    if (!MONETARY_AMOUNT_PATTERN.test(data.amount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: `amount "${data.amount}" is not a valid MonetaryAmount (expected ${MONETARY_AMOUNT_PATTERN}).`,
      });
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
