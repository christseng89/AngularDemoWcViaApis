/**
 * Orchestrates the 5-step Confirm flow (FSD §5.4 / Payment_Component_Calculation_Validation.docx
 * §3-§7) for POST /payment-instructions in the exact order the source
 * ConfirmBusinessCall-equivalents run it, plus the idempotency check that
 * precedes all five steps (FSD §6.1).
 */
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import type { PaymentInstruction } from '../types';
import type { ValidatedConfirmRequest } from '../validation/requestSchema';
import { validateDrCrBalance, RPFM_BALANCE_TOLERANCE } from './balanceValidation';
import { classify } from './classification';
import { enrichLegs, resolveVoucherCodePrefix } from './voucherDescription';
import {
  buildSettlementEntries,
  buildChargeVoucherEntry,
  buildLiabilityVoucherEntries,
  type ChargeVoucherContext,
  type LiabilityVoucherContext,
} from './accountEntries';
import { validateSwiftCrossField, buildSwiftMessages } from './swiftMessages';
import type { PaymentInstructionStore } from '../store/paymentInstructionStore';

export interface ConfirmPaymentInstructionOptions {
  /**
   * Resolves the {MODULE}{FuncCode} voucher prefix (§5). Required unless
   * voucherCodePrefixOverride is supplied directly. NOT part of the official
   * OAS request body — see voucherDescription.ts's doc comment for why.
   */
  sourceFunctionCode?: string;
  /** Direct override, required for the two FSD rows with an unresolved dual prefix (EPLC PayAccept, EXCO SettlementAtMaturity). */
  voucherCodePrefixOverride?: string;
  /** §6.2 — omit to skip Charge Voucher generation entirely. */
  chargeContext?: ChargeVoucherContext;
  /** §6.3 — omit to skip Liability Voucher generation entirely (correct for EXCO and IMCO Pre-Payment/Payment D/P). */
  liabilityContext?: LiabilityVoucherContext;
  /** V8 tolerance override (§3/§9). Defaults to RPFM_BALANCE_TOLERANCE for originModule "RPFM", else exact equality. */
  balanceTolerance?: Decimal.Value;
  /**
   * Preview mode for the Business Case Simulator's live onChange recompute
   * (lc-payment-wc). Skips the idempotency lookup (step 0) AND the final
   * store.save — every dryRun call runs steps 1-5 fresh against the current
   * input and is never persisted, so it never collides with a real Confirm
   * using the same natural key, and never blocks on a stale cached result
   * from an earlier preview. Real (non-dryRun) Confirm semantics are
   * completely unaffected by this flag ever having been used.
   */
  dryRun?: boolean;
}

export interface ConfirmResult {
  instruction: PaymentInstruction;
  /** true -> HTTP 201 (new instruction created); false -> HTTP 200 (idempotent replay of an existing one). */
  created: boolean;
}

export function confirmPaymentInstruction(
  store: PaymentInstructionStore,
  request: ValidatedConfirmRequest,
  options: ConfirmPaymentInstructionOptions,
): ConfirmResult {
  // Step 0 (FSD §6.1): idempotent replay — return the existing result without
  // re-running any of steps 1-5, so GL/SWIFT output is never re-triggered.
  // Skipped entirely in dryRun mode (see ConfirmPaymentInstructionOptions.dryRun).
  if (!options.dryRun) {
    const existing = store.find(request.originModule, request.mainRef, request.sequence);
    if (existing) {
      return { instruction: existing, created: false };
    }
  }

  // Step 1 (§3): Dr/Cr balance validation (V8) — throws BusinessValidationError (409) on failure.
  const tolerance = options.balanceTolerance ?? (request.originModule === 'RPFM' ? RPFM_BALANCE_TOLERANCE : 0);
  validateDrCrBalance(request.debitLegs, request.creditLegs, tolerance);

  const instructionId = randomUUID();

  // Step 2 (§4): classification — informational only, never blocks, never gates step 4.
  const classification = classify(instructionId, request.debitLegs, request.creditLegs);

  // Step 3 (§5): voucher description code assembly per leg.
  const voucherCodePrefix =
    options.voucherCodePrefixOverride ?? resolveVoucherCodePrefix(request.originModule, options.sourceFunctionCode ?? '');
  const debitLegs = enrichLegs(request.debitLegs, 'DEBIT', voucherCodePrefix);
  const creditLegs = enrichLegs(request.creditLegs, 'CREDIT', voucherCodePrefix);

  // Step 4 (§6): Account Entry generation — unconditional, independent of classification.
  const accountEntries = [
    ...buildSettlementEntries(instructionId, debitLegs, 'DEBIT'),
    ...buildSettlementEntries(instructionId, creditLegs, 'CREDIT'),
  ];
  if (options.chargeContext) {
    accountEntries.push(buildChargeVoucherEntry(instructionId, options.chargeContext).entry);
  }
  if (options.liabilityContext) {
    accountEntries.push(...buildLiabilityVoucherEntries(instructionId, options.liabilityContext));
  }

  // Step 5 (§7): SWIFT cross-field validation (409 on violation), then message generation.
  validateSwiftCrossField(creditLegs);
  const swiftMessages = buildSwiftMessages(instructionId, creditLegs);

  const instruction: PaymentInstruction = {
    instructionId,
    sequence: request.sequence,
    originModule: request.originModule,
    mainRef: request.mainRef,
    tenorType: request.tenorType,
    maturityDate: request.maturityDate,
    payInstrFlag: request.payInstrFlag,
    unpaidFlag: false,
    debitLegs,
    creditLegs,
    classification,
    accountEntries,
    swiftMessages,
  };

  if (options.dryRun) {
    return { instruction, created: false };
  }

  store.save(instruction);
  return { instruction, created: true };
}
