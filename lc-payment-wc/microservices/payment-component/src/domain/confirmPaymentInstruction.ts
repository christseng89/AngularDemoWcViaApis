/**
 * Orchestrates the Confirm flow (FSD §5.4 / Payment_Component_Calculation_Validation.docx
 * §3-§7) for POST /payment-instructions in the exact order the source
 * ConfirmBusinessCall-equivalents run it, plus the idempotency check that
 * precedes all steps (FSD §6.1), and — added v1.4.0, NOT part of the legacy
 * trace — suspenseBridge expansion, which runs before step 1 so the balance
 * check already sees the bridge's legs (see domain/suspenseBridge.ts).
 *
 * v1.6.0 architecture decision, NOT legacy-traced: the §6.2 Charge Voucher
 * and §6.3 Liability Voucher streams (chargeContext/liabilityContext) were
 * removed from this service entirely. A Balance Component or Charge
 * Component that participates via suspenseBridge books ITS OWN leg on its
 * own books — e.g. Balance Component: "Dr IBL / Cr Suspense"; this service
 * then only books its own offsetting leg — e.g. "Dr Suspense / Cr Nostro".
 * Every leg this service posts is therefore an ordinary Settlement leg
 * (§6.1) — SuspenseEntry.sourceComponent (types.ts) is pure provenance/audit
 * metadata, never a trigger for Charge/Liability Account Entry generation,
 * because this service no longer generates those at all. (v1.5.0 had
 * instead kept chargeContext/liabilityContext alongside a
 * SUSPENSE_CONTEXT_CONFLICT guard rail preventing the two from coexisting;
 * v1.6.0 removed the legacy path outright rather than keep guarding against
 * a combination that no longer needs to exist.)
 */
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import type { PaymentInstruction } from '../types';
import type { ValidatedConfirmRequest } from '../validation/requestSchema';
import { validateDrCrBalance, RPFM_BALANCE_TOLERANCE } from './balanceValidation';
import { classify } from './classification';
import { enrichLegs, resolveVoucherCodePrefix } from './voucherDescription';
import { buildSettlementEntries } from './accountEntries';
import { expandSuspenseBridge } from './suspenseBridge';
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

  // v1.4.0: expand suspenseBridge (if present) into additional legs BEFORE step 1,
  // so the balance check already sees them (see domain/suspenseBridge.ts). Transaction
  // currency = debitLegs[0].currency, per payment-instructions-post.yaml's SuspenseEntry
  // doc comment; the `!` reflects debitLegs' zod-enforced minItems:1, not a `?? []`
  // fallback for a condition that can't reach this line. v1.7.0: also passes the
  // caller's own debitLegs/creditLegs through — expandSuspenseBridge nets each
  // foreign-currency Suspense bucket against same-currency legs on the matching side.
  const transactionCurrency = request.debitLegs[0]!.currency;
  const bridge = expandSuspenseBridge(request.suspenseBridge, transactionCurrency, request.debitLegs, request.creditLegs);
  const debitLegsInput = [...request.debitLegs, ...bridge.debit];
  const creditLegsInput = [...request.creditLegs, ...bridge.credit];

  // Step 1 (§3): Dr/Cr balance validation (V8) — throws BusinessValidationError (409) on failure.
  const tolerance = options.balanceTolerance ?? (request.originModule === 'RPFM' ? RPFM_BALANCE_TOLERANCE : 0);
  validateDrCrBalance(debitLegsInput, creditLegsInput, tolerance);

  const instructionId = randomUUID();

  // Step 2 (§4): classification — informational only, never blocks, never gates step 4.
  const classification = classify(instructionId, debitLegsInput, creditLegsInput);

  // Step 3 (§5): voucher description code assembly per leg.
  const voucherCodePrefix =
    options.voucherCodePrefixOverride ?? resolveVoucherCodePrefix(request.originModule, options.sourceFunctionCode ?? '');
  const debitLegs = enrichLegs(debitLegsInput, 'DEBIT', voucherCodePrefix);
  const creditLegs = enrichLegs(creditLegsInput, 'CREDIT', voucherCodePrefix);

  // Step 4 (§6.1): Settlement Account Entry generation — unconditional, independent of
  // classification. §6.2/§6.3 removed v1.6.0 — see this file's header doc comment.
  const accountEntries = [
    ...buildSettlementEntries(instructionId, debitLegs, 'DEBIT'),
    ...buildSettlementEntries(instructionId, creditLegs, 'CREDIT'),
  ];

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
