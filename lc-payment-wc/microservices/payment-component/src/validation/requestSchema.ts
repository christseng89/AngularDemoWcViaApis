/**
 * Runtime validation for PaymentInstructionConfirmRequest, matching
 * payment-instructions-post.yaml v1.6.0's PaymentInstructionConfirmRequest /
 * PaymentLegInput / SuspenseEntry / SuspenseBridge schemas field-for-field
 * (required fields, enums, decimal string patterns, minItems). Failures here
 * are OAS 400s (malformed request), distinct from the 409 business-rule
 * failures in domain/balanceValidation.ts and domain/swiftMessages.ts.
 */
import { z } from 'zod';
import {
  ORIGIN_MODULES,
  ACCOUNT_TYPES,
  PAY_INSTR_FLAGS,
  PAY_ADVICE_MSG_TYPES,
  PAY_COVER_MSG_TYPES,
  SUSPENSE_SOURCE_COMPONENTS,
  BALANCE_MODULES,
} from '../types';
import { MONETARY_AMOUNT_PATTERN, EXCHANGE_RATE_PATTERN } from '../money';
import { RequestValidationError } from '../errors';

const monetaryAmountSchema = z
  .string()
  .regex(MONETARY_AMOUNT_PATTERN, 'must be a decimal string matching MonetaryAmount pattern');

const exchangeRateSchema = z
  .string()
  .regex(EXCHANGE_RATE_PATTERN, 'must be a decimal string matching ExchangeRate pattern');

// ISO date (YYYY-MM-DD) — matches OAS `format: date`.
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

export const paymentLegInputSchema = z.object({
  accountNo: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES),
  partyId: z.string().optional(),
  partyName: z.string().optional(),
  currency: z.string().min(1),
  amountAccountCcy: monetaryAmountSchema.optional(),
  amountTxCcy: monetaryAmountSchema,
  drRate: exchangeRateSchema.optional(),
  drBuyRate: exchangeRateSchema.optional(),
  crBuyRate: exchangeRateSchema.optional(),
  sellRate: exchangeRateSchema.optional(),
  valueDate: dateSchema.optional(),
  sdaFlag: z.string().optional(),
  payAdviceMsgType: z.enum(PAY_ADVICE_MSG_TYPES).optional(),
  payCoverMsgType: z.enum(PAY_COVER_MSG_TYPES).optional(),
});

// Added v1.4.0 — see payment-instructions-post.yaml's SuspenseEntry/SuspenseBridge
// schemas and domain/suspenseBridge.ts for the expansion algorithm.
// sourceComponent/balanceModule added v1.5.0 — pure provenance/audit metadata,
// validated here but not otherwise acted on by this service (v1.5.0's
// SUSPENSE_CONTEXT_CONFLICT check was removed v1.6.0 along with chargeContext/
// liabilityContext themselves — see confirmPaymentInstruction.ts's doc comment).
const suspenseEntrySchema = z.object({
  amount: monetaryAmountSchema,
  currency: z.string().min(1),
  crossRate: exchangeRateSchema.optional(),
  sourceComponent: z.enum(SUSPENSE_SOURCE_COMPONENTS).optional(),
  balanceModule: z.enum(BALANCE_MODULES).optional(),
});

const suspenseBridgeSchema = z.object({
  debitEntries: z.array(suspenseEntrySchema).optional(),
  creditEntries: z.array(suspenseEntrySchema).optional(),
});

export const paymentInstructionConfirmRequestSchema = z
  .object({
    originModule: z.enum(ORIGIN_MODULES),
    mainRef: z.string().min(1),
    sequence: z.number().int(),
    unitCode: z.string().min(1),
    tenorType: z.string().optional(),
    tenorStartDate: dateSchema.optional(),
    maturityDate: dateSchema.optional(),
    payInstrFlag: z.enum(PAY_INSTR_FLAGS).optional(),
    debitLegs: z.array(paymentLegInputSchema).min(1, 'debitLegs must contain at least 1 item'),
    // No .min(1) here — see the superRefine below for the actual (conditional) rule.
    creditLegs: z.array(paymentLegInputSchema),
    suspenseBridge: suspenseBridgeSchema.optional(),
    /**
     * Charge Component Bridge Flag (reviewer-confirmed, 2026-08-09) — NOT part of
     * payment-instructions-post.yaml (no home in the official OAS, same situation as
     * sourceFunctionCode — see that field's doc comment in routes/paymentInstructions.ts).
     * Unlike sourceFunctionCode/voucherCodePrefixOverride/dryRun, this one is declared as a
     * real zod field (not just read out of RequestExtensions) because it participates in a
     * cross-field validation rule below, not just pass-through options.
     *
     * When true AND suspenseBridge.creditEntries has at least 1 entry, creditLegs may be
     * empty — the entire credit side is provided by the Suspense Credit bridge to a separate
     * Charge Component (see lc-payment-wc/CLAUDE.md, "Charge Component <-> Payment Component
     * boundary"), never a directly-submitted credit leg. This does not change how the balance
     * check or classification behaves — confirmPaymentInstruction.ts already expands
     * suspenseBridge.creditEntries into real credit legs before both run (v1.4.0); this flag's
     * only job is relaxing the request-shape check below so that expansion is reachable with
     * an empty creditLegs array. Omitted/false, or true with no suspenseBridge.creditEntries:
     * creditLegs must contain at least 1 item, same as every other case — this flag is
     * deliberately NOT a blanket bypass of the "must have a credit side" rule.
     */
    chargeComponentBridge: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const bridgeHasCredit = (data.suspenseBridge?.creditEntries?.length ?? 0) > 0;
    const exempt = data.chargeComponentBridge === true && bridgeHasCredit;
    if (data.creditLegs.length === 0 && !exempt) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_small,
        minimum: 1,
        type: 'array',
        inclusive: true,
        path: ['creditLegs'],
        message: 'creditLegs must contain at least 1 item',
      });
    }
  });

export type ValidatedConfirmRequest = z.infer<typeof paymentInstructionConfirmRequestSchema>;

/**
 * Body for POST /payment-instructions/classify — the Business Case Simulator's
 * preview endpoint for RPFM (GAP verdict: legs are populated in source, but no
 * voucher-assembly routine exists, so the full confirm request schema — which
 * requires originModule/mainRef/sequence/unitCode for a resource that will never
 * be created — doesn't fit). Only the two leg arrays are needed for §3 balance
 * totals + §4 classification.
 */
export const classifyRequestSchema = z.object({
  debitLegs: z.array(paymentLegInputSchema).min(1, 'debitLegs must contain at least 1 item'),
  creditLegs: z.array(paymentLegInputSchema).min(1, 'creditLegs must contain at least 1 item'),
  balanceTolerance: z.number().nonnegative().optional(),
});

export type ValidatedClassifyRequest = z.infer<typeof classifyRequestSchema>;

export function validateClassifyRequest(body: unknown): ValidatedClassifyRequest {
  const result = classifyRequestSchema.safeParse(body);
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new RequestValidationError(summary);
  }
  return result.data;
}

/**
 * Validates a raw request body against the OAS request schema.
 * Throws RequestValidationError (-> HTTP 400) with a message summarizing every
 * validation failure — not just the first — so callers can fix a request in
 * one round trip.
 */
export function validateConfirmRequest(body: unknown): ValidatedConfirmRequest {
  const result = paymentInstructionConfirmRequestSchema.safeParse(body);
  if (!result.success) {
    const summary = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new RequestValidationError(summary);
  }
  return result.data;
}
